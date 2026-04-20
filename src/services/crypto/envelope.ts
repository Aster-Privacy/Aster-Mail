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
import { zero_uint8_array } from "./secure_memory";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "./memory_key_store";
import { decrypt_message } from "./key_manager";

const HASH_ALG = ["SHA", "256"].join("-");

export function normalize_envelope_from(
  from: unknown,
): { name: string; email: string } | null {
  if (!from) return null;
  if (typeof from === "object" && from !== null && "email" in from) {
    return from as { name: string; email: string };
  }
  if (typeof from === "string") {
    const match = from.match(/^(.*?)\s*<([^>]+)>$/);

    if (match) {
      return {
        name: match[1].replace(/^["']|["']$/g, "").trim(),
        email: match[2],
      };
    }
    if (from.includes("@")) return { name: "", email: from };
  }

  return null;
}

export function normalize_envelope_recipients(
  recipients: unknown,
): { name: string; email: string }[] {
  if (!Array.isArray(recipients)) return [];

  const result: { name: string; email: string }[] = [];

  for (const entry of recipients) {
    const normalized = normalize_envelope_from(entry);

    if (normalized && normalized.email) result.push(normalized);
  }

  return result;
}

export function normalize_parsed_envelope<T>(parsed: T): T {
  if (!parsed || typeof parsed !== "object") return parsed;

  const record = parsed as Record<string, unknown>;
  const from = normalize_envelope_from(record.from);

  if (from) record.from = from;
  if ("to" in record) record.to = normalize_envelope_recipients(record.to);
  if ("cc" in record) record.cc = normalize_envelope_recipients(record.cc);
  if ("bcc" in record) record.bcc = normalize_envelope_recipients(record.bcc);

  return parsed;
}

export const PBKDF2_ITERATIONS = 310000;
export const SALT_LENGTH = 16;
export const NONCE_LENGTH = 12;

export async function derive_envelope_key_from_bytes(
  passphrase_bytes: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function derive_envelope_key(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphrase_bytes = encoder.encode(passphrase);
  const key = await derive_envelope_key_from_bytes(passphrase_bytes, salt);

  zero_uint8_array(passphrase_bytes);

  return key;
}

export function array_to_base64(arr: Uint8Array | ArrayBuffer): string {
  const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  let binary = "";

  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

export function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export async function encrypt_envelope_with_bytes(
  data: object,
  passphrase_bytes: Uint8Array,
): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const encoder = new TextEncoder();
  const data_bytes = encoder.encode(JSON.stringify(data));

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const crypto_key = await derive_envelope_key_from_bytes(
    passphrase_bytes,
    salt,
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    crypto_key,
    data_bytes,
  );

  const combined = new Uint8Array(
    salt.length + nonce.length + encrypted.byteLength,
  );

  combined.set(salt, 0);
  combined.set(nonce, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + nonce.length);

  return {
    encrypted: array_to_base64(combined),
    nonce: array_to_base64(new Uint8Array([1])),
  };
}

export async function encrypt_envelope(
  data: object,
  passphrase: string,
): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const encoder = new TextEncoder();
  const passphrase_bytes = encoder.encode(passphrase);
  const result = await encrypt_envelope_with_bytes(data, passphrase_bytes);

  zero_uint8_array(passphrase_bytes);

  return result;
}

export async function decrypt_envelope_with_bytes<T>(
  encrypted_data: string,
  passphrase_bytes: Uint8Array,
): Promise<T | null> {
  try {
    const combined = base64_to_array(encrypted_data);

    const salt = combined.slice(0, SALT_LENGTH);
    const nonce = combined.slice(SALT_LENGTH, SALT_LENGTH + NONCE_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + NONCE_LENGTH);

    const crypto_key = await derive_envelope_key_from_bytes(
      passphrase_bytes,
      salt,
    );

    const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, ciphertext, nonce);

    const decoder = new TextDecoder();
    const json = decoder.decode(decrypted);

    return normalize_parsed_envelope(JSON.parse(json) as T);
  } catch {
    return null;
  }
}

export async function decrypt_envelope<T>(
  encrypted_data: string,
  passphrase: string,
): Promise<T | null> {
  const encoder = new TextEncoder();
  const passphrase_bytes = encoder.encode(passphrase);
  const result = await decrypt_envelope_with_bytes<T>(
    encrypted_data,
    passphrase_bytes,
  );

  zero_uint8_array(passphrase_bytes);

  return result;
}

export async function decrypt_mail_envelope<T>(
  encrypted: string,
  nonce: string,
  passphrase_bytes: Uint8Array | null,
  identity_key: string | null,
): Promise<T | null> {
  try {
    const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

    if (nonce_bytes.length === 0) {
      try {
        const encrypted_bytes = base64_to_array(encrypted);
        const text = new TextDecoder().decode(encrypted_bytes);

        if (!text.startsWith("-----BEGIN PGP")) {
          return normalize_parsed_envelope(JSON.parse(text) as T);
        }

        const vault = get_vault_from_memory();
        const pass = get_passphrase_from_memory();

        if (vault?.identity_key && pass) {
          const decrypted = await decrypt_message(
            text,
            vault.identity_key,
            pass,
          );

          return normalize_parsed_envelope(JSON.parse(decrypted) as T);
        }

        return null;
      } catch {
        return null;
      }
    }

    if (!passphrase_bytes && !identity_key) return null;

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1 && passphrase_bytes) {
      const result = await decrypt_envelope_with_bytes<T>(
        encrypted,
        passphrase_bytes,
      );

      return result;
    }

    if (!identity_key) return null;

    return await try_decrypt_with_key<T>(encrypted, nonce_bytes, identity_key);
  } catch {
    return null;
  }
}

