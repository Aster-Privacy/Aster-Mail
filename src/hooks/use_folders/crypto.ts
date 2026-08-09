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
import { HASH_ALG } from "@/services/crypto/constants";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  
  
  
  
  
  
  type FolderDefinition,
  
  
  
  
} from "@/services/api/folders";
import { DecryptedFolder, is_system_folder_type } from "./tree";

export function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

export function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function generate_random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generate_folder_token(): string {
  const bytes = generate_random_bytes(16);

  return array_to_base64(bytes);
}

export async function derive_folder_key(identity_key: string): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-labels-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt_folder_field(
  field: string,
  identity_key: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_folder_key(identity_key);
  const nonce = generate_random_bytes(12);
  const data = new TextEncoder().encode(field);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
  };
}

export async function decrypt_folder_field(
  encrypted: string,
  nonce: string,
  identity_key: string,
): Promise<string> {
  const key = await derive_folder_key(identity_key);
  const encrypted_data = base64_to_array(encrypted);
  const nonce_data = base64_to_array(nonce);

  const decrypted = await decrypt_aes_gcm_with_fallback(
    key,
    encrypted_data,
    nonce_data,
  );

  return new TextDecoder().decode(decrypted);
}

export async function decrypt_folder(
  folder: FolderDefinition,
  identity_key: string,
): Promise<DecryptedFolder | null> {
  let name = "";
  let color: string | undefined;
  let icon: string | undefined;

  try {
    name = await decrypt_folder_field(
      folder.encrypted_name,
      folder.name_nonce,
      identity_key,
    );
  } catch {
    return null;
  }

  if (folder.encrypted_color && folder.color_nonce) {
    try {
      color = await decrypt_folder_field(
        folder.encrypted_color,
        folder.color_nonce,
        identity_key,
      );
    } catch {
      color = undefined;
    }
  }

  if (folder.encrypted_icon && folder.icon_nonce) {
    try {
      icon = await decrypt_folder_field(
        folder.encrypted_icon,
        folder.icon_nonce,
        identity_key,
      );
    } catch {
      icon = undefined;
    }
  }

  const folder_type = folder.folder_type ?? "custom";

  return {
    id: folder.id,
    folder_token: folder.folder_token,
    name,
    color,
    icon,
    is_system: folder.is_system || is_system_folder_type(folder_type),
    is_locked: folder.is_locked ?? false,
    folder_type,
    is_password_protected: folder.is_password_protected ?? false,
    password_set: folder.password_set ?? false,
    sort_order: folder.sort_order,
    parent_token: folder.parent_token,
    item_count: folder.item_count,
    unread_count: folder.unread_count,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  };
}

