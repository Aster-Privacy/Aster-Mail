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
import type { LegacyDerivedKek } from "./key_manager_core";

import { array_to_base64, base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";

import { HASH_ALG } from "@/services/crypto/constants";
import { ignore_error } from "@/lib/ignore_error";

const DERIVED_KEY_LENGTH = 32;
const DERIVED_KEY_INFO = "aster-storage-encryption-key-v1";
const SALT_DERIVATION_PREFIX = "aster-hkdf-salt-v1:";
const MAX_LEGACY_KEKS = 16;

const PREVIOUS_KEY_CONTEXTS = [
  "astermail-tags-v1",
  "astermail-labels-v1",
  "astermail-preferences-v1",
  "astermail-devmode-v1",
  "astermail-draft-v1",
  "astermail-draft-v2",
  "astermail-scheduled-v1",
  "astermail-onboarding-v1",
  "astermail-subscriptions-v1",
  "astermail-recovery-email-v1",
];

let legacy_crypto_keys: CryptoKey[] = [];
let legacy_hkdf_keys: CryptoKey[] = [];

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

export async function derive_kek_from_password(
  password: string,
): Promise<Uint8Array> {
  const passphrase_bytes = new TextEncoder().encode(password);
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

  zero_uint8_array(passphrase_bytes);

  return new Uint8Array(derived_bits);
}

export function serialize_kek_for_vault(
  raw_key: Uint8Array,
  added_at: Date = new Date(),
): LegacyDerivedKek {
  return {
    k: array_to_base64(raw_key),
    added_at: added_at.toISOString(),
  };
}

export function prepend_kek_to_list(
  existing: LegacyDerivedKek[] | undefined,
  new_entry: LegacyDerivedKek,
): LegacyDerivedKek[] {
  const list = existing ? [...existing] : [];

  const duplicate = list.findIndex((entry) => entry.k === new_entry.k);

  if (duplicate >= 0) {
    list.splice(duplicate, 1);
  }

  list.unshift(new_entry);

  return list.slice(0, MAX_LEGACY_KEKS);
}

async function import_raw_as_aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function import_raw_as_hkdf_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
}

async function remember_legacy_raw(raw: Uint8Array): Promise<void> {
  legacy_crypto_keys.push(await import_raw_as_aes_key(raw));

  try {
    legacy_hkdf_keys.push(await import_raw_as_hkdf_key(raw));
  } catch (caught) {
    ignore_error("services/crypto/legacy_keks:remember_legacy_raw", caught);
  }
}

export async function load_legacy_keks_into_memory(
  list: LegacyDerivedKek[] | undefined,
): Promise<void> {
  clear_legacy_keks_from_memory();

  if (!list || list.length === 0) {
    return;
  }

  for (const entry of list) {
    try {
      const raw = base64_to_array(entry.k);

      await remember_legacy_raw(raw);
      zero_uint8_array(raw);
    } catch {
      continue;
    }
  }
}

export async function load_previous_key_derived_keks_into_memory(
  previous_keys: string[] | undefined,
): Promise<void> {
  if (!previous_keys || previous_keys.length === 0) {
    return;
  }

  for (const previous_key of previous_keys) {
    for (const context of PREVIOUS_KEY_CONTEXTS) {
      try {
        const material = new TextEncoder().encode(previous_key + context);
        const raw = new Uint8Array(
          await crypto.subtle.digest(HASH_ALG, material),
        );

        await remember_legacy_raw(raw);
        zero_uint8_array(raw);
      } catch {
        continue;
      }
    }
  }
}

export function clear_legacy_keks_from_memory(): void {
  legacy_crypto_keys = [];
  legacy_hkdf_keys = [];
}

export function get_legacy_crypto_keys(): CryptoKey[] {
  return legacy_crypto_keys;
}

export async function decrypt_with_legacy_derived_keys(
  derive: (base: CryptoKey) => Promise<CryptoKey>,
  ciphertext: BufferSource,
  iv: BufferSource,
): Promise<ArrayBuffer | null> {
  for (const base of legacy_hkdf_keys) {
    try {
      const key = await derive(base);

      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext,
      );
    } catch {
      continue;
    }
  }

  return null;
}

export async function append_legacy_key_raw_bytes(
  raw: Uint8Array,
): Promise<void> {
  try {
    await remember_legacy_raw(raw);
  } catch (caught) {
    ignore_error(
      "services/crypto/legacy_keks:append_legacy_key_raw_bytes",
      caught,
    );
  }
}

export async function decrypt_aes_gcm_with_fallback(
  primary_key: CryptoKey,
  ciphertext: BufferSource,
  iv: BufferSource,
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      primary_key,
      ciphertext,
    );
  } catch (primary_error) {
    if (legacy_crypto_keys.length === 0) {
      throw primary_error;
    }

    const attempts = legacy_crypto_keys.map((fallback_key) =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, fallback_key, ciphertext),
    );

    return new Promise<ArrayBuffer>((resolve, reject) => {
      let remaining = attempts.length;

      for (const attempt of attempts) {
        attempt.then(resolve).catch(() => {
          remaining -= 1;
          if (remaining === 0) reject(primary_error);
        });
      }
    });
  }
}
