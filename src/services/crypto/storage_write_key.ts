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
import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64, base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";
import { prepend_keks_keeping_all } from "./legacy_keks";
import {
  derive_encryption_key_from_passphrase,
  get_derived_encryption_key,
  get_storage_kdf_version,
  get_vault_from_memory,
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
} from "./memory_key_store";

import { HASH_ALG } from "@/services/crypto/constants";

export const STORAGE_WRITE_KEY_LENGTH = 32;
export const MAX_PRIOR_STORAGE_KEYS = 8;

export type StorageWriteKeyFailure = "missing_data_kek" | "malformed_data_kek";

export class StorageWriteKeyUnavailableError extends Error {
  readonly reason: StorageWriteKeyFailure;

  constructor(reason: StorageWriteKeyFailure) {
    super(`storage write key unavailable: ${reason}`);
    this.name = "StorageWriteKeyUnavailableError";
    this.reason = reason;
  }
}

export type StorageLookupScope = "pending" | "all";

type StorageKeyVault = Pick<
  EncryptedVault,
  "data_kek" | "legacy_keks" | "storage_rekey"
>;

const write_crypto_keys = new WeakMap<
  object,
  Map<string, Promise<CryptoKey>>
>();
const write_hmac_keys = new WeakMap<object, Map<string, Promise<CryptoKey>>>();
const lookup_hmac_keys = new WeakMap<
  object,
  Map<string, Promise<CryptoKey[]>>
>();

function constant_time_equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

function decode_storage_key(encoded: string): Uint8Array | null {
  let raw: Uint8Array;

  try {
    raw = base64_to_array(encoded);
  } catch {
    return null;
  }

  if (raw.length === STORAGE_WRITE_KEY_LENGTH) {
    return raw;
  }
  zero_uint8_array(raw);

  return null;
}

export function read_storage_write_key(
  vault: Pick<EncryptedVault, "data_kek"> | null,
): Uint8Array {
  if (!vault?.data_kek) {
    throw new StorageWriteKeyUnavailableError("missing_data_kek");
  }

  const raw = decode_storage_key(vault.data_kek);

  if (!raw) {
    throw new StorageWriteKeyUnavailableError("malformed_data_kek");
  }

  return raw;
}

function unlocked_vault(): EncryptedVault | null {
  const session_key = get_derived_encryption_key();

  if (!session_key) {
    return null;
  }

  zero_uint8_array(session_key);

  return get_vault_from_memory();
}

export function get_storage_write_key_bytes(): Uint8Array | null {
  const vault = unlocked_vault();

  if (!vault) {
    return null;
  }

  return read_storage_write_key(vault);
}

export function generate_storage_write_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(STORAGE_WRITE_KEY_LENGTH));
}