const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

async function try_decrypt_with_key<T>(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<T | null> {
  const encrypted_bytes = new Uint8Array(base64_to_array(encrypted));

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, encrypted_bytes, nonce_bytes);

      return normalize_parsed_envelope(
        JSON.parse(new TextDecoder().decode(decrypted)) as T,
      );
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_mail_envelope_with_fallback<T>(
  encrypted: string,
  nonce: string,
  passphrase_bytes: Uint8Array | null,
  identity_key: string | null,
  previous_keys?: string[],
): Promise<{ data: T | null; used_key_index: number }> {
  try {
    const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

    if (nonce_bytes.length === 0) {
      try {
        const encrypted_bytes = base64_to_array(encrypted);
        const json = new TextDecoder().decode(encrypted_bytes);

        return {
          data: normalize_parsed_envelope(JSON.parse(json) as T),
          used_key_index: 0,
        };
      } catch {
        return { data: null, used_key_index: -1 };
      }
    }

    if (!passphrase_bytes && !identity_key) {
      return { data: null, used_key_index: -1 };
    }

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1 && passphrase_bytes) {
      const result = await decrypt_envelope_with_bytes<T>(
        encrypted,
        passphrase_bytes,
      );

      return { data: result, used_key_index: 0 };
    }

    if (identity_key) {
      const result = await try_decrypt_with_key<T>(
        encrypted,
        nonce_bytes,
        identity_key,
      );

      if (result !== null) {
        return { data: result, used_key_index: 0 };
      }
    }

    if (previous_keys && previous_keys.length > 0) {
      for (let i = 0; i < previous_keys.length; i++) {
        const result = await try_decrypt_with_key<T>(
          encrypted,
          nonce_bytes,
          previous_keys[i],
        );

        if (result !== null) {
          return { data: result, used_key_index: i + 1 };
        }
      }
    }

    return { data: null, used_key_index: -1 };
  } catch {
    return { data: null, used_key_index: -1 };
  }
}

export interface EncryptedBlob {
  encrypted_data: string;
  nonce: string;
  version: number;
}

const METADATA_CURRENT_VERSION = 1;
const METADATA_INFO_PREFIX = "aster-metadata-encryption-v1:";

export async function derive_metadata_key(
  master_key: Uint8Array,
  context: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode(METADATA_INFO_PREFIX + context);
  const salt = encoder.encode("aster-metadata-salt-v1");

  const key_material = await crypto.subtle.importKey(
    "raw",
    master_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt_metadata<T>(
  data: T,
  master_key: Uint8Array,
  context: string = "default",
): Promise<EncryptedBlob | null> {
  try {
    const crypto_key = await derive_metadata_key(master_key, context);
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      crypto_key,
      plaintext,
    );

    return {
      encrypted_data: array_to_base64(new Uint8Array(ciphertext)),
      nonce: array_to_base64(nonce),
      version: METADATA_CURRENT_VERSION,
    };
  } catch {
    return null;
  }
}

export async function decrypt_metadata<T>(
  blob: EncryptedBlob,
  master_key: Uint8Array,
  context: string = "default",
): Promise<T | null> {
  try {
    const crypto_key = await derive_metadata_key(master_key, context);
    const nonce = base64_to_array(blob.nonce);
    const ciphertext = base64_to_array(blob.encrypted_data);

    const plaintext = await decrypt_aes_gcm_with_fallback(crypto_key, ciphertext, nonce);

    const decoder = new TextDecoder();

    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function is_encrypted_blob(value: unknown): value is EncryptedBlob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;

  return (
    typeof obj.encrypted_data === "string" &&
    typeof obj.nonce === "string" &&
    typeof obj.version === "number"
  );
}
