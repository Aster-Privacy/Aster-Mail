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

export async function initiate_recovery(
  code_hash: string,
): Promise<ApiResponse<InitiateRecoveryResponse>> {
  return api_client.post<InitiateRecoveryResponse>("/recovery/initiate", {
    code_hash,
  });
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
): Promise<ApiResponse<CompleteRecoveryResponse>> {
  return api_client.post<CompleteRecoveryResponse>("/recovery/complete", {
    recovery_token,
    new_password_hash,
    new_password_salt,
    new_encrypted_vault,
    new_vault_nonce,
    new_recovery_shares,
    new_encrypted_vault_backup,
    new_vault_backup_nonce,
    new_recovery_key_salt,
  });
}

export async function save_recovery_backup(
  encrypted_vault_backup: string,
  vault_backup_nonce: string,
  recovery_key_salt: string,
  recovery_shares: RecoveryShareData[],
): Promise<ApiResponse<SaveRecoveryBackupResponse>> {
  return api_client.post<SaveRecoveryBackupResponse>("/recovery/backup", {
    encrypted_vault_backup,
    vault_backup_nonce,
    recovery_key_salt,
    recovery_shares,
  });
}
