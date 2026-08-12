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

export { decrypt_vault, decrypt_vault_to_handles, encrypt_vault, normalize_vault_fields } from "./key_manager_pgp_vault";
export { derive_password_hash, generate_identity_keypair, generate_recovery_codes, generate_signed_prekey, hash_email, hash_recovery_email, prepare_pgp_key_data, reprotect_pgp_key, string_to_passphrase, zero_passphrase } from "./key_manager_pgp_keygen";
export { sign_ratchet_prekey_bundle, verify_key_binding, verify_prekey_signature, verify_ratchet_prekey_bundle } from "./key_manager_pgp_signing";
export type { RatchetPrekeyVerdict } from "./key_manager_pgp_signing";
export { clear_unlocked_key_cache } from "./key_manager_pgp_unlocked_cache";
export { decrypt_message, decrypt_message_verified, decrypt_message_verified_with_any_key, decrypt_message_with_any_key, decrypt_message_with_handle, decrypt_message_with_handle_verified, derive_public_keys_from_private, encrypt_message, encrypt_message_multi, has_usable_signing_key, select_private_key_matching_public, sign_detached } from "./key_manager_pgp_messages";
export type { decrypted_message_result, detached_signature_result, sender_signing_key, sender_verification_status } from "./key_manager_pgp_messages";
export { clear_key_handle, clear_key_manager_state, clear_vault_handle, get_key_usage_log, get_usage_statistics, with_decrypted_key } from "./key_manager_pgp_usage";
