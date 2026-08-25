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
import { user_facing_error } from "@/utils/user_facing_error";
import * as openpgp from "openpgp";

import {
  KEY_USAGE_LOG,
  PINNED_FINGERPRINTS,
  decrypt_key_material,
  detect_anomalous_usage,
  log_key_usage,
  type EncryptedKeyHandle,
  type KeyOperation,
  type KeyUsageRecord,
  type SecureVaultHandle,
  verify_pinned_fingerprint,
} from "./key_manager_core";
import { clear_unlocked_key_cache } from "./key_manager_pgp_unlocked_cache";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

export async function with_decrypted_key<T>(
  handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  if (detect_anomalous_usage(handle.key_id)) {
    log_key_usage(handle.key_id, "decrypt", false, "anomalous_usage_detected");
    throw new Error("security_violation: anomalous key usage detected");
  }

  const encrypted_data = handle.encrypted_key;
  const salt = encrypted_data.slice(0, 32);
  const nonce = encrypted_data.slice(32, 44);
  const ciphertext = encrypted_data.slice(44);

  let decrypted_material: Uint8Array | null = null;
  let key_string: string | null = null;

  try {
    decrypted_material = await decrypt_key_material(
      ciphertext,
      salt,
      nonce,
      passphrase,
    );
    const decoder = new TextDecoder();

    key_string = decoder.decode(decrypted_material);

    const public_key_obj = await openpgp.readPrivateKey({
      armoredKey: key_string,
    });
    const current_fingerprint = public_key_obj.getFingerprint();

    const fingerprint_valid = await verify_pinned_fingerprint(
      handle.key_id,
      current_fingerprint,
    );

    if (!fingerprint_valid) {
      throw new Error(
        "fingerprint_mismatch: key fingerprint verification failed",
      );
    }

    log_key_usage(handle.key_id, "decrypt", true);

    const result = await operation(key_string);

    return result;
  } catch (error) {
    log_key_usage(
      handle.key_id,
      "decrypt",
      false,
      user_facing_error(error, "unknown"),
    );
    throw error;
  } finally {
    if (decrypted_material) {
      zero_uint8_array(decrypted_material);
    }
  }
}

export function get_key_usage_log(key_id?: string): KeyUsageRecord[] {
  if (key_id) {
    return KEY_USAGE_LOG.filter((r) => r.key_id === key_id);
  }

  return [...KEY_USAGE_LOG];
}

export function get_usage_statistics(key_id: string): {
  total_operations: number;
  successful_operations: number;
  failed_operations: number;
  last_used: number | null;
  operations_by_type: Record<KeyOperation, number>;
} {
  const records = KEY_USAGE_LOG.filter((r) => r.key_id === key_id);

  const operations_by_type: Record<KeyOperation, number> = {
    decrypt: 0,
    sign: 0,
    verify: 0,
    encrypt: 0,
    load: 0,
    generate: 0,
  };

  let successful = 0;
  let failed = 0;
  let last_used: number | null = null;

  for (const record of records) {
    operations_by_type[record.operation]++;
    if (record.success) {
      successful++;
    } else {
      failed++;
    }
    if (last_used === null || record.timestamp > last_used) {
      last_used = record.timestamp;
    }
  }

  return {
    total_operations: records.length,
    successful_operations: successful,
    failed_operations: failed,
    last_used,
    operations_by_type,
  };
}

export function clear_key_manager_state(): void {
  KEY_USAGE_LOG.length = 0;
  PINNED_FINGERPRINTS.clear();
  clear_unlocked_key_cache();
}

export function clear_key_handle(handle: EncryptedKeyHandle): void {
  zero_uint8_array(handle.encrypted_key);
  log_key_usage(handle.key_id, "decrypt", true, "handle_cleared");
}

export function clear_vault_handle(vault_handle: SecureVaultHandle): void {
  clear_key_handle(vault_handle.identity_handle);
  clear_key_handle(vault_handle.signed_prekey_handle);
}
