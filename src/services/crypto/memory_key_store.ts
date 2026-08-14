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

import { HASH_ALG } from "@/services/crypto/constants";
import { base64_to_array } from "./base64";
import type { EncryptedVault } from "./key_manager";

import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./key_manager_core";
import {
  SecureBuffer,
  zero_uint8_array,
  DEFAULT_AUTO_ZERO_TIMEOUT_MS,
} from "./secure_memory";
import {
  store_key,
  get_key,
  clear_all_keys as clear_crypto_key_cache,
  start_session,
  refresh_session,
  on_session_expire,
  has_key,
} from "./crypto_key_cache";
import { clear_unlocked_key_cache } from "./key_manager_pgp";
import { clear_envelope_key_cache } from "./envelope_key_cache";
import { clear_preview_memo } from "@/utils/preview_text";
import {
  load_legacy_keks_into_memory,
  load_previous_key_derived_keks_into_memory,
  clear_legacy_keks_from_memory,
  append_legacy_key_raw_bytes,
} from "./legacy_keks";

import { en } from "@/lib/i18n/translations/en";


export const MASTER_KEY_VAULT_FORMAT = 2;

export function is_master_key_vault(
  vault: Pick<EncryptedVault, "vault_format" | "data_kek"> | null,
): boolean {
  return (
    !!vault &&
    (vault.vault_format ?? 1) >= MASTER_KEY_VAULT_FORMAT &&
    !!vault.data_kek
  );
}

function arrays_equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

interface HmrState {
  vault_in_memory: EncryptedVault | null;
  derived_encryption_key: Uint8Array | null;
  passphrase_string: string | null;
  vault_owner_id: string | null;
}

let vault_in_memory: EncryptedVault | null = null;
let vault_owner_id: string | null = null;
let secure_passphrase: SecureBuffer | null = null;
let derived_encryption_key: Uint8Array | null = null;
let session_expire_unsubscribe: (() => void) | null = null;
let keys_ready_listeners: Set<() => void> = new Set();
let keys_ready_seen = false;
const vault_cleared_listeners: Set<() => void> = new Set();

export function on_vault_cleared(callback: () => void): () => void {
  vault_cleared_listeners.add(callback);

  return () => {
    vault_cleared_listeners.delete(callback);
  };
}

if (import.meta.hot) {
  const hmr_state = import.meta.hot.data as HmrState | undefined;

  if (hmr_state?.vault_in_memory) {
    vault_in_memory = hmr_state.vault_in_memory;
  }
  if (hmr_state?.vault_owner_id) {
    vault_owner_id = hmr_state.vault_owner_id;
  }
  if (hmr_state?.derived_encryption_key) {
    derived_encryption_key = hmr_state.derived_encryption_key;
  }
  if (hmr_state?.passphrase_string) {
    secure_passphrase = SecureBuffer.from_string(
      hmr_state.passphrase_string,
      DEFAULT_AUTO_ZERO_TIMEOUT_MS,
    );
  }

  import.meta.hot.dispose((data: HmrState) => {
    data.vault_in_memory = vault_in_memory;
    data.derived_encryption_key = derived_encryption_key;
    data.passphrase_string = secure_passphrase?.to_string() ?? null;
    data.vault_owner_id = vault_owner_id;
  });
}

const DERIVED_KEY_LENGTH = 32;
const DERIVED_KEY_INFO = "aster-storage-encryption-key-v1";
const SALT_DERIVATION_PREFIX = "aster-hkdf-salt-v1:";
const DERIVED_KEY_INFO_STRETCHED = "aster-storage-encryption-key-v2";
const STRETCH_SALT_STRETCHED = "aster-storage-stretch-salt-v2";
const EXPANSION_SALT_STRETCHED = "aster-storage-expansion-salt-v2";
const STRETCH_ITERATIONS = 600000;

export const STORAGE_KDF_VERSION_LEGACY = 1;
export const STORAGE_KDF_VERSION_STRETCHED = 2;

export function get_storage_kdf_version(
  vault: Pick<EncryptedVault, "kdf_version"> | null | undefined,
): number {
  const version = vault?.kdf_version;

  return version === STORAGE_KDF_VERSION_STRETCHED
    ? STORAGE_KDF_VERSION_STRETCHED
    : STORAGE_KDF_VERSION_LEGACY;
}

