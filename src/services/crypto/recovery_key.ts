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
import { array_to_base64 } from "./base64";
import {
  EncryptedVault,
  base64_to_array,
  normalize_vault_fields,
} from "./key_manager";
import { zero_uint8_array } from "./secure_memory";

import { HASH_ALG } from "@/services/crypto/constants";

const PBKDF2_ITERATIONS = 310000;

const RECOVERY_CODE_SEGMENT_LENGTH = 4;
const RECOVERY_CODE_SEGMENT_COUNTS = [4, 3];

export function canonicalize_recovery_code(code: string): string {
  const stripped = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (stripped.startsWith("ASTER")) {
    const body = stripped.slice(5);

    for (const segment_count of RECOVERY_CODE_SEGMENT_COUNTS) {
      if (body.length !== segment_count * RECOVERY_CODE_SEGMENT_LENGTH) {
        continue;
      }

      const segments: string[] = [];

      for (let i = 0; i < segment_count; i++) {
        segments.push(
          body.slice(
            i * RECOVERY_CODE_SEGMENT_LENGTH,
            (i + 1) * RECOVERY_CODE_SEGMENT_LENGTH,
          ),
        );
      }

      return `ASTER-${segments.join("-")}`;
    }
  }

  return code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function is_valid_recovery_code(code: string): boolean {
  const segments = canonicalize_recovery_code(code).split("-");

  if (segments[0] !== "ASTER") {
    return false;
  }

  if (!RECOVERY_CODE_SEGMENT_COUNTS.includes(segments.length - 1)) {
    return false;
  }

  return segments
    .slice(1)
    .every((segment) => /^[A-Z0-9]{4}$/.test(segment));
}

export interface VaultBackup {
  encrypted_data: string;
  nonce: string;
  salt: string;
}

export interface EncryptedRecoveryKey {
  encrypted_key: string;
  nonce: string;
  salt: string;
}

export interface RecoveryShareData {
  code_hash: string;
  code_salt: string;
  encrypted_recovery_key: string;
  recovery_key_nonce: string;
}

export function generate_recovery_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encrypt_vault_backup(
  vault: EncryptedVault,
  recovery_key: Uint8Array,
): Promise<VaultBackup> {
  const vault_json = JSON.stringify(vault);
  const vault_data = new TextEncoder().encode(vault_json);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v1"),
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    vault_data,
  );

  return {
    encrypted_data: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

export async function decrypt_vault_backup(
  backup: VaultBackup,
  recovery_key: Uint8Array,
): Promise<EncryptedVault> {
  const encrypted_data = base64_to_array(backup.encrypted_data);
  const nonce = base64_to_array(backup.nonce);
  const salt = base64_to_array(backup.salt);

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v1"),
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    encrypted_data,
  );

  const vault_json = new TextDecoder().decode(decrypted);

  return normalize_vault_fields(JSON.parse(vault_json));
}

export async function encrypt_recovery_key_with_code(
  recovery_key: Uint8Array,
  code: string,
): Promise<EncryptedRecoveryKey> {
  const normalized_code = canonicalize_recovery_code(code);
  const code_bytes = new TextEncoder().encode(normalized_code);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const key_material = await crypto.subtle.importKey(
    "raw",
    code_bytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const derived_key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    derived_key,
    recovery_key,
  );

  return {
    encrypted_key: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

export async function decrypt_recovery_key_with_code(
  encrypted: EncryptedRecoveryKey,
  code: string,
): Promise<Uint8Array> {
  const normalized_code = canonicalize_recovery_code(code);
  const code_bytes = new TextEncoder().encode(normalized_code);
  const encrypted_key = base64_to_array(encrypted.encrypted_key);
  const nonce = base64_to_array(encrypted.nonce);
  const salt = base64_to_array(encrypted.salt);

  const key_material = await crypto.subtle.importKey(
    "raw",
    code_bytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const derived_key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    derived_key,
    encrypted_key,
  );

  return new Uint8Array(decrypted);
}

export async function hash_recovery_code(code: string): Promise<string> {
  const normalized_code = canonicalize_recovery_code(code);
  const code_bytes = new TextEncoder().encode(normalized_code);
  const hash = await crypto.subtle.digest(HASH_ALG, code_bytes);

  return array_to_base64(new Uint8Array(hash));
}

export async function generate_recovery_share_data(
  code: string,
  recovery_key: Uint8Array,
): Promise<RecoveryShareData> {
  const code_hash = await hash_recovery_code(code);
  const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);

  return {
    code_hash,
    code_salt: encrypted.salt,
    encrypted_recovery_key: encrypted.encrypted_key,
    recovery_key_nonce: encrypted.nonce,
  };
}

export async function generate_all_recovery_shares(
  codes: string[],
  recovery_key: Uint8Array,
): Promise<RecoveryShareData[]> {
  const shares: RecoveryShareData[] = [];

  for (const code of codes) {
    const share = await generate_recovery_share_data(code, recovery_key);

    shares.push(share);
  }

  return shares;
}

export function clear_recovery_key(recovery_key: Uint8Array): void {
  zero_uint8_array(recovery_key);
}
