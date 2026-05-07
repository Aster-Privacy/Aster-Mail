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
import { RecoveryShareData } from "../crypto/recovery_key";

import { api_client, ApiResponse } from "./client";

interface InitiateRecoveryResponse {
  encrypted_vault_backup: string;
  vault_backup_nonce: string;
  recovery_key_salt: string;
  encrypted_recovery_key: string;
  recovery_key_nonce: string;
  code_salt: string;
  recovery_token: string;
}

interface CompleteRecoveryResponse {
  success: boolean;
}

interface SaveRecoveryBackupResponse {
  success: boolean;
}

interface NewPgpKeyData {
  fingerprint: string;
  key_id: string;
  public_key_armored: string;
  encrypted_private_key: string;
  private_key_nonce: string;
}

export async function initiate_recovery(
  code_hash: string,
  email: string,
): Promise<ApiResponse<InitiateRecoveryResponse>> {
  return api_client.post<InitiateRecoveryResponse>(
    "/core/v1/recovery/initiate",
    {
      code_hash,
      email,
    },
  );
}

export async function complete_recovery(
  recovery_token: string,
  new_password_hash: string,
  new_password_salt: string,
  new_encrypted_vault: string,
  new_vault_nonce: string,
  new_recovery_shares: RecoveryShareData[],
  new_encrypted_vault_backup: string,
  new_vault_backup_nonce: string,
  new_recovery_key_salt: string,
  new_identity_key?: string,
  new_signed_prekey?: string,
  new_signed_prekey_signature?: string,
  new_pgp_key?: NewPgpKeyData,
): Promise<ApiResponse<CompleteRecoveryResponse>> {
  return api_client.post<CompleteRecoveryResponse>(
    "/core/v1/recovery/complete",
    {
      recovery_token,
      new_password_hash,
      new_password_salt,
      new_encrypted_vault,
      new_vault_nonce,
      new_recovery_shares,
      new_encrypted_vault_backup,
      new_vault_backup_nonce,
      new_recovery_key_salt,
      new_identity_key,
      new_signed_prekey,
      new_signed_prekey_signature,
      new_pgp_key,
    },
  );
}

export async function save_recovery_backup(
  encrypted_vault_backup: string,
  vault_backup_nonce: string,
  recovery_key_salt: string,
  recovery_shares: RecoveryShareData[],
): Promise<ApiResponse<SaveRecoveryBackupResponse>> {
  return api_client.post<SaveRecoveryBackupResponse>(
    "/core/v1/recovery/backup",
    {
      encrypted_vault_backup,
      vault_backup_nonce,
      recovery_key_salt,
      recovery_shares,
    },
  );
}
