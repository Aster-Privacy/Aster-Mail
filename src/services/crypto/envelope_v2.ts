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
import { array_to_base64, base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";
import { without_retired_keks } from "./retired_identity_keks";
import {
  is_public_mail_kek,
  is_server_known_encoded,
} from "./server_known_keys";
import { normalize_parsed_envelope } from "./envelope";
import { is_password_derived_storage_key } from "./password_storage_keys";

import type { EncryptedVault } from "./key_manager_core";

export const ENVELOPE_V1_NONCE = "AQ==";
export const ENVELOPE_V2_NONCE = "Ag==";
export const ENVELOPE_V3_NONCE = "Aw==";

const ENVELOPE_V2_INFO = "aster-envelope-v2";
const ENVELOPE_V3_INFO = "aster-envelope-v3";
const ENVELOPE_V3_DOMAIN = "aster-stored-envelope-v3|mail_item";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function decode_sentinel(nonce_b64: string | null | undefined): number | null {
  if (!nonce_b64) return null;

  try {
    const bytes = base64_to_array(nonce_b64);

    return bytes.length === 1 ? bytes[0] : null;
  } catch {
    return null;
  }
}

export function is_envelope_v1_nonce(
  nonce_b64: string | null | undefined,
): boolean {
  return decode_sentinel(nonce_b64) === 1;
}

export function is_envelope_v2_nonce(
  nonce_b64: string | null | undefined,
): boolean {
  return decode_sentinel(nonce_b64) === 2;
}

export interface StoredEnvelopeBinding {
  owner_id: string;
  item_id: string;
}

function is_binding_part(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}

export function envelope_v3_aad(
  binding: StoredEnvelopeBinding | null | undefined,
): Uint8Array | null {
  if (!binding) return null;
  if (!is_binding_part(binding.owner_id) || !is_binding_part(binding.item_id)) {
    return null;
  }

  return new TextEncoder().encode(
    `${ENVELOPE_V3_DOMAIN}\0${binding.owner_id}\0${binding.item_id}`,
  );
}

export function is_envelope_v3_nonce(
  nonce_b64: string | null | undefined,
): boolean {
  return decode_sentinel(nonce_b64) === 3;
}

export function is_stored_envelope_v2_family_nonce(
  nonce_b64: string | null | undefined,
): boolean {
  const sentinel = decode_sentinel(nonce_b64);

  return sentinel === 2 || sentinel === 3;
}

function decode_key(value: string | undefined | null): Uint8Array | null {
  if (!value) return null;

  try {
    const bytes = base64_to_array(value);

    if (bytes.length !== KEY_LENGTH) {
      zero_uint8_array(bytes);

      return null;
    }

    return bytes;
  } catch {
    return null;
  }
}

export function envelope_v2_keys_from_vault(
  vault: EncryptedVault | null | undefined,
): Uint8Array[] {
  if (!vault) return [];

  const keys: Uint8Array[] = [];
  const current = decode_key(vault.data_kek);

  if (current) keys.push(current);

  for (const entry of without_retired_keks(vault.legacy_keks)) {
    if (
      !entry?.k ||
      is_public_mail_kek(entry.k) ||
      is_server_known_encoded(entry.k, vault)
    )
      continue;

    const legacy = decode_key(entry.k);

    if (legacy) keys.push(legacy);
  }

  return keys;
}

export function envelope_v2_write_key(
  vault: EncryptedVault | null | undefined,
): Uint8Array | null {
  if (is_password_derived_storage_key(vault?.data_kek)) return null;

  return decode_key(vault?.data_kek);
}

export function wipe_envelope_v2_keys(keys: Uint8Array[]): void {
  for (const key of keys) zero_uint8_array(key);
}

async function derive_envelope_v2_key(
  kek: Uint8Array,
  salt: Uint8Array,
  usage: KeyUsage,
  info: string,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", kek, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(info),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function gcm_params(
  iv: Uint8Array,
  aad: Uint8Array | null,
): AesGcmParams {
  return aad ? { name: "AES-GCM", iv, additionalData: aad } : { name: "AES-GCM", iv };
}

export async function encrypt_envelope_v2_bytes(
  plaintext: Uint8Array,
  kek: Uint8Array,
  fixed?: { salt: Uint8Array; iv: Uint8Array },
  binding?: StoredEnvelopeBinding,
): Promise<string> {
  const aad = binding ? envelope_v3_aad(binding) : null;

  if (binding && !aad) throw new Error("invalid stored envelope binding");

  const salt =
    fixed?.salt ?? crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = fixed?.iv ?? crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await derive_envelope_v2_key(
    kek,
    salt,
    "encrypt",
    aad ? ENVELOPE_V3_INFO : ENVELOPE_V2_INFO,
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(gcm_params(iv, aad), key, plaintext),
  );
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + sealed.length);

  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(sealed, SALT_LENGTH + IV_LENGTH);

  return array_to_base64(combined);
}

