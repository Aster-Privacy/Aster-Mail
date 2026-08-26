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
import type {} from "../key_manager";
import type {} from "@/services/api/signatures";
import type {} from "@/services/api/templates";
import type {} from "@/services/api/blocked_senders";
import type {} from "@/services/api/allowed_senders";
import {
  list_encrypted_mail_items,
  update_mail_item,
} from "@/services/api/mail";
import { derive_metadata_key } from "@/services/crypto/envelope";
import { list_tags, update_tag } from "@/services/api/tags";

import { array_to_base64, base64_to_array } from "../base64";

import { re_encrypt_field } from "./key_helpers";
export async function re_encrypt_mail_metadata(
  old_master_key: Uint8Array,
  new_master_key: Uint8Array,
): Promise<boolean> {
  const METADATA_CONTEXT = "mail-item-metadata";

  const [old_key, new_key] = await Promise.all([
    derive_metadata_key(old_master_key, METADATA_CONTEXT),
    derive_metadata_key(new_master_key, METADATA_CONTEXT),
  ]);

  let ok = true;

  for (const item_type of ["sent", "draft"] as const) {
    let cursor: string | undefined;

    while (true) {
      const resp = await list_encrypted_mail_items({
        item_type,
        limit: 100,
        cursor,
        include_reactions: true,
      });

      if (resp.error || !resp.data) {
        ok = false;
        break;
      }

      for (const item of resp.data.items) {
        if (!item.encrypted_metadata || !item.metadata_nonce) continue;

        try {
          const ct = base64_to_array(item.encrypted_metadata);
          const iv = base64_to_array(item.metadata_nonce);
          const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            old_key,
            ct,
          );
          const new_iv = crypto.getRandomValues(new Uint8Array(12));
          const new_ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new_iv },
            new_key,
            pt,
          );

          await update_mail_item(item.id, {
            encrypted_metadata: array_to_base64(new Uint8Array(new_ct)),
            metadata_nonce: array_to_base64(new_iv),
          });
        } catch {
          ok = false;
          continue;
        }
      }

      cursor = resp.data.next_cursor ?? undefined;

      if (!resp.data.has_more || !cursor) break;
    }
  }

  return ok;
}

export async function derive_tag_aes_key(
  identity_key: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(identity_key + "astermail-tags-v1");
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function re_encrypt_tags(
  old_identity_key: string,
  new_identity_key: string,
): Promise<boolean> {
  if (old_identity_key === new_identity_key) return true;

  const [old_key, new_key] = await Promise.all([
    derive_tag_aes_key(old_identity_key, ["decrypt"]),
    derive_tag_aes_key(new_identity_key, ["encrypt"]),
  ]);

  let offset = 0;
  let ok = true;

  while (true) {
    const resp = await list_tags({ limit: 100, offset });

    if (resp.error || !resp.data) {
      ok = false;
      break;
    }

    for (const tag of resp.data.tags) {
      try {
        const updates: Record<string, string> = {};
        const name = await re_encrypt_field(
          tag.encrypted_name,
          tag.name_nonce,
          old_key,
          new_key,
        );

        updates.encrypted_name = name.encrypted;
        updates.name_nonce = name.nonce;

        if (tag.encrypted_color && tag.color_nonce) {
          const color = await re_encrypt_field(
            tag.encrypted_color,
            tag.color_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_color = color.encrypted;
          updates.color_nonce = color.nonce;
        }

        if (tag.encrypted_icon && tag.icon_nonce) {
          const icon = await re_encrypt_field(
            tag.encrypted_icon,
            tag.icon_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_icon = icon.encrypted;
          updates.icon_nonce = icon.nonce;
        }

        await update_tag(tag.id, updates);
      } catch {
        ok = false;
        continue;
      }
    }

    if (!resp.data.has_more) break;

    offset += resp.data.tags.length;
  }

  return ok;
}
