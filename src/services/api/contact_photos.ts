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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import type {
  ContactPhoto,
  ContactPhotoMeta,
  DecryptedContactPhoto,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import { get_contacts_encryption_key } from "./contacts";

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export async function upload_contact_photo(
  contact_id: string,
  file: File,
): Promise<ApiResponse<ContactPhoto>> {
  const key = await get_contacts_encryption_key();
  const array_buffer = await file.arrayBuffer();
  const photo_data = new Uint8Array(array_buffer);

  const data_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: data_nonce },
    key,
    photo_data,
  );

  const meta: ContactPhotoMeta = {
    filename: file.name,
    mime_type: file.type,
  };

  const meta_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_meta = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: meta_nonce },
    key,
    new TextEncoder().encode(JSON.stringify(meta)),
  );

  return api_client.post<ContactPhoto>(`/contacts/v1/${contact_id}/photo`, {
    encrypted_data: array_to_base64(new Uint8Array(encrypted_data)),
    data_nonce: array_to_base64(data_nonce),
    encrypted_meta: array_to_base64(new Uint8Array(encrypted_meta)),
    meta_nonce: array_to_base64(meta_nonce),
    size_bytes: file.size,
  });
}

export async function get_contact_photo(
  contact_id: string,
): Promise<ApiResponse<DecryptedContactPhoto | null>> {
  const response = await api_client.get<ContactPhoto>(
    `/contacts/v1/${contact_id}/photo`,
  );

  if (response.error || !response.data) {
    if (response.error?.includes("not found")) {
      return { data: null };
    }

    return { error: response.error || "Failed to fetch photo" };
  }

  try {
    const key = await get_contacts_encryption_key();

    const decrypted_data = await decrypt_aes_gcm_with_fallback(key, base64_to_array(response.data.encrypted_data), base64_to_array(response.data.data_nonce));

    const decrypted_meta = await decrypt_aes_gcm_with_fallback(key, base64_to_array(response.data.encrypted_meta), base64_to_array(response.data.meta_nonce));

    const meta: ContactPhotoMeta = JSON.parse(
      new TextDecoder().decode(decrypted_meta),
    );

    const blob = new Blob([decrypted_data], { type: meta.mime_type });
    const blob_url = URL.createObjectURL(blob);

    return {
      data: {
        id: response.data.id,
        contact_id: response.data.contact_id,
        data: new Uint8Array(decrypted_data),
        meta,
        blob_url,
        created_at: response.data.created_at,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt photo",
    };
  }
}

export async function delete_contact_photo(
  contact_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/v1/${contact_id}/photo`,
  );
}

export function revoke_photo_blob_url(blob_url: string): void {
  URL.revokeObjectURL(blob_url);
}