export async function encrypt_envelope_v2(
  data: object,
  kek: Uint8Array,
  binding?: StoredEnvelopeBinding,
): Promise<{ encrypted: string; nonce: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  try {
    return {
      encrypted: await encrypt_envelope_v2_bytes(
        plaintext,
        kek,
        undefined,
        binding,
      ),
      nonce: binding ? ENVELOPE_V3_NONCE : ENVELOPE_V2_NONCE,
    };
  } finally {
    zero_uint8_array(plaintext);
  }
}

export async function decrypt_envelope_v2_bytes(
  encrypted_b64: string,
  keys: Uint8Array[],
  binding?: StoredEnvelopeBinding,
): Promise<Uint8Array | null> {
  const aad = binding ? envelope_v3_aad(binding) : null;

  if (binding && !aad) return null;

  let combined: Uint8Array;

  try {
    combined = base64_to_array(encrypted_b64);
  } catch {
    return null;
  }

  if (combined.length <= SALT_LENGTH + IV_LENGTH) return null;

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  for (const kek of keys) {
    try {
      const key = await derive_envelope_v2_key(
        kek,
        salt,
        "decrypt",
        aad ? ENVELOPE_V3_INFO : ENVELOPE_V2_INFO,
      );
      const plain = await crypto.subtle.decrypt(
        gcm_params(iv, aad),
        key,
        ciphertext,
      );

      return new Uint8Array(plain);
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_envelope_v2_plaintext(
  encrypted_b64: string,
  keys: Uint8Array[],
  binding?: StoredEnvelopeBinding,
): Promise<string | null> {
  const bytes = await decrypt_envelope_v2_bytes(encrypted_b64, keys, binding);

  if (!bytes) return null;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    zero_uint8_array(bytes);
  }
}

export async function decrypt_envelope_v2<T>(
  encrypted_b64: string,
  keys: Uint8Array[],
  binding?: StoredEnvelopeBinding,
): Promise<T | null> {
  const json = await decrypt_envelope_v2_plaintext(
    encrypted_b64,
    keys,
    binding,
  );

  if (json === null) return null;

  try {
    return normalize_parsed_envelope(JSON.parse(json) as T);
  } catch {
    return null;
  }
}

export async function decrypt_envelope_v2_with_vault<T>(
  encrypted_b64: string,
  vault: EncryptedVault | null | undefined,
  binding?: StoredEnvelopeBinding,
): Promise<T | null> {
  const keys = envelope_v2_keys_from_vault(vault);

  try {
    return await decrypt_envelope_v2<T>(encrypted_b64, keys, binding);
  } finally {
    wipe_envelope_v2_keys(keys);
  }
}

export async function envelope_sha256_hex(
  encrypted_b64: string,
): Promise<string> {
  const bytes = base64_to_array(encrypted_b64);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
