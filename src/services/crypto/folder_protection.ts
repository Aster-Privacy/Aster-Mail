import { array_to_base64, base64_to_array } from "./base64";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
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
const PBKDF2_ITERATIONS_LEGACY = 100000;
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES_LEGACY = 16;
const SALT_BYTES = 32;
const AUTH_KEY_CONTEXT = "astermail-folder-auth-v1";
const ENCRYPT_KEY_CONTEXT = "astermail-folder-encrypt-v1";

async function hkdf_expand(
  ikm: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);

  const encoder = new TextEncoder();
  const info_bytes = encoder.encode(info);

  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: new Uint8Array(32),
      info: info_bytes,
    },
    key,
    length * 8,
  );

  return new Uint8Array(derived);
}

interface DerivedKeys {
  auth_key: Uint8Array;
  encryption_key: Uint8Array;
  salt: Uint8Array;
}

export async function derive_password_keys(
  password: string,
  existing_salt?: Uint8Array,
): Promise<DerivedKeys> {
  const salt =
    existing_salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const iterations =
    salt.length <= SALT_BYTES_LEGACY
      ? PBKDF2_ITERATIONS_LEGACY
      : PBKDF2_ITERATIONS;

  const encoder = new TextEncoder();
  const password_bytes = encoder.encode(password);

  const key_material = await crypto.subtle.importKey(
    "raw",
    password_bytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations,
      hash: HASH_ALG,
    },
    key_material,
    256,
  );

  const password_derived_key = new Uint8Array(derived_bits);

  const auth_key = await hkdf_expand(
    password_derived_key,
    AUTH_KEY_CONTEXT,
    32,
  );
  const encryption_key = await hkdf_expand(
    password_derived_key,
    ENCRYPT_KEY_CONTEXT,
    32,
  );

  zero_uint8_array(password_derived_key);

  return { auth_key, encryption_key, salt };
}

export function generate_folder_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

interface EncryptedKeyResult {
  encrypted: Uint8Array;
  nonce: Uint8Array;
}

export async function encrypt_folder_key(
  folder_key: Uint8Array,
  encryption_key: Uint8Array,
): Promise<EncryptedKeyResult> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const aes_key = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    folder_key,
  );

  return {
    encrypted: new Uint8Array(encrypted),
    nonce,
  };
}

export async function decrypt_folder_key(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  encryption_key: Uint8Array,
): Promise<Uint8Array> {
  const aes_key = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const decrypted = await decrypt_aes_gcm_with_fallback(
    aes_key,
    encrypted,
    nonce,
  );

  return new Uint8Array(decrypted);
}

export interface SetPasswordData {
  password_hash: string;
  password_salt: string;
  encrypted_folder_key: string;
  folder_key_nonce: string;
}

export async function prepare_set_password(
  password: string,
): Promise<{ data: SetPasswordData; folder_key: Uint8Array }> {
  const { auth_key, encryption_key, salt } =
    await derive_password_keys(password);

  const folder_key = generate_folder_key();

  const { encrypted, nonce } = await encrypt_folder_key(
    folder_key,
    encryption_key,
  );

  zero_uint8_array(encryption_key);

  return {
    data: {
      password_hash: array_to_base64(auth_key),
      password_salt: array_to_base64(salt),
      encrypted_folder_key: array_to_base64(encrypted),
      folder_key_nonce: array_to_base64(nonce),
    },
    folder_key,
  };
}

export interface ChangePasswordData {
  old_password_hash: string;
  new_password_hash: string;
  new_password_salt: string;
  new_encrypted_folder_key: string;
  new_folder_key_nonce: string;
}

export async function prepare_change_password(
  old_password: string,
  new_password: string,
  old_salt_base64: string,
  existing_folder_key: Uint8Array,
): Promise<ChangePasswordData> {
  const old_salt = base64_to_array(old_salt_base64);
  const { auth_key: old_auth_key } = await derive_password_keys(
    old_password,
    old_salt,
  );

  const {
    auth_key: new_auth_key,
    encryption_key: new_encryption_key,
    salt: new_salt,
  } = await derive_password_keys(new_password);

  const { encrypted: new_encrypted, nonce: new_nonce } =
    await encrypt_folder_key(existing_folder_key, new_encryption_key);

  zero_uint8_array(new_encryption_key);

  return {
    old_password_hash: array_to_base64(old_auth_key),
    new_password_hash: array_to_base64(new_auth_key),
    new_password_salt: array_to_base64(new_salt),
    new_encrypted_folder_key: array_to_base64(new_encrypted),
    new_folder_key_nonce: array_to_base64(new_nonce),
  };
}

export { array_to_base64, base64_to_array };
