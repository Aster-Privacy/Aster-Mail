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
export {
  base64_to_array,
  array_to_base64,
  secure_zero_memory,
  generate_random_bytes,
  generate_key_id,
  compute_hash,
  verify_entropy_quality,
  log_key_usage,
  detect_anomalous_usage,
  pin_fingerprint,
  verify_pinned_fingerprint,
  derive_key_encryption_key,
  encrypt_key_material,
  decrypt_key_material,
  create_encrypted_key_handle,
  get_unbiased_random_index,
  HASH_ALG,
  KEY_DERIVATION_ITERATIONS,
  KEY_USAGE_LOG,
  PINNED_FINGERPRINTS,
} from "./key_manager_core";

export type {
  KeyPair,
  PgpKeyData,
  EncryptedVault,
  VaultEncryptionResult,
  EncryptedKeyHandle,
  SecureVaultHandle,
  KeyUsageRecord,
  PinnedFingerprint,
  KeyType,
  KeyOperation,
} from "./key_manager_core";

export {
  with_decrypted_key,
  hash_email,
  hash_recovery_email,
  derive_password_hash,
  generate_identity_keypair,
  generate_signed_prekey,
  verify_prekey_signature,
  verify_key_binding,
  generate_recovery_codes,
  prepare_pgp_key_data,
  encrypt_vault,
  decrypt_vault_to_handles,
  decrypt_vault,
  encrypt_message,
  encrypt_message_multi,
  decrypt_message,
  decrypt_message_with_handle,
  string_to_passphrase,
  zero_passphrase,
  get_key_usage_log,
  get_usage_statistics,
  clear_key_manager_state,
  clear_key_handle,
  clear_vault_handle,
} from "./key_manager_pgp";

export {
  generate_ke_keypair,
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_as_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
  encrypt_with_crypto_key,
  decrypt_with_crypto_key,
  derive_chain_key_as_crypto_key,
  import_hkdf_key,
  import_aes_key,
} from "./key_manager_ke";
