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
