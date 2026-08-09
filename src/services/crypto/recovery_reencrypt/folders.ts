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
import type { } from "../key_manager";
import { } from "../key_manager";
import { } from "../memory_key_store";
import { } from "../secure_memory";
import { } from "../legacy_keks";
import { api_client } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import { } from "@/services/api/aliases";
import { } from "@/services/api/contacts";
import { } from "@/services/api/alias_pins";
import { } from "@/services/api/alias_contacts";
import { } from "@/services/api/alias_destinations";
import { } from "@/services/api/alias_directories";
import { } from "@/services/api/auth";
import { } from "@/services/crypto/envelope";


import { re_encrypt_field } from "./key_helpers";
export async function derive_folder_aes_key(
  identity_key: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(identity_key + "astermail-labels-v1");
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function re_encrypt_folders(
  old_identity_key: string,
  new_identity_key: string,
): Promise<boolean> {
  if (old_identity_key === new_identity_key) return true;

  const [old_key, new_key] = await Promise.all([
    derive_folder_aes_key(old_identity_key, ["decrypt"]),
    derive_folder_aes_key(new_identity_key, ["encrypt"]),
  ]);

  let offset = 0;
  let ok = true;

  while (true) {
    const resp = await api_client.get<{
      labels: Array<{
        id: string;
        encrypted_name: string;
        name_nonce: string;
        encrypted_color?: string;
        color_nonce?: string;
        encrypted_icon?: string;
        icon_nonce?: string;
      }>;
      total: number;
      has_more: boolean;
    }>(`/mail/v1/labels?limit=100&offset=${offset}`);

    if (resp.error || !resp.data) {
      ok = false;
      break;
    }

    for (const folder of resp.data.labels) {
      try {
        const updates: Record<string, string> = {};
        const name = await re_encrypt_field(
          folder.encrypted_name,
          folder.name_nonce,
          old_key,
          new_key,
        );

        updates.encrypted_name = name.encrypted;
        updates.name_nonce = name.nonce;

        if (folder.encrypted_color && folder.color_nonce) {
          const color = await re_encrypt_field(
            folder.encrypted_color,
            folder.color_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_color = color.encrypted;
          updates.color_nonce = color.nonce;
        }

        if (folder.encrypted_icon && folder.icon_nonce) {
          const icon = await re_encrypt_field(
            folder.encrypted_icon,
            folder.icon_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_icon = icon.encrypted;
          updates.icon_nonce = icon.nonce;
        }

        await api_client.put(`/mail/v1/labels/${folder.id}`, updates);
      } catch {
        ok = false;
        continue;
      }
    }

    if (!resp.data.has_more) break;

    offset += resp.data.labels.length;
  }

  return ok;
}

