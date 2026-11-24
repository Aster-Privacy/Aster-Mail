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
import type { MailKeyOptions } from "@/services/crypto/envelope";

import { get_current_account } from "@/services/account_manager";
import { get_retired_login_salts, get_user_salt } from "@/services/api/auth";
import {
  derive_password_hash,
  hash_email,
} from "@/services/crypto/key_manager_pgp_keygen";
import { get_passphrase_from_memory } from "@/services/crypto/memory_key_store";
import {
  recorded_login_salts,
  user_hash_pin_key,
  user_id_pin_key,
} from "@/services/crypto/login_proof";
import { base64_to_array } from "@/services/crypto/base64";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_legacy_crypto_keys } from "@/services/crypto/legacy_keks";
import { get_storage_write_crypto_key } from "@/services/crypto/storage_write_key";
import { server_known_kek_id } from "@/services/crypto/server_known_keys";
import { is_mail_legacy_retired } from "@/services/crypto/mail_legacy_retirement";
import {
  mark_server_derivable_plaintext,
  settle_fallback_plaintext,
} from "@/services/crypto/server_derivable_keks";
import { ignore_error } from "@/lib/ignore_error";

const LEGACY_NONCE_LENGTH = 12;
const MINIMUM_GCM_LENGTH = 16;
const MAX_RETIRED_SALTS = 8;
const SERVER_KNOWN_RAW_LENGTH = 32;

export const LEGACY_KEY_RETRY_DELAY_MS = 30_000;

interface LoginHashKey {
  key: CryptoKey;
  id: string;
}

let cached_keys: LoginHashKey[] | null = null;
let cached_owner_id: string | null = null;
let failed_owner_id: string | null = null;
let retry_not_before = 0;
let in_flight: Promise<LoginHashKey[] | null> | null = null;

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
): Promise<LoginHashKey | null> {
  const raw = await derive_login_hash_raw(passphrase, encoded_salt);

  if (!raw) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    return { key, id: server_known_kek_id(raw) };
  } finally {
    zero_uint8_array(raw);
  }
}

async function derive_login_hash_raw(
  passphrase: string,
  encoded_salt: string,
): Promise<Uint8Array | null> {
  let salt: Uint8Array;

  try {
    salt = base64_to_array(encoded_salt);
  } catch {
    return null;
  }

  if (salt.length === 0) return null;

  try {
    const raw = base64_to_array(
      (await derive_password_hash(passphrase, salt)).hash,
    );

    if (raw.length === SERVER_KNOWN_RAW_LENGTH) return raw;
    zero_uint8_array(raw);

    return null;
  } finally {
    zero_uint8_array(salt);
  }
}

export async function derive_server_known_raws(
  passphrase: string,
): Promise<Uint8Array[]> {
  try {
    const account = await get_current_account();
    const email = account?.user?.email;
    const user_id = account?.user?.id;

    if (!email || !user_id) return [];

    const user_hash = await hash_email(email);
    const salt_response = await get_user_salt({ user_hash });
    const current_salt = salt_response.error
      ? null
      : (salt_response.data?.salt ?? null);
    const salts = new Set<string>([
      ...(current_salt ? [current_salt] : []),
      ...(await load_retired_salts()),
      ...recorded_login_salts([
        user_hash_pin_key(user_hash),
        user_id_pin_key(user_id),
      ]),
    ]);
    const raws: Uint8Array[] = [];

    for (const salt of salts) {
      const raw = await derive_login_hash_raw(passphrase, salt);

      if (raw) raws.push(raw);
    }

    return raws;
  } catch (caught) {
    ignore_error(
      "services/crypto/legacy_ios_envelope:derive_server_known_raws",
      caught,
    );

    return [];
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

async function derive_keys(owner_id: string): Promise<LoginHashKey[] | null> {
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
  const keys: LoginHashKey[] = [];

  for (const salt of salts) {
    const key = await import_key_for_salt(passphrase, salt);

    if (key) keys.push(key);
  }

  return keys.length > 0 ? keys : null;
}

async function load_keys(): Promise<LoginHashKey[] | null> {
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

interface KeyedOpen {
  plaintext: ArrayBuffer;
  key: CryptoKey;
}

async function try_decrypt_keyed(
  keys: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<KeyedOpen | null> {
  for (const key of keys) {
    try {
      return {
        plaintext: await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce },
          key,
          ciphertext,
        ),
        key,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function try_decrypt(
  keys: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  return (await try_decrypt_keyed(keys, ciphertext, nonce))?.plaintext ?? null;
}

function is_gcm_input(ciphertext: Uint8Array, nonce: Uint8Array): boolean {
  return (
    nonce.length === LEGACY_NONCE_LENGTH &&
    ciphertext.length >= MINIMUM_GCM_LENGTH
  );
}

export async function decrypt_with_ios_storage_keys(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  if (!is_gcm_input(ciphertext, nonce)) return null;

  return try_decrypt(await get_storage_read_crypto_keys(), ciphertext, nonce);
}

export async function decrypt_legacy_ios_mail_envelope(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  options?: MailKeyOptions,
): Promise<ArrayBuffer | null> {
  const allow_legacy_keys =
    options?.allow_legacy_keys ?? !is_mail_legacy_retired();

  if (allow_legacy_keys) return decrypt_legacy_ios_envelope(ciphertext, nonce);
  if (ciphertext.length <= MINIMUM_GCM_LENGTH) return null;
  if (!is_gcm_input(ciphertext, nonce)) return null;

  const write_key = await get_storage_write_crypto_key().catch(() => null);

  return write_key ? try_decrypt([write_key], ciphertext, nonce) : null;
}

export async function decrypt_legacy_ios_envelope(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  if (ciphertext.length <= MINIMUM_GCM_LENGTH) return null;
  if (!is_gcm_input(ciphertext, nonce)) return null;

  const from_storage = await try_decrypt_keyed(
    await get_storage_read_crypto_keys(),
    ciphertext,
    nonce,
  );

  try {
    if (from_storage) {
      return await settle_fallback_plaintext(
        from_storage.plaintext,
        from_storage.key,
      );
    }

    const from_login_hash = await try_decrypt(
      await login_hash_keys(),
      ciphertext,
      nonce,
    );

    return from_login_hash
      ? mark_server_derivable_plaintext(from_login_hash)
      : null;
  } catch (caught) {
    ignore_error(
      "services/crypto/legacy_ios_envelope:decrypt_legacy_ios_envelope",
      caught,
    );

    return null;
  }
}

async function login_hash_keys(): Promise<CryptoKey[]> {
  return ((await load_keys()) ?? []).map((entry) => entry.key);
}
