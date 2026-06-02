//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;

const lock_key = (id: string) => `aster:app_lock:${id}`;
const session_key = (id: string) => `aster:app_unlocked:${id}`;
const attempts_key = (id: string) => `aster:app_lock_attempts:${id}`;

export interface AppLockConfig {
  enabled: boolean;
  pin_type: "numeric" | "text";
  digits: number;
  pin_hash: string;
  pin_salt: string;
}

interface AttemptState {
  count: number;
  locked_until: number | null;
  lockout_count: number;
}

function get_attempt_state(account_id: string): AttemptState {
  try {
    const raw = sessionStorage.getItem(attempts_key(account_id))
      ?? localStorage.getItem(attempts_key(account_id));
    if (!raw) return { count: 0, locked_until: null, lockout_count: 0 };
    return JSON.parse(raw) as AttemptState;
  } catch {
    return { count: 0, locked_until: null, lockout_count: 0 };
  }
}

export function is_locked_out(account_id: string): { locked: boolean; remaining_ms: number } {
  const state = get_attempt_state(account_id);
  if (state.locked_until !== null && Date.now() < state.locked_until) {
    return { locked: true, remaining_ms: state.locked_until - Date.now() };
  }
  if (state.locked_until !== null) {
    localStorage.removeItem(attempts_key(account_id));
  }
  return { locked: false, remaining_ms: 0 };
}

function record_failed_attempt(account_id: string): { locked: boolean; attempts_remaining: number } {
  const state = get_attempt_state(account_id);
  const new_count = state.count + 1;
  const now_locked = new_count >= MAX_ATTEMPTS;
  const new_lockout_count = now_locked ? state.lockout_count + 1 : state.lockout_count;
  const lockout_ms = now_locked
    ? Math.min(BASE_LOCKOUT_MS * Math.pow(2, state.lockout_count), MAX_LOCKOUT_MS)
    : 0;
  const new_state: AttemptState = {
    count: now_locked ? 0 : new_count,
    locked_until: now_locked ? Date.now() + lockout_ms : null,
    lockout_count: new_lockout_count,
  };
  sessionStorage.setItem(attempts_key(account_id), JSON.stringify(new_state));
  localStorage.removeItem(attempts_key(account_id));
  return { locked: now_locked, attempts_remaining: Math.max(0, MAX_ATTEMPTS - new_count) };
}

function reset_attempts(account_id: string): void {
  const state = get_attempt_state(account_id);
  localStorage.removeItem(attempts_key(account_id));
  if (state.lockout_count > 0) {
    sessionStorage.setItem(attempts_key(account_id), JSON.stringify({ count: 0, locked_until: null, lockout_count: 0 }));
  } else {
    sessionStorage.removeItem(attempts_key(account_id));
  }
}

function constant_time_equal(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function get_app_lock_config(account_id: string): AppLockConfig | null {
  try {
    const raw = localStorage.getItem(lock_key(account_id));
    if (!raw) return null;
    return JSON.parse(raw) as AppLockConfig;
  } catch {
    return null;
  }
}

const hint_key = (id: string) => `aster:app_lock_hint:${id}`;

export function save_app_lock_config(account_id: string, config: AppLockConfig): void {
  localStorage.setItem(lock_key(account_id), JSON.stringify(config));
  if (config.enabled) localStorage.setItem(hint_key(account_id), "1");
}

export function clear_app_lock_config(account_id: string): void {
  localStorage.removeItem(lock_key(account_id));
  localStorage.removeItem(hint_key(account_id));
  localStorage.removeItem(attempts_key(account_id));
  sessionStorage.removeItem(attempts_key(account_id));
}

export function get_lock_hint(account_id: string): boolean {
  if (!account_id) return false;
  return localStorage.getItem(hint_key(account_id)) === "1";
}

export function generate_pin_salt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

export async function hash_pin(pin: string, salt: Uint8Array): Promise<string> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key_material,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verify_pin(
  account_id: string,
  pin: string,
): Promise<{ ok: boolean; locked: boolean; attempts_remaining: number }> {
  const lockout = is_locked_out(account_id);
  if (lockout.locked) return { ok: false, locked: true, attempts_remaining: 0 };

  const config = get_app_lock_config(account_id);
  if (!config || !config.enabled || !config.pin_hash || !config.pin_salt) {
    return { ok: false, locked: false, attempts_remaining: MAX_ATTEMPTS };
  }

  const salt_pairs = config.pin_salt.match(/.{2}/g);
  if (!salt_pairs) return { ok: false, locked: false, attempts_remaining: MAX_ATTEMPTS };
  const salt_bytes = Uint8Array.from(salt_pairs.map((h) => parseInt(h, 16)));
  const computed = await hash_pin(pin, salt_bytes);
  const ok = constant_time_equal(computed, config.pin_hash);

  if (ok) {
    reset_attempts(account_id);
    return { ok: true, locked: false, attempts_remaining: MAX_ATTEMPTS };
  }

  const result = record_failed_attempt(account_id);
  return { ok: false, locked: result.locked, attempts_remaining: result.attempts_remaining };
}

export function is_session_unlocked(account_id: string): boolean {
  return sessionStorage.getItem(session_key(account_id)) === "1";
}

export function mark_session_unlocked(account_id: string): void {
  sessionStorage.setItem(session_key(account_id), "1");
}

export function clear_session_unlock(account_id: string): void {
  sessionStorage.removeItem(session_key(account_id));
}
