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
import type {
  EncryptedField,
  EncryptedSecureAttachment,
} from "../crypto/secure_message_crypto";

export interface SecureViewMetadata {
  sender_display_name?: string;
  sender_email: string;
  recipient_email: string;
  expires_at: string;
  requires_password: boolean;
  is_expired: boolean;
  time_remaining_seconds: number;
  is_zero_knowledge: boolean;
  kdf_salt?: string;
}

export interface SecureViewContent {
  is_zero_knowledge: boolean;
  kdf_salt?: string;
  encrypted_subject?: EncryptedField;
  encrypted_body?: EncryptedField;
  encrypted_attachments?: EncryptedSecureAttachment[];
  subject?: string;
  body?: string;
  sender_name?: string;
  sender_email: string;
  expires_at: string;
  time_remaining_seconds: number;
  kem_ciphertext?: string;
  encrypted_kem_seed?: string;
  kem_seed_nonce?: string;
  encrypted_attachments_bundle?: string | null;
}

export interface SecureViewVerifyResponse {
  success: boolean;
  content?: SecureViewContent;
  error?: string;
}

export async function get_secure_view_metadata(
  token: string,
): Promise<SecureViewMetadata> {
  const response = await fetch(`/api/view/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`secure_view_metadata_failed_${response.status}`);
  }

  return (await response.json()) as SecureViewMetadata;
}

export async function verify_secure_view(
  token: string,
  auth_proof: string,
): Promise<SecureViewVerifyResponse> {
  const response = await fetch(
    `/api/view/${encodeURIComponent(token)}/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ auth_proof }),
    },
  );

  if (!response.ok) {
    throw new Error(`secure_view_verify_failed_${response.status}`);
  }

  return (await response.json()) as SecureViewVerifyResponse;
}