export async function import_storage_aes_key(
  raw: Uint8Array,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function derive_storage_hmac_key(
  raw: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const info_bytes = new TextEncoder().encode(info);
  const combined = new Uint8Array(raw.byteLength + info_bytes.length);

  combined.set(raw, 0);
  combined.set(info_bytes, raw.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  zero_uint8_array(combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign", "verify"],
  );
}

export async function get_storage_write_crypto_key(): Promise<CryptoKey | null> {
  const vault = unlocked_vault();

  if (!vault) {
    return null;
  }

  const raw = read_storage_write_key(vault);
  const cache_id = vault.data_kek as string;
  let per_vault = write_crypto_keys.get(vault);

  if (!per_vault) {
    per_vault = new Map();
    write_crypto_keys.set(vault, per_vault);
  }

  const cached = per_vault.get(cache_id);

  if (cached) {
    zero_uint8_array(raw);

    return cached;
  }

  const pending = import_storage_aes_key(raw).finally(() =>
    zero_uint8_array(raw),
  );

  per_vault.set(cache_id, pending);

  return pending;
}

export async function get_storage_write_hmac_key(
  info: string,
): Promise<CryptoKey | null> {
  const vault = unlocked_vault();

  if (!vault) {
    return null;
  }

  let per_vault = write_hmac_keys.get(vault);

  if (!per_vault) {
    per_vault = new Map();
    write_hmac_keys.set(vault, per_vault);
  }

  const raw = read_storage_write_key(vault);
  const cache_id = `${vault.data_kek}:${info}`;
  const cached = per_vault.get(cache_id);

  if (cached) {
    zero_uint8_array(raw);

    return cached;
  }

  const pending = derive_storage_hmac_key(raw, info).finally(() =>
    zero_uint8_array(raw),
  );

  per_vault.set(cache_id, pending);

  return pending;
}

export function has_pending_storage_rekey(
  vault: Pick<EncryptedVault, "storage_rekey"> | null,
): boolean {
  return vault?.storage_rekey?.state === "pending";
}

export function collect_storage_lookup_keys(
  vault: StorageKeyVault | null,
  scope: StorageLookupScope = "pending",
): Uint8Array[] {
  if (!vault) {
    return [];
  }

  const seen = new Set<string>();
  const keys: Uint8Array[] = [];

  const add = (encoded: string | undefined): void => {
    if (!encoded || seen.has(encoded)) return;

    const raw = decode_storage_key(encoded);

    if (!raw) return;
    seen.add(encoded);
    keys.push(raw);
  };

  add(vault.data_kek);

  const prior_keys = vault.storage_rekey?.prior_keys ?? [];
  const pending = has_pending_storage_rekey(vault);

  if (pending || scope === "all") {
    for (const encoded of prior_keys) {
      add(encoded);
    }
  }

  if (scope === "all" || (pending && prior_keys.length === 0)) {
    for (const entry of vault.legacy_keks ?? []) {
      add(entry.k);
    }
  }

  return keys;
}

export async function get_storage_lookup_hmac_keys(
  info: string,
  scope: StorageLookupScope = "pending",
): Promise<CryptoKey[]> {
  const vault = unlocked_vault();

  if (!vault) {
    return [];
  }

  zero_uint8_array(read_storage_write_key(vault));

  let per_vault = lookup_hmac_keys.get(vault);

  if (!per_vault) {
    per_vault = new Map();
    lookup_hmac_keys.set(vault, per_vault);
  }

  const cache_id = [
    scope,
    vault.data_kek,
    vault.storage_rekey?.state ?? "",
    vault.storage_rekey?.prior_keys?.length ?? 0,
    vault.legacy_keks?.length ?? 0,
    info,
  ].join(":");
  const cached = per_vault.get(cache_id);

  if (cached) {
    return cached;
  }

  const raw_keys = collect_storage_lookup_keys(vault, scope);
  const pending = Promise.all(
    raw_keys.map((raw) => derive_storage_hmac_key(raw, info)),
  ).finally(() => raw_keys.forEach((raw) => zero_uint8_array(raw)));

  per_vault.set(cache_id, pending);

  return pending;
}

export async function sign_with_storage_lookup_keys(
  info: string,
  data: Uint8Array,
  scope: StorageLookupScope = "pending",
): Promise<string[]> {
  const keys = await get_storage_lookup_hmac_keys(info, scope);
  const tokens: string[] = [];

  for (const key of keys) {
    const signature = await crypto.subtle.sign("HMAC", key, data);
    const token = array_to_base64(new Uint8Array(signature));

    if (!tokens.includes(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

export async function verify_with_storage_lookup_keys(
  info: string,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> {
  const keys = await get_storage_lookup_hmac_keys(info, "all");

  for (const key of keys) {
    if (await crypto.subtle.verify("HMAC", key, signature, data)) {
      return true;
    }
  }

  return false;
}

export async function derive_password_storage_keys(
  vault: Pick<EncryptedVault, "kdf_version">,
  passphrase: string,
): Promise<Uint8Array[]> {
  const passphrase_bytes = new TextEncoder().encode(passphrase);

  try {
    const keys = [
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_LEGACY,
      ),
    ];

    if (get_storage_kdf_version(vault) >= STORAGE_KDF_VERSION_STRETCHED) {
      keys.push(
        await derive_encryption_key_from_passphrase(
          passphrase_bytes,
          STORAGE_KDF_VERSION_STRETCHED,
        ),
      );
    }

    return keys;
  } finally {
    zero_uint8_array(passphrase_bytes);
  }
}

export async function is_weak_storage_vault(
  vault: Pick<EncryptedVault, "data_kek" | "data_kek_random" | "kdf_version">,
  passphrase: string,
  key_material_keys: Uint8Array[] = [],
): Promise<boolean> {
  if (!vault.data_kek) {
    return true;
  }

  if (vault.data_kek_random === true) {
    return false;
  }

  const stored = decode_storage_key(vault.data_kek);

  if (!stored) {
    return true;
  }

  const password_keys = await derive_password_storage_keys(vault, passphrase);
  let matches = false;

  for (const candidate of password_keys) {
    if (constant_time_equal(stored, candidate)) {
      matches = true;
    }
    zero_uint8_array(candidate);
  }

  for (const candidate of key_material_keys) {
    if (constant_time_equal(stored, candidate)) {
      matches = true;
    }
  }
  zero_uint8_array(stored);

  return matches;
}

export function install_random_storage_key(
  vault: EncryptedVault,
  prior_keys: Uint8Array[],
  now: Date = new Date(),
): void {
  const fresh = generate_storage_write_key();
  const fresh_encoded = array_to_base64(fresh);

  zero_uint8_array(fresh);

  const prior_encoded: string[] = [];

  for (const raw of prior_keys) {
    if (raw.length !== STORAGE_WRITE_KEY_LENGTH) continue;

    const encoded = array_to_base64(raw);

    if (encoded !== fresh_encoded && !prior_encoded.includes(encoded)) {
      prior_encoded.push(encoded);
    }
  }

  const legacy_keks = prepend_keks_keeping_all(
    vault.legacy_keks,
    prior_encoded.map((k) => ({ k, added_at: now.toISOString() })),
  );

  const carried_prior = has_pending_storage_rekey(vault)
    ? (vault.storage_rekey?.prior_keys ?? [])
    : [];
  const merged_prior = [...prior_encoded];

  for (const encoded of carried_prior) {
    if (encoded !== fresh_encoded && !merged_prior.includes(encoded)) {
      merged_prior.push(encoded);
    }
  }

  vault.data_kek = fresh_encoded;
  vault.data_kek_random = true;
  vault.vault_format = MASTER_KEY_VAULT_FORMAT;
  vault.mk_created_at = now.toISOString();
  vault.legacy_keks = legacy_keks;

  if (merged_prior.length > 0) {
    vault.storage_rekey = {
      state: "pending",
      started_at: now.toISOString(),
      prior_keys: merged_prior.slice(0, MAX_PRIOR_STORAGE_KEYS),
    };
  }
}

export function decode_vault_storage_key(
  encoded: string | undefined,
): Uint8Array | null {
  return encoded ? decode_storage_key(encoded) : null;
}

export async function collect_prior_storage_keys(
  vault: Pick<EncryptedVault, "data_kek" | "kdf_version">,
  passphrase: string,
  key_material_keys: Uint8Array[] = [],
): Promise<Uint8Array[]> {
  const password_keys = await derive_password_storage_keys(vault, passphrase);
  const ordered =
    password_keys.length > 1
      ? [password_keys[1], password_keys[0]]
      : password_keys;
  const stored = decode_vault_storage_key(vault.data_kek);
  const extra = key_material_keys
    .filter((raw) => raw.length === STORAGE_WRITE_KEY_LENGTH)
    .map((raw) => new Uint8Array(raw));

  return stored ? [stored, ...ordered, ...extra] : [...ordered, ...extra];
}
