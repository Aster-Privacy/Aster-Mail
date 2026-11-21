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
const FOLDER_KEY_AAD_CONTEXT = "astermail-folder-key-v2:";

export const FOLDER_KEY_VERSION_LEGACY = 1;
export const FOLDER_KEY_VERSION = 2;

export class FolderKdfDowngradeError extends Error {
  constructor() {
    super("folder password format downgrade refused");
    this.name = "FolderKdfDowngradeError";
  }
}

export function folder_salt_is_current(salt: Uint8Array): boolean {
  if (salt.length === SALT_BYTES) return true;
  if (salt.length === SALT_BYTES_LEGACY) return false;
  throw new Error("invalid folder password salt");
}

export function folder_key_aad(folder_id: string): Uint8Array {
  if (!folder_id) throw new Error("folder id required");

  return new TextEncoder().encode(
    FOLDER_KEY_AAD_CONTEXT + folder_id.toLowerCase(),
  );
}

export interface FolderKeyFormat {
  allow_legacy_salt: boolean;
  bound: boolean;
}

export function parse_folder_key_version(version: unknown): number {
  if (version === undefined || version === null) {
    return FOLDER_KEY_VERSION_LEGACY;
  }
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < FOLDER_KEY_VERSION_LEGACY ||
    version > FOLDER_KEY_VERSION
  ) {
    throw new Error("unsupported folder key version");
  }

  return version;
}

export function salt_rule_for_pin(pin_level: number): boolean {
  return pin_level < 1;
}

export function required_folder_key_format(
  pin_level: number,
  server_version: unknown,
  salt: Uint8Array,
): FolderKeyFormat {
  const version = parse_folder_key_version(server_version);
  const salt_current = folder_salt_is_current(salt);

  if (pin_level >= FOLDER_KEY_VERSION && version < FOLDER_KEY_VERSION) {
    throw new FolderKdfDowngradeError();
  }
  if (pin_level >= 1 && !salt_current) {
    throw new FolderKdfDowngradeError();
  }

  const bound = version >= FOLDER_KEY_VERSION;

  if (bound && !salt_current) {
    throw new FolderKdfDowngradeError();
  }

  return { allow_legacy_salt: salt_rule_for_pin(pin_level) && !bound, bound };
}

export function folder_writes_bound(
  pin_level: number,
  stored_keys_ready: boolean,
): boolean {
  return stored_keys_ready || pin_level >= FOLDER_KEY_VERSION;
}

export function folder_pin_level_for_write(bound: boolean): number {
  return bound ? FOLDER_KEY_VERSION : 1;
}

export function folder_pin_level_after_unlock(
  format: FolderKeyFormat,
  salt: Uint8Array,
): number {
  if (format.bound) return FOLDER_KEY_VERSION;

  return folder_salt_is_current(salt) ? 1 : 0;
}

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
  allow_legacy = false,
): Promise<DerivedKeys> {
  const salt =
    existing_salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const current = folder_salt_is_current(salt);

  if (!current && !allow_legacy) {
    throw new FolderKdfDowngradeError();
  }

  const iterations = current ? PBKDF2_ITERATIONS : PBKDF2_ITERATIONS_LEGACY;

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
  bound_folder_id?: string,
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
    bound_folder_id === undefined
      ? { name: "AES-GCM", iv: nonce }
      : {
          name: "AES-GCM",
          iv: nonce,
          additionalData: folder_key_aad(bound_folder_id),
        },
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
  bound_folder_id?: string,
): Promise<Uint8Array> {
  const aes_key = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  if (bound_folder_id !== undefined) {
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: folder_key_aad(bound_folder_id),
      },
      aes_key,
      encrypted,
    );

    return new Uint8Array(opened);
  }

  const decrypted = await decrypt_aes_gcm_with_fallback(
    aes_key,
    encrypted,
    nonce,
  );

  return new Uint8Array(decrypted);
}

export interface FolderUnlockOpening {
  folder_key: Uint8Array;
  format: FolderKeyFormat;
  rebind: boolean;
}

export function folder_wrap_rebind_allowed(
  pin_level: number,
  server_version: unknown,
  salt: Uint8Array,
): boolean {
  return (
    pin_level >= FOLDER_KEY_VERSION &&
    parse_folder_key_version(server_version) < FOLDER_KEY_VERSION &&
    folder_salt_is_current(salt)
  );
}

async function open_unbound_wrap_strict(
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
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    encrypted,
  );

  return new Uint8Array(opened);
}

const BOUND_FORMAT: FolderKeyFormat = {
  allow_legacy_salt: false,
  bound: true,
};

function folder_key_version_missing(server_version: unknown): boolean {
  return server_version === undefined || server_version === null;
}