async function derive_salt_from_passphrase(
  passphrase_bytes: Uint8Array,
): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode(SALT_DERIVATION_PREFIX);
  const combined = new Uint8Array(prefix.length + passphrase_bytes.length);

  combined.set(prefix, 0);
  combined.set(passphrase_bytes, prefix.length);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return new Uint8Array(hash);
}

async function stretch_passphrase(
  passphrase_bytes: Uint8Array,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const stretched = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(STRETCH_SALT_STRETCHED),
      iterations: STRETCH_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    DERIVED_KEY_LENGTH * 8,
  );

  return new Uint8Array(stretched);
}

async function derive_stretched_encryption_key(
  passphrase_bytes: Uint8Array,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stretched = await stretch_passphrase(passphrase_bytes);

  const key_material = await crypto.subtle.importKey(
    "raw",
    stretched,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: encoder.encode(EXPANSION_SALT_STRETCHED),
      info: encoder.encode(DERIVED_KEY_INFO_STRETCHED),
    },
    key_material,
    DERIVED_KEY_LENGTH * 8,
  );

  zero_uint8_array(stretched);

  return new Uint8Array(derived_bits);
}

export async function derive_encryption_key_from_passphrase(
  passphrase_bytes: Uint8Array,
  kdf_version: number = STORAGE_KDF_VERSION_LEGACY,
): Promise<Uint8Array> {
  if (kdf_version >= STORAGE_KDF_VERSION_STRETCHED) {
    return derive_stretched_encryption_key(passphrase_bytes);
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const info = new TextEncoder().encode(DERIVED_KEY_INFO);
  const salt = await derive_salt_from_passphrase(passphrase_bytes);

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: salt,
      info: info,
    },
    key_material,
    DERIVED_KEY_LENGTH * 8,
  );

  return new Uint8Array(derived_bits);
}

export async function store_vault_in_memory(
  vault: EncryptedVault,
  passphrase: string,
  owner_user_id?: string,
): Promise<void> {
  const previous_owner_id = vault_owner_id;

  clear_vault_from_memory();

  vault_owner_id = owner_user_id ?? previous_owner_id;

  vault_in_memory = {
    identity_key: vault.identity_key,
    previous_keys: vault.previous_keys ? [...vault.previous_keys] : [],
    signed_prekey: vault.signed_prekey,
    signed_prekey_private: vault.signed_prekey_private,
    recovery_codes: vault.recovery_codes ? [...vault.recovery_codes] : [],
    ratchet_identity_key: vault.ratchet_identity_key,
    ratchet_identity_public: vault.ratchet_identity_public,
    ratchet_signed_prekey: vault.ratchet_signed_prekey,
    ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
    ratchet_pq_identity_key: vault.ratchet_pq_identity_key,
    ratchet_pq_identity_public: vault.ratchet_pq_identity_public,
    ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
    ratchet_previous_keys: vault.ratchet_previous_keys
      ? vault.ratchet_previous_keys.map((k) => ({ ...k }))
      : undefined,
    ratchet_regen_v4_done: vault.ratchet_regen_v4_done,
    legacy_keks: vault.legacy_keks ? [...vault.legacy_keks] : undefined,
    data_kek: vault.data_kek,
    vault_format: vault.vault_format,
    kdf_version: vault.kdf_version,
    mk_created_at: vault.mk_created_at,
  };

  await load_legacy_keks_into_memory(vault.legacy_keks);
  await load_previous_key_derived_keks_into_memory(vault.previous_keys);

  secure_passphrase = SecureBuffer.from_string(
    passphrase,
    DEFAULT_AUTO_ZERO_TIMEOUT_MS,
  );

  const passphrase_bytes = secure_passphrase.get_bytes();

  const uses_master_key = is_master_key_vault(vault);
  const kdf_version = get_storage_kdf_version(vault);

  if (uses_master_key && vault.data_kek) {
    derived_encryption_key = base64_to_array(vault.data_kek);
    if (passphrase_bytes) {
      const password_derived = await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        kdf_version,
      );

      if (!arrays_equal(password_derived, derived_encryption_key)) {
        await append_legacy_key_raw_bytes(password_derived);
      }
      zero_uint8_array(password_derived);

      if (kdf_version >= STORAGE_KDF_VERSION_STRETCHED) {
        const legacy_derived = await derive_encryption_key_from_passphrase(
          passphrase_bytes,
          STORAGE_KDF_VERSION_LEGACY,
        );

        await append_legacy_key_raw_bytes(legacy_derived);
        zero_uint8_array(legacy_derived);
      }

      zero_uint8_array(passphrase_bytes);
    }
  } else if (passphrase_bytes) {
    derived_encryption_key = await derive_encryption_key_from_passphrase(
      passphrase_bytes,
      kdf_version,
    );
    if (kdf_version >= STORAGE_KDF_VERSION_STRETCHED) {
      const legacy_derived = await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_LEGACY,
      );

      await append_legacy_key_raw_bytes(legacy_derived);
      zero_uint8_array(legacy_derived);
    }
    zero_uint8_array(passphrase_bytes);
    if (vault_in_memory && derived_encryption_key) {
      vault_in_memory.data_kek = array_to_base64(derived_encryption_key);
    }
  }

  secure_passphrase.on_zero(() => {
    if (derived_encryption_key) {
      zero_uint8_array(derived_encryption_key);
      derived_encryption_key = null;
    }
    keys_ready_seen = false;
    clear_crypto_key_cache();
  });

  start_session();

  session_expire_unsubscribe = on_session_expire(() => {
    clear_vault_from_memory();
  });

  if (derived_encryption_key) {
    await import_and_cache_derived_key(derived_encryption_key);
    notify_keys_ready();
  }
}

