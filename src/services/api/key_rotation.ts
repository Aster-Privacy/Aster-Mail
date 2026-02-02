import { api_client } from "./client";

export interface IdentityKeyStatus {
  key_created_at: string | null;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  current_public_key: string | null;
}

export interface RotateIdentityKeyRequest {
  new_identity_key: string;
  rotation_signature: string;
  new_signed_prekey?: string;
  new_signed_prekey_id?: number;
  new_signed_prekey_signature?: string;
  encrypted_vault?: string;
  vault_nonce?: string;
}

export interface RotateIdentityKeyResponse {
  success: boolean;
  new_identity_key: string;
  rotated_at: string;
  new_key_fingerprint: string | null;
}

export async function get_identity_key_status(): Promise<{
  data?: IdentityKeyStatus;
  error?: string;
}> {
  const response = await api_client.get<IdentityKeyStatus>(
    "/crypto/v1/keys/identity/status",
  );

  if (response.error) {
    return { error: response.error };
  }

  return { data: response.data ?? undefined };
}

export async function rotate_identity_key(
  request: RotateIdentityKeyRequest,
): Promise<{ data?: RotateIdentityKeyResponse; error?: string }> {
  const response = await api_client.post<RotateIdentityKeyResponse>(
    "/crypto/v1/keys/identity/rotate",
    request,
  );

  if (response.error) {
    return { error: response.error };
  }

  return { data: response.data ?? undefined };
}