function is_wrong_key_error(caught: unknown): boolean {
  return (
    typeof caught === "object" &&
    caught !== null &&
    (caught as { name?: unknown }).name === "OperationError"
  );
}

async function open_bound_wrap_if_possible(
  folder_id: string,
  encrypted: Uint8Array,
  nonce: Uint8Array,
  encryption_key: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    return await decrypt_folder_key(
      encrypted,
      nonce,
      encryption_key,
      folder_id,
    );
  } catch (caught) {
    if (is_wrong_key_error(caught)) return null;

    throw caught;
  }
}

export async function open_folder_wrap_for_unlock(
  folder_id: string,
  pin_level: number,
  server_version: unknown,
  salt: Uint8Array,
  encrypted: Uint8Array,
  nonce: Uint8Array,
  encryption_key: Uint8Array,
): Promise<FolderUnlockOpening> {
  const maybe_bound =
    folder_key_version_missing(server_version) && folder_salt_is_current(salt);
  let format: FolderKeyFormat;

  try {
    format = required_folder_key_format(pin_level, server_version, salt);
  } catch (caught) {
    if (
      !(caught instanceof FolderKdfDowngradeError) ||
      !folder_wrap_rebind_allowed(pin_level, server_version, salt)
    ) {
      throw caught;
    }

    const bound_key = maybe_bound
      ? await open_bound_wrap_if_possible(
          folder_id,
          encrypted,
          nonce,
          encryption_key,
        )
      : null;

    if (bound_key) {
      return { folder_key: bound_key, format: BOUND_FORMAT, rebind: false };
    }

    const folder_key = await open_unbound_wrap_strict(
      encrypted,
      nonce,
      encryption_key,
    );

    return { folder_key, format: BOUND_FORMAT, rebind: true };
  }

  try {
    const folder_key = await decrypt_folder_key(
      encrypted,
      nonce,
      encryption_key,
      format.bound ? folder_id : undefined,
    );

    return { folder_key, format, rebind: false };
  } catch (caught) {
    if (format.bound || !maybe_bound) throw caught;

    const folder_key = await decrypt_folder_key(
      encrypted,
      nonce,
      encryption_key,
      folder_id,
    );

    return { folder_key, format: BOUND_FORMAT, rebind: false };
  }
}

export interface SetPasswordData {
  password_hash: string;
  password_salt: string;
  encrypted_folder_key: string;
  folder_key_nonce: string;
  folder_key_version: number;
}

export async function prepare_set_password(
  password: string,
  folder_id: string,
  bound = false,
): Promise<{ data: SetPasswordData; folder_key: Uint8Array }> {
  const { auth_key, encryption_key, salt } =
    await derive_password_keys(password);

  const folder_key = generate_folder_key();

  const { encrypted, nonce } = await encrypt_folder_key(
    folder_key,
    encryption_key,
    bound ? folder_id : undefined,
  );

  zero_uint8_array(encryption_key);

  return {
    data: {
      password_hash: array_to_base64(auth_key),
      password_salt: array_to_base64(salt),
      encrypted_folder_key: array_to_base64(encrypted),
      folder_key_nonce: array_to_base64(nonce),
      folder_key_version: bound
        ? FOLDER_KEY_VERSION
        : FOLDER_KEY_VERSION_LEGACY,
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
  new_folder_key_version: number;
}

export async function prepare_change_password(
  old_password: string,
  new_password: string,
  old_salt_base64: string,
  existing_folder_key: Uint8Array,
  folder_id: string,
  pin_level = 0,
  bound = false,
): Promise<ChangePasswordData> {
  const old_salt = base64_to_array(old_salt_base64);
  const { auth_key: old_auth_key, encryption_key: old_encryption_key } =
    await derive_password_keys(
      old_password,
      old_salt,
      salt_rule_for_pin(pin_level),
    );

  zero_uint8_array(old_encryption_key);

  const {
    auth_key: new_auth_key,
    encryption_key: new_encryption_key,
    salt: new_salt,
  } = await derive_password_keys(new_password);

  const { encrypted: new_encrypted, nonce: new_nonce } =
    await encrypt_folder_key(
      existing_folder_key,
      new_encryption_key,
      bound ? folder_id : undefined,
    );

  zero_uint8_array(new_encryption_key);

  return {
    old_password_hash: array_to_base64(old_auth_key),
    new_password_hash: array_to_base64(new_auth_key),
    new_password_salt: array_to_base64(new_salt),
    new_encrypted_folder_key: array_to_base64(new_encrypted),
    new_folder_key_nonce: array_to_base64(new_nonce),
    new_folder_key_version: bound
      ? FOLDER_KEY_VERSION
      : FOLDER_KEY_VERSION_LEGACY,
  };
}

export { array_to_base64, base64_to_array };
