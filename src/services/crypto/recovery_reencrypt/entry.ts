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
import type { } from "../key_manager";
import { derive_encryption_key_from_passphrase } from "../memory_key_store";
import { zero_uint8_array } from "../secure_memory";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import { array_to_base64, } from "../base64";


import { re_encrypt_contact_attachments, re_encrypt_contact_field_values, re_encrypt_contact_photos, re_encrypt_contact_sync_sources } from "./contacts";
import { re_encrypt_folders } from "./folders";
import { import_aes_key } from "./key_helpers";
import { re_encrypt_mail_metadata, re_encrypt_tags } from "./mail";
import { store_pending_reencryption } from "./pending";
import { re_encrypt_external_accounts } from "./preferences";
import { re_encrypt_profile_notes } from "./profile_notes";
import { re_encrypt_allowed_senders, re_encrypt_blocked_senders, re_encrypt_recent_recipients, re_encrypt_signatures, re_encrypt_templates } from "./settings";
export interface ReencryptResult {
  complete: boolean;
  retired_old_kek: Uint8Array | null;
}

export async function reencrypt_identity_scoped_password_change(
  old_identity_key: string,
  new_identity_key: string,
): Promise<boolean> {
  try {
    const results = [
      await re_encrypt_tags(old_identity_key, new_identity_key),
      await re_encrypt_folders(old_identity_key, new_identity_key),
    ];

    return results.every((result) => result);
  } catch {
    return false;
  }
}

export async function reencrypt_settings_password_change(
  current_password: string,
  new_password: string,
  old_identity_key: string,
  new_identity_key: string,
): Promise<ReencryptResult> {
  let old_raw: Uint8Array | null = null;
  let new_raw: Uint8Array | null = null;
  let complete = false;
  let retired_old_kek: Uint8Array | null = null;
  let old_data_kek_b64: string | null = null;

  try {
    const old_bytes = new TextEncoder().encode(current_password);
    const new_bytes = new TextEncoder().encode(new_password);

    [old_raw, new_raw] = await Promise.all([
      derive_encryption_key_from_passphrase(old_bytes),
      derive_encryption_key_from_passphrase(new_bytes),
    ]);

    zero_uint8_array(old_bytes);
    zero_uint8_array(new_bytes);

    old_data_kek_b64 = array_to_base64(old_raw);

    const old_aes = await import_aes_key(old_raw, ["decrypt"]);
    const new_aes = await import_aes_key(new_raw, ["encrypt"]);

    const results = [
      await re_encrypt_signatures(old_aes, new_aes),
      await re_encrypt_templates(old_aes, new_aes),
      await re_encrypt_blocked_senders(old_aes),
      await re_encrypt_allowed_senders(old_aes),
      await re_encrypt_recent_recipients(old_aes),
      await re_encrypt_tags(old_identity_key, new_identity_key),
      await re_encrypt_folders(old_identity_key, new_identity_key),
      await re_encrypt_mail_metadata(old_raw, new_raw),
      await re_encrypt_profile_notes(old_raw, new_raw),
      await re_encrypt_external_accounts(old_aes, new_aes, new_raw),
      await re_encrypt_contact_field_values(old_aes, new_aes),
      await re_encrypt_contact_photos(old_aes, new_aes),
      await re_encrypt_contact_attachments(old_aes, new_aes),
      await re_encrypt_contact_sync_sources(old_aes, new_aes),
    ];

    complete = results.every((result) => result);

    if (complete) {
      retired_old_kek = old_raw.slice();
    }
  } catch {
    complete = false;
  } finally {
    if (old_raw) zero_uint8_array(old_raw);
    if (new_raw) zero_uint8_array(new_raw);
  }

  if (!complete && old_data_kek_b64) {
    await store_pending_reencryption({
      old_identity_key,
      old_data_kek: old_data_kek_b64,
    });
  }

  return { complete, retired_old_kek };
}

