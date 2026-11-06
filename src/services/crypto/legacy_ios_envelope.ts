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
import { get_current_account } from "@/services/account_manager";
import { get_retired_login_salts, get_user_salt } from "@/services/api/auth";
import {
  derive_password_hash,
  hash_email,
} from "@/services/crypto/key_manager_pgp_keygen";
import { get_passphrase_from_memory } from "@/services/crypto/memory_key_store";
import { base64_to_array } from "@/services/crypto/base64";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_legacy_crypto_keys } from "@/services/crypto/legacy_keks";
import {
  derive_storage_hmac_key,
  get_storage_write_crypto_key,
} from "@/services/crypto/storage_write_key";
import { ignore_error } from "@/lib/ignore_error";

const LEGACY_NONCE_LENGTH = 12;
const MINIMUM_GCM_LENGTH = 16;
const MAX_RETIRED_SALTS = 8;

export const LEGACY_KEY_RETRY_DELAY_MS = 30_000;
export const LEGACY_IOS_HMAC_INFOS = ["external-accounts-hmac-v1"] as const;

export type LegacyIosHmacInfo = (typeof LEGACY_IOS_HMAC_INFOS)[number];

interface LegacyIosKeySet {
  aes_key: CryptoKey;
  hmac_keys: Map<LegacyIosHmacInfo, CryptoKey>;
}

let cached_keys: LegacyIosKeySet[] | null = null;
let cached_owner_id: string | null = null;
let failed_owner_id: string | null = null;
let retry_not_before = 0;
let in_flight: Promise<LegacyIosKeySet[] | null> | null = null;

export function clear_legacy_ios_envelope_key(): void {
  cached_keys = null;
  cached_owner_id = null;
  failed_owner_id = null;
  retry_not_before = 0;
  in_flight = null;
}

function remember_failure(owner_id: string): void {
  failed_owner_id = owner_id;
  retry_not_before = Date.now() + LEGACY_KEY_RETRY_DELAY_MS;
}

async function import_key_for_salt(
  passphrase: string,
  encoded_salt: string,
): Promise<LegacyIosKeySet | null> {
  let salt: Uint8Array;

  try {
    salt = base64_to_array(encoded_salt);
  } catch {
    return null;
  }

  if (salt.length === 0) return null;

  const { hash } = await derive_password_hash(passphrase, salt);
  const raw = base64_to_array(hash);

  try {
    const aes_key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const hmac_keys = new Map<LegacyIosHmacInfo, CryptoKey>();

    for (const info of LEGACY_IOS_HMAC_INFOS) {
      hmac_keys.set(info, await derive_storage_hmac_key(raw, info));
    }

    return { aes_key, hmac_keys };
  } finally {
    zero_uint8_array(raw);
    zero_uint8_array(salt);
  }
}

async function load_retired_salts(): Promise<string[]> {
  try {
    return (await get_retired_login_salts()).slice(-MAX_RETIRED_SALTS);
  } catch (caught) {
    ignore_error(
      "services/crypto/legacy_ios_envelope:load_retired_salts",
      caught,
    );

    return [];
  }
}

async function derive_keys(
  owner_id: string,
): Promise<LegacyIosKeySet[] | null> {
  const account = await get_current_account();
  const email = account?.user?.email;

  if (!email || account?.user?.id !== owner_id) return null;

  const passphrase = get_passphrase_from_memory();

  if (!passphrase) return null;

  const salt_response = await get_user_salt({
    user_hash: await hash_email(email),
  });

  if (salt_response.error || !salt_response.data?.salt) return null;

  const current_salt = salt_response.data.salt;
  const retired_salts = await load_retired_salts();
  const salts = new Set([current_salt, ...retired_salts.reverse()]);
  const keys: LegacyIosKeySet[] = [];

  for (const salt of salts) {
    const key = await import_key_for_salt(passphrase, salt);

    if (key) keys.push(key);
  }

  return keys.length > 0 ? keys : null;
}

async function load_keys(): Promise<LegacyIosKeySet[] | null> {
  if (!get_passphrase_from_memory()) {
    clear_legacy_ios_envelope_key();

    return null;
  }

  const account = await get_current_account();
  const owner_id = account?.user?.id;

  if (!owner_id) return null;

  if (cached_keys && cached_owner_id === owner_id) return cached_keys;
  if (failed_owner_id === owner_id && Date.now() < retry_not_before) {
    return null;
  }
  if (in_flight) return in_flight;

  in_flight = derive_keys(owner_id)
    .then((keys) => {
      if (keys) {
        cached_keys = keys;
        cached_owner_id = owner_id;
        failed_owner_id = null;
        retry_not_before = 0;
      } else {
        remember_failure(owner_id);
      }

      return keys;
    })
    .catch((caught) => {
      ignore_error("services/crypto/legacy_ios_envelope:load_key", caught);
      remember_failure(owner_id);

      return null;
    })
    .finally(() => {
      in_flight = null;
    });

  return in_flight;
}

export async function get_legacy_ios_key_material_keys(): Promise<CryptoKey[]> {
  const keys = await load_keys();

  return keys ? keys.map((set) => set.aes_key) : [];
}

export async function get_legacy_ios_hmac_keys(
  info: LegacyIosHmacInfo,
): Promise<CryptoKey[]> {
  const keys = await load_keys();

  if (!keys) return [];

  return keys
    .map((set) => set.hmac_keys.get(info))
    .filter((key): key is CryptoKey => key !== undefined);
}

export async function get_storage_read_crypto_keys(): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];

  try {
    const write_key = await get_storage_write_crypto_key();

    if (write_key) keys.push(write_key);
  } catch (caught) {
    ignore_error(
      "services/crypto/legacy_ios_envelope:get_storage_read_crypto_keys",
      caught,
    );
  }

  for (const key of get_legacy_crypto_keys()) {
    if (!keys.includes(key)) keys.push(key);
  }

  return keys;
}

async function try_decrypt(
  keys: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  for (const key of keys) {
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        ciphertext,
      );
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_with_ios_storage_keys(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  if (nonce.length !== LEGACY_NONCE_LENGTH) return null;
  if (ciphertext.length < MINIMUM_GCM_LENGTH) return null;

  const from_storage = await try_decrypt(
    await get_storage_read_crypto_keys(),
    ciphertext,
    nonce,
  );

  if (from_storage) return from_storage;

  return try_decrypt(
    await get_legacy_ios_key_material_keys(),
    ciphertext,
    nonce,
  );
}

export async function decrypt_legacy_ios_envelope(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  if (ciphertext.length <= MINIMUM_GCM_LENGTH) return null;

  return decrypt_with_ios_storage_keys(ciphertext, nonce);
}
