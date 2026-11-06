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

export const WRAPPED_PASSPHRASE_KEY_PREFIX = "astermail_pin_wrapped_passphrase_";
export const PIN_KDF_ITERATIONS = 300000;
export const APP_LOCK_FIELD_BYTES = 32;

const PROOF_LABEL = "aster-app-lock-auth-v1";
const WRAP_KEY_INFO = "aster-app-lock-wrap-v1";
const WRAP_RECORD_AAD = "aster.app_lock.passphrase.v1";
const WRAP_RECORD_VERSION = 1;
const WRAP_IV_BYTES = 12;

interface UnlockedLock {
  key: CryptoKey;
  verifier: Uint8Array;
}

export interface PendingPassphrase {
  passphrase: string;
  remember_on_device: boolean;
}

interface WrappedRecord {
  v: number;
  iv: string;
  ct: string;
}

const unlocked_locks = new Map<string, UnlockedLock>();
const pending_passphrases = new Map<string, PendingPassphrase>();
const unlock_waiters = new Map<string, Array<(ok: boolean) => void>>();

const record_key = (account_id: string) =>
  `${WRAPPED_PASSPHRASE_KEY_PREFIX}${account_id}`;

export function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function base64_to_bytes(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function constant_time_bytes_equal(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }

  return diff === 0;
}

function concat_bytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.length + second.length);

  out.set(first, 0);
  out.set(second, first.length);

  return out;
}

export async function derive_pin_key(
  pin: string,
  salt: Uint8Array,
  pepper: Uint8Array,
): Promise<Uint8Array> {
  const pin_bytes = new TextEncoder().encode(pin);
  const key_input = concat_bytes(pepper, pin_bytes);

  try {
    const material = await crypto.subtle.importKey(
      "raw",
      key_input,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PIN_KDF_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      256,
    );

    return new Uint8Array(bits);
  } finally {
    key_input.fill(0);
    pin_bytes.fill(0);
  }
}

export async function derive_proof(pin_key: Uint8Array): Promise<Uint8Array> {
  const hmac_key = await crypto.subtle.importKey(
    "raw",
    pin_key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    hmac_key,
    new TextEncoder().encode(PROOF_LABEL),
  );

  return new Uint8Array(mac);
}

export async function derive_verifier(proof: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", proof));
}

export async function derive_wrap_key(
  pin_key: Uint8Array,
  server_secret: Uint8Array,
  account_id: string,
  device_lock_id: string,
): Promise<CryptoKey> {
  const input = concat_bytes(pin_key, server_secret);

  try {
    const material = await crypto.subtle.importKey(
      "raw",
      input,
      "HKDF",
      false,
      ["deriveKey"],
    );

    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode(device_lock_id),
        info: new TextEncoder().encode(
          `${WRAP_KEY_INFO}:${account_id}:${device_lock_id}`,
        ),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    input.fill(0);
  }
}

export function set_unlocked_lock(
  account_id: string,
  key: CryptoKey,
  verifier: Uint8Array,
): void {
  unlocked_locks.get(account_id)?.verifier.fill(0);
  unlocked_locks.set(account_id, { key, verifier: verifier.slice() });
}

export function get_unlocked_key(account_id: string): CryptoKey | null {
  return unlocked_locks.get(account_id)?.key ?? null;
}

export function get_unlocked_verifier(account_id: string): Uint8Array | null {
  return unlocked_locks.get(account_id)?.verifier ?? null;
}

export function forget_unlocked_lock(account_id: string): void {
  unlocked_locks.get(account_id)?.verifier.fill(0);
  unlocked_locks.delete(account_id);
  pending_passphrases.delete(account_id);
}

export function forget_all_unlocked_locks(): void {
  for (const lock of unlocked_locks.values()) lock.verifier.fill(0);
  unlocked_locks.clear();
  pending_passphrases.clear();
}

export function holds_unlock_material(): boolean {
  return unlocked_locks.size > 0 || pending_passphrases.size > 0;
}

export function set_pending_passphrase(
  account_id: string,
  passphrase: string,
  remember_on_device: boolean,
): void {
  pending_passphrases.set(account_id, { passphrase, remember_on_device });
}

export function get_pending_passphrase(
  account_id: string,
): PendingPassphrase | null {
  return pending_passphrases.get(account_id) ?? null;
}

export function clear_pending_passphrase(account_id: string): void {
  pending_passphrases.delete(account_id);
}

function record_aad(account_id: string): Uint8Array {
  return new TextEncoder().encode(`${WRAP_RECORD_AAD}:${account_id}`);
}

function parse_record(raw: string | null): WrappedRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WrappedRecord>;

    if (
      parsed.v !== WRAP_RECORD_VERSION ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ct !== "string"
    ) {
      return null;
    }

    return parsed as WrappedRecord;
  } catch {
    return null;
  }
}

export function read_wrapped_record(account_id: string): {
  record: WrappedRecord;
  on_device: boolean;
} | null {
  const local = parse_record(safe_local_get(record_key(account_id)));

  if (local) return { record: local, on_device: true };
  const tab = parse_record(safe_session_get(record_key(account_id)));

  return tab ? { record: tab, on_device: false } : null;
}

export function has_wrapped_passphrase(account_id: string): boolean {
  return read_wrapped_record(account_id) !== null;
}

export function remove_wrapped_passphrase(account_id: string): void {
  safe_local_remove(record_key(account_id));
  safe_session_remove(record_key(account_id));
}

export function remove_all_wrapped_passphrases(): void {
  safe_local_keys()
    .filter((key) => key.startsWith(WRAPPED_PASSPHRASE_KEY_PREFIX))
    .forEach((key) => safe_local_remove(key));
  safe_session_keys()
    .filter((key) => key.startsWith(WRAPPED_PASSPHRASE_KEY_PREFIX))
    .forEach((key) => safe_session_remove(key));
}

export async function write_wrapped_passphrase(
  account_id: string,
  key: CryptoKey,
  passphrase: string,
  remember_on_device: boolean,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(WRAP_IV_BYTES));
  const plaintext = new TextEncoder().encode(passphrase);

  try {
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: record_aad(account_id) },
      key,
      plaintext,
    );
    const record: WrappedRecord = {
      v: WRAP_RECORD_VERSION,
      iv: bytes_to_base64(iv),
      ct: bytes_to_base64(new Uint8Array(sealed)),
    };

    remove_wrapped_passphrase(account_id);
    const write = remember_on_device ? safe_local_set : safe_session_set;

    write(record_key(account_id), JSON.stringify(record));
  } finally {
    plaintext.fill(0);
  }
}

export async function open_wrapped_passphrase(
  account_id: string,
  key: CryptoKey,
): Promise<string | null> {
  const stored = read_wrapped_record(account_id);

  if (!stored) return null;
  const iv = base64_to_bytes(stored.record.iv);
  const ct = base64_to_bytes(stored.record.ct);

  if (!iv || !ct) return null;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: record_aad(account_id) },
      key,
      ct,
    );

    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}

export function wait_for_app_unlock(account_id: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const list = unlock_waiters.get(account_id) ?? [];

    list.push(resolve);
    unlock_waiters.set(account_id, list);
  });
}

export function has_unlock_waiters(account_id: string): boolean {
  return (unlock_waiters.get(account_id)?.length ?? 0) > 0;
}

export function settle_app_unlock(account_id: string, ok: boolean): boolean {
  const list = unlock_waiters.get(account_id);

  unlock_waiters.delete(account_id);
  if (!list || list.length === 0) return false;
  list.forEach((resolve) => resolve(ok));

  return true;
}