async function import_and_cache_derived_key(
  key_bytes: Uint8Array,
): Promise<void> {
  const aes_key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  store_key("derived_encryption_key", aes_key, "aes");
}

export function get_vault_from_memory(): EncryptedVault | null {
  return vault_in_memory;
}

export function get_passphrase_bytes(): Uint8Array | null {
  if (!secure_passphrase || secure_passphrase.is_cleared()) {
    return null;
  }

  return secure_passphrase.get_bytes();
}

export function get_derived_encryption_key(): Uint8Array | null {
  if (!derived_encryption_key) {
    return null;
  }
  const copy = new Uint8Array(derived_encryption_key.length);

  copy.set(derived_encryption_key);

  return copy;
}

export async function get_or_create_derived_encryption_crypto_key(): Promise<CryptoKey | null> {
  let cached = get_key("derived_encryption_key");

  if (cached) {
    return cached;
  }

  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) {
    return null;
  }

  await import_and_cache_derived_key(key_bytes);
  zero_uint8_array(key_bytes);

  return get_key("derived_encryption_key");
}

export function get_passphrase_from_memory(): string | null {
  if (!secure_passphrase || secure_passphrase.is_cleared()) {
    return null;
  }

  return secure_passphrase.to_string();
}

export function clear_passphrase(): void {
  if (secure_passphrase) {
    secure_passphrase.zero();
    secure_passphrase = null;
  }
  if (derived_encryption_key) {
    zero_uint8_array(derived_encryption_key);
    derived_encryption_key = null;
  }
  keys_ready_seen = false;
}

export function clear_vault_from_memory(): void {
  clear_passphrase();
  clear_legacy_keks_from_memory();
  vault_in_memory = null;
  vault_owner_id = null;
  clear_crypto_key_cache();
  clear_unlocked_key_cache();
  clear_envelope_key_cache();
  clear_preview_memo();
  keys_ready_seen = false;

  if (session_expire_unsubscribe) {
    session_expire_unsubscribe();
    session_expire_unsubscribe = null;
  }

  vault_cleared_listeners.forEach((callback) => {
    try {
      callback();
    } catch {
      return;
    }
  });
}

export function has_vault_in_memory(): boolean {
  return vault_in_memory !== null;
}

export function get_vault_owner_id(): string | null {
  return vault_owner_id;
}

export function is_vault_owned_by(user_id: string | null | undefined): boolean {
  if (!user_id) {
    return false;
  }

  return vault_owner_id === null || vault_owner_id === user_id;
}

export function has_vault_in_memory_for(
  user_id: string | null | undefined,
): boolean {
  return vault_in_memory !== null && is_vault_owned_by(user_id);
}

export function has_passphrase_in_memory(): boolean {
  return secure_passphrase !== null && !secure_passphrase.is_cleared();
}

export function are_keys_ready(): boolean {
  return derived_encryption_key !== null && has_passphrase_in_memory();
}

