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
import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
  safe_session_get,
  safe_session_keys,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";

const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;

// Device-bound pepper, stored in IndexedDB (not localStorage). Mixing it into
// the PIN hash means an attacker who only exfiltrates localStorage cannot
// offline brute-force the (small) PIN keyspace. Versioned: configs without
// kdf_version are legacy and verify exactly as before (no pepper), so existing
// users are never affected. Pepper reads are fail-safe.
const PEPPER_DB = "aster_app_lock";
const PEPPER_STORE = "pepper";

export const KDF_VERSION_PEPPER = 2;

function open_pepper_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PEPPER_DB, 1);

    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PEPPER_STORE)) {
        req.result.createObjectStore(PEPPER_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read_pepper(account_id: string): Promise<Uint8Array | null> {
  try {
    const db = await open_pepper_db();

    return await new Promise<Uint8Array | null>((resolve) => {
      const tx = db.transaction(PEPPER_STORE, "readonly");
      const req = tx.objectStore(PEPPER_STORE).get(account_id);

      req.onsuccess = () => {
        const val = req.result;

        resolve(val instanceof Uint8Array ? val : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function ensure_pepper(
  account_id: string,
): Promise<Uint8Array | null> {
  const existing = await read_pepper(account_id);

  if (existing) return existing;
  try {
    const pepper = new Uint8Array(32);

    crypto.getRandomValues(pepper);
    const db = await open_pepper_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PEPPER_STORE, "readwrite");

      tx.objectStore(PEPPER_STORE).put(pepper, account_id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return pepper;
  } catch {
    return null;
  }
}

async function pepper_for_config(
  account_id: string,
  config: AppLockConfig,
): Promise<Uint8Array | undefined> {
  if (config.kdf_version !== KDF_VERSION_PEPPER) return undefined;

  return (await read_pepper(account_id)) ?? undefined;
}

const lock_key = (id: string) => `aster:app_lock:${id}`;
const session_key = (id: string) => `aster:app_unlocked:${id}`;
const attempts_key = (id: string) => `aster:app_lock_attempts:${id}`;

export interface AppLockConfig {
  enabled: boolean;
  pin_type: "numeric" | "text";
  digits: number;
  pin_hash: string;
  pin_salt: string;
  duress_pin_hash?: string;
  duress_pin_salt?: string;
  duress_tag?: string;
  kdf_version?: number;
}

const DURESS_TAG_PLAINTEXT = "aster-duress-on1";
const DURESS_TAG_NONCE_BYTES = 12;
const DURESS_TAG_BYTES = DURESS_TAG_NONCE_BYTES + 16 + 16;

function random_hex(byte_count: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(byte_count)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex_to_bytes(hex: string | undefined): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) return null;
  const pairs = hex.match(/.{2}/g) ?? [];

  return Uint8Array.from(pairs.map((h) => parseInt(h, 16)));
}

function bytes_to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function with_decoy_duress(config: AppLockConfig): AppLockConfig {
  if (config.duress_pin_hash && config.duress_pin_salt) return config;

  return {
    ...config,
    duress_pin_hash: random_hex(32),
    duress_pin_salt: random_hex(16),
    duress_tag: random_hex(DURESS_TAG_BYTES),
  };
}

function duress_tag_aad(account_id: string, duress_salt: string): Uint8Array {
  return new TextEncoder().encode(
    `aster.duress_tag.v1:${account_id}:${duress_salt}`,
  );
}

async function duress_tag_key(): Promise<CryptoKey | null> {
  try {
    const { get_or_create_derived_encryption_crypto_key } = await import(
      "@/services/crypto/memory_key_store"
    );

    return await get_or_create_derived_encryption_crypto_key();
  } catch {
    return null;
  }
}

async function seal_duress_tag(
  account_id: string,
  duress_salt: string,
): Promise<string | null> {
  const key = await duress_tag_key();

  if (!key) return null;
  try {
    const nonce = crypto.getRandomValues(new Uint8Array(DURESS_TAG_NONCE_BYTES));
    const sealed = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: duress_tag_aad(account_id, duress_salt),
      },
      key,
      new TextEncoder().encode(DURESS_TAG_PLAINTEXT),
    );
    const combined = new Uint8Array(nonce.length + sealed.byteLength);

    combined.set(nonce, 0);
    combined.set(new Uint8Array(sealed), nonce.length);

    return bytes_to_hex(combined);
  } catch {
    return null;
  }
}

async function open_duress_tag(
  account_id: string,
  duress_salt: string,
  tag: string,
): Promise<boolean> {
  const bytes = hex_to_bytes(tag);

  if (!bytes || bytes.length !== DURESS_TAG_BYTES) return false;
  const key = await duress_tag_key();

  if (!key) return false;
  try {
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(0, DURESS_TAG_NONCE_BYTES),
        additionalData: duress_tag_aad(account_id, duress_salt),
      },
      key,
      bytes.slice(DURESS_TAG_NONCE_BYTES),
    );

    return new TextDecoder().decode(opened) === DURESS_TAG_PLAINTEXT;
  } catch {
    return false;
  }
}

interface AttemptState {
  count: number;
  locked_until: number | null;
  lockout_count: number;
}

function get_attempt_state(account_id: string): AttemptState {
  try {
    const raw = safe_local_get(attempts_key(account_id));

    if (!raw) return { count: 0, locked_until: null, lockout_count: 0 };

    return JSON.parse(raw) as AttemptState;
  } catch {
    return { count: 0, locked_until: null, lockout_count: 0 };
  }
}

export function is_locked_out(account_id: string): {
  locked: boolean;
  remaining_ms: number;
} {
  const state = get_attempt_state(account_id);

  if (state.locked_until !== null && Date.now() < state.locked_until) {
    return { locked: true, remaining_ms: state.locked_until - Date.now() };
  }
  if (state.locked_until !== null) {
    if (state.lockout_count > 0) {
      safe_local_set(
        attempts_key(account_id),
        JSON.stringify({
          count: 0,
          locked_until: null,
          lockout_count: state.lockout_count,
        }),
      );
    } else {
      safe_local_remove(attempts_key(account_id));
    }
  }

  return { locked: false, remaining_ms: 0 };
}

function record_failed_attempt(account_id: string): {
  locked: boolean;
  attempts_remaining: number;
} {
  const state = get_attempt_state(account_id);
  const new_count = state.count + 1;
  const now_locked = new_count >= MAX_ATTEMPTS;
  const new_lockout_count = now_locked
    ? state.lockout_count + 1
    : state.lockout_count;
  const lockout_ms = now_locked
    ? Math.min(
        BASE_LOCKOUT_MS * Math.pow(2, state.lockout_count),
        MAX_LOCKOUT_MS,
      )
    : 0;
  const new_state: AttemptState = {
    count: now_locked ? 0 : new_count,
    locked_until: now_locked ? Date.now() + lockout_ms : null,
    lockout_count: new_lockout_count,
  };

  safe_local_set(attempts_key(account_id), JSON.stringify(new_state));

  return {
    locked: now_locked,
    attempts_remaining: Math.max(0, MAX_ATTEMPTS - new_count),
  };
}

function reset_attempts(account_id: string): void {
  const state = get_attempt_state(account_id);

  if (state.lockout_count > 0) {
    safe_local_set(
      attempts_key(account_id),
      JSON.stringify({ count: 0, locked_until: null, lockout_count: 0 }),
    );
  } else {
    safe_local_remove(attempts_key(account_id));
  }
}

const HASH_HEX_LEN = 64;

function constant_time_equal(a: string, b: string): boolean {
  let diff = a.length ^ b.length;

  for (let i = 0; i < HASH_HEX_LEN; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return diff === 0;
}

export function get_app_lock_config(account_id: string): AppLockConfig | null {
  try {
    const raw = safe_local_get(lock_key(account_id));

    if (!raw) return null;

    return JSON.parse(raw) as AppLockConfig;
  } catch {
    return null;
  }
}

const hint_key = (id: string) => `aster:app_lock_hint:${id}`;
const NATIVE_HINT_PREFIX = "aster:app_lock_native_hint:";
const native_hint_key = (id: string) => `${NATIVE_HINT_PREFIX}${id}`;

export function save_native_lock_hint(account_id: string): void {
  if (!account_id) return;
  safe_local_set(native_hint_key(account_id), "1");
}

export function clear_native_lock_hint(account_id: string): void {
  if (!account_id) return;
  safe_local_remove(native_hint_key(account_id));
}

export function has_pending_native_lock_hint(): boolean {
  try {
    return safe_local_keys().some(
      (key) =>
        key.startsWith(NATIVE_HINT_PREFIX) && safe_local_get(key) === "1",
    );
  } catch {
    return false;
  }
}

export function save_app_lock_config(
  account_id: string,
  config: AppLockConfig,
): void {
  safe_local_set(
    lock_key(account_id),
    JSON.stringify(with_decoy_duress(config)),
  );
  if (config.enabled) safe_local_set(hint_key(account_id), "1");
}

export function clear_app_lock_config(account_id: string): void {
  safe_local_remove(lock_key(account_id));
  safe_local_remove(hint_key(account_id));
  safe_local_remove(attempts_key(account_id));
  safe_session_remove(attempts_key(account_id));
}

export function has_pending_lock_hint(): boolean {
  try {
    const prefix = "aster:app_lock_hint:";

    return safe_local_keys().some((key) => {
      if (!key.startsWith(prefix)) return false;
      if (safe_local_get(key) !== "1") return false;

      return !is_session_unlocked(key.slice(prefix.length));
    });
  } catch {
    return false;
  }
}

export function get_lock_hint(account_id: string): boolean {
  if (!account_id) return false;

  return safe_local_get(hint_key(account_id)) === "1";
}

export function generate_pin_salt(): Uint8Array {
  const salt = new Uint8Array(16);

  crypto.getRandomValues(salt);

  return salt;
}

export async function hash_pin(
  pin: string,
  salt: Uint8Array,
  pepper?: Uint8Array,
): Promise<string> {
  const pin_bytes = new TextEncoder().encode(pin);
  let key_input: Uint8Array = pin_bytes;

  if (pepper && pepper.length > 0) {
    key_input = new Uint8Array(pepper.length + pin_bytes.length);
    key_input.set(pepper, 0);
    key_input.set(pin_bytes, pepper.length);
  }
  const key_material = await crypto.subtle.importKey(
    "raw",
    key_input,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 300000, hash: "SHA-256" },
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

  if (!salt_pairs)
    return { ok: false, locked: false, attempts_remaining: MAX_ATTEMPTS };
  const salt_bytes = Uint8Array.from(salt_pairs.map((h) => parseInt(h, 16)));
  const pepper = await pepper_for_config(account_id, config);
  const computed = await hash_pin(pin, salt_bytes, pepper);
  const ok = constant_time_equal(computed, config.pin_hash);

  if (ok) {
    reset_attempts(account_id);

    return { ok: true, locked: false, attempts_remaining: MAX_ATTEMPTS };
  }

  const result = record_failed_attempt(account_id);

  return {
    ok: false,
    locked: result.locked,
    attempts_remaining: result.attempts_remaining,
  };
}

export function is_session_unlocked(account_id: string): boolean {
  return safe_session_get(session_key(account_id)) === "1";
}

export function mark_session_unlocked(account_id: string): void {
  safe_session_set(session_key(account_id), "1");
}

export function clear_session_unlock(account_id: string): void {
  safe_session_remove(session_key(account_id));
}

export async function has_duress_pin(account_id: string): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (!config?.duress_pin_hash || !config.duress_pin_salt) return false;

  if (config.duress_tag === undefined) {
    const tag = await seal_duress_tag(account_id, config.duress_pin_salt);

    if (tag) save_app_lock_config(account_id, { ...config, duress_tag: tag });

    return true;
  }

  return open_duress_tag(account_id, config.duress_pin_salt, config.duress_tag);
}

export async function save_duress_pin(
  account_id: string,
  pin_hash: string,
  pin_salt: string,
): Promise<void> {
  const config = get_app_lock_config(account_id);

  if (!config) return;
  const tag = await seal_duress_tag(account_id, pin_salt);
  const { duress_tag: _t, ...rest } = config;

  save_app_lock_config(account_id, {
    ...rest,
    duress_pin_hash: pin_hash,
    duress_pin_salt: pin_salt,
    ...(tag ? { duress_tag: tag } : {}),
  });
}

export function clear_duress_pin(account_id: string): void {
  const config = get_app_lock_config(account_id);

  if (!config) return;
  const {
    duress_pin_hash: _h,
    duress_pin_salt: _s,
    duress_tag: _t,
    ...rest
  } = config;

  save_app_lock_config(account_id, rest as AppLockConfig);
}

export type PinOutcome =
  | { outcome: "unlocked" }
  | { outcome: "duress" }
  | { outcome: "failed"; locked: boolean; attempts_remaining: number }
  | { outcome: "locked_out"; remaining_ms: number };

function parse_hex_salt(hex: string | undefined): Uint8Array | null {
  const pairs = hex?.match(/.{2}/g);

  return pairs ? Uint8Array.from(pairs.map((h) => parseInt(h, 16))) : null;
}

export async function attempt_pin_unlock(
  account_id: string,
  pin: string,
): Promise<PinOutcome> {
  const lockout = is_locked_out(account_id);
  const config = get_app_lock_config(account_id);
  const salt_bytes =
    config?.enabled && config.pin_hash ? parse_hex_salt(config.pin_salt) : null;

  if (!config || !salt_bytes) {
    return lockout.locked
      ? { outcome: "locked_out", remaining_ms: lockout.remaining_ms }
      : { outcome: "failed", locked: false, attempts_remaining: MAX_ATTEMPTS };
  }

  const pepper = await pepper_for_config(account_id, config);
  const duress_salt = config.duress_pin_hash
    ? parse_hex_salt(config.duress_pin_salt)
    : null;

  const [computed, duress_computed] = await Promise.all([
    hash_pin(pin, salt_bytes, pepper),
    hash_pin(
      pin,
      duress_salt ?? crypto.getRandomValues(new Uint8Array(salt_bytes.length)),
      pepper,
    ),
  ]);

  const duress_match =
    duress_salt !== null &&
    constant_time_equal(duress_computed, config.duress_pin_hash!);
  const regular_match = constant_time_equal(computed, config.pin_hash);

  if (duress_match) return { outcome: "duress" };

  if (lockout.locked)
    return { outcome: "locked_out", remaining_ms: lockout.remaining_ms };

  if (regular_match) {
    reset_attempts(account_id);

    return { outcome: "unlocked" };
  }

  const result = record_failed_attempt(account_id);

  return {
    outcome: "failed",
    locked: result.locked,
    attempts_remaining: result.attempts_remaining,
  };
}

export async function pin_matches_regular(
  account_id: string,
  raw_pin: string,
): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (!config?.pin_hash || !config?.pin_salt) return false;
  const salt_pairs = config.pin_salt.match(/.{2}/g);

  if (!salt_pairs) return false;
  const salt_bytes = Uint8Array.from(salt_pairs.map((h) => parseInt(h, 16)));
  const pepper = await pepper_for_config(account_id, config);
  const computed = await hash_pin(raw_pin, salt_bytes, pepper);

  return constant_time_equal(computed, config.pin_hash);
}

export async function duress_pin_correct(
  account_id: string,
  raw_pin: string,
): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (!config?.duress_pin_hash || !config?.duress_pin_salt) return false;
  const salt_pairs = config.duress_pin_salt.match(/.{2}/g);

  if (!salt_pairs) return false;
  const salt_bytes = Uint8Array.from(salt_pairs.map((h) => parseInt(h, 16)));
  const pepper = await pepper_for_config(account_id, config);
  const computed = await hash_pin(raw_pin, salt_bytes, pepper);

  return constant_time_equal(computed, config.duress_pin_hash);
}

export function clear_all_app_lock_data(): void {
  const prefixes = [
    "aster:app_lock:",
    "aster:app_unlocked:",
    "aster:app_lock_attempts:",
    "aster:app_lock_hint:",
    "aster:app_lock_native_hint:",
  ];

  for (const prefix of prefixes) {
    safe_local_keys()
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => safe_local_remove(key));
    safe_session_keys()
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => safe_session_remove(key));
  }
}