export function on_keys_ready(callback: () => void): () => void {
  if (derived_encryption_key !== null && has_passphrase_in_memory()) {
    callback();
  }
  keys_ready_listeners.add(callback);

  return () => {
    keys_ready_listeners.delete(callback);
  };
}

const KEYS_READY_WAIT_MS = 15000;

export function wait_for_keys_ready(
  timeout_ms: number = KEYS_READY_WAIT_MS,
): Promise<boolean> {
  if (derived_encryption_key !== null && has_passphrase_in_memory()) {
    return Promise.resolve(true);
  }

  if (keys_ready_seen) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    let settled = false;

    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(ready);
    };

    const timer = setTimeout(() => {
      keys_ready_seen = true;
      settle(false);
    }, timeout_ms);

    unsubscribe = on_keys_ready(() => settle(true));
    if (settled) unsubscribe();
  });
}

function notify_keys_ready(): void {
  keys_ready_seen = false;
  keys_ready_listeners.forEach((callback) => {
    try {
      callback();
    } catch {
      return;
    }
  });
}

export function re_trigger_keys_ready(): void {
  if (derived_encryption_key !== null && has_passphrase_in_memory()) {
    notify_keys_ready();
  }
}

export function extend_passphrase_timeout(): void {
  if (secure_passphrase) {
    secure_passphrase.extend_timeout();
  }
  refresh_session();
}

function validate_passphrase(entered: string): string | null {
  if (!secure_passphrase || secure_passphrase.is_cleared())
    return en.errors.session_expired_login;

  const entered_bytes = new TextEncoder().encode(entered);
  const stored_bytes = secure_passphrase.get_bytes();

  if (!stored_bytes) return en.errors.session_expired_login;

  const entered_hash = sha256(entered_bytes);
  const stored_hash = sha256(stored_bytes);

  let result = 0;

  for (let i = 0; i < 32; i++) {
    result |= entered_hash[i] ^ stored_hash[i];
  }

  zero_uint8_array(entered_bytes);
  zero_uint8_array(stored_bytes);
  zero_uint8_array(entered_hash);
  zero_uint8_array(stored_hash);

  if (result !== 0) return en.errors.incorrect_password;
  if (!vault_in_memory) return en.errors.no_keys_available;

  return null;
}

export function verify_passphrase_for_export(entered: string): boolean {
  return validate_passphrase(entered) === null;
}

const EXPORT_TOKEN_TTL_MS = 5 * 60 * 1000;
let active_export_token: { token: string; expires_at: number } | null = null;

export function issue_export_token(): string | null {
  if (!has_vault_in_memory() || !has_passphrase_in_memory()) return null;
  const rand = new Uint8Array(32);

  crypto.getRandomValues(rand);
  let token = "";

  for (let i = 0; i < rand.length; i++) {
    token += rand[i].toString(16).padStart(2, "0");
  }
  active_export_token = {
    token,
    expires_at: Date.now() + EXPORT_TOKEN_TTL_MS,
  };

  return token;
}

export function consume_export_token(token: string): boolean {
  if (!active_export_token) return false;
  if (active_export_token.expires_at < Date.now()) {
    active_export_token = null;

    return false;
  }

  const encoder = new TextEncoder();
  const expected = sha256(encoder.encode(active_export_token.token));
  const provided = sha256(encoder.encode(token));

  let mismatch = 0;

  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected[i] ^ provided[i];
  }

  zero_uint8_array(expected);
  zero_uint8_array(provided);

  if (mismatch !== 0) return false;

  active_export_token = null;

  return true;
}

export function store_ke_crypto_key(id: string, key: CryptoKey): void {
  refresh_session();
  store_key(`ke:${id}`, key, "ke");
}

export function get_ke_crypto_key(id: string): CryptoKey | null {
  refresh_session();

  return get_key(`ke:${id}`);
}

export function has_ke_crypto_key(id: string): boolean {
  return has_key(`ke:${id}`);
}

export function store_aes_crypto_key(id: string, key: CryptoKey): void {
  refresh_session();
  store_key(`aes:${id}`, key, "aes");
}

export function get_aes_crypto_key(id: string): CryptoKey | null {
  refresh_session();

  return get_key(`aes:${id}`);
}

export function has_aes_crypto_key(id: string): boolean {
  return has_key(`aes:${id}`);
}

