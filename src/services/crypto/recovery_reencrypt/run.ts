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

import type { EncryptedVault } from "../key_manager";

import { derive_encryption_key_from_passphrase } from "../memory_key_store";
import { zero_uint8_array } from "../secure_memory";
import { append_legacy_key_raw_bytes } from "../legacy_keks";
import type {} from "@/services/api/signatures";
import type {} from "@/services/api/templates";
import type {} from "@/services/api/blocked_senders";
import type {} from "@/services/api/allowed_senders";
import { base64_to_array } from "../base64";

import {
  re_encrypt_alias_sub_items_recovery,
  re_encrypt_aliases_contacts,
} from "./aliases";
import {
  re_encrypt_contact_attachments,
  re_encrypt_contact_field_values,
  re_encrypt_contact_photos,
  re_encrypt_contact_sync_sources,
  re_encrypt_drafts,
} from "./contacts";
import { re_encrypt_folders } from "./folders";
import { import_aes_key } from "./key_helpers";
import { re_encrypt_mail_metadata, re_encrypt_tags } from "./mail";
import {
  clear_pending_reencryption,
  get_pending,
  store_pending_reencryption,
} from "./pending";
import {
  re_encrypt_dev_mode,
  re_encrypt_external_accounts,
  re_encrypt_onboarding_state,
  re_encrypt_preferences,
  re_encrypt_recovery_email,
} from "./preferences";
import { re_encrypt_profile_notes } from "./profile_notes";
import {
  re_encrypt_allowed_senders,
  re_encrypt_blocked_senders,
  re_encrypt_recent_recipients,
  re_encrypt_signatures,
  re_encrypt_templates,
} from "./settings";
export async function check_and_run_recovery_reencryption(
  vault: EncryptedVault,
  passphrase: string,
): Promise<void> {
  const pending = await get_pending();

  if (!pending) return;

  clear_pending_reencryption();

  const [old_folder_hash_buf, old_tag_hash_buf] = await Promise.all([
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(
        pending.old_identity_key + "astermail-labels-v1",
      ),
    ),
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(pending.old_identity_key + "astermail-tags-v1"),
    ),
  ]);

  const old_folder_hash = new Uint8Array(old_folder_hash_buf);
  const old_tag_hash = new Uint8Array(old_tag_hash_buf);

  await Promise.all([
    append_legacy_key_raw_bytes(old_folder_hash),
    append_legacy_key_raw_bytes(old_tag_hash),
  ]);

  zero_uint8_array(old_folder_hash);
  zero_uint8_array(old_tag_hash);

  try {
    await re_encrypt_tags(pending.old_identity_key, vault.identity_key);
    await re_encrypt_folders(pending.old_identity_key, vault.identity_key);
    await re_encrypt_preferences(
      pending.old_identity_key,
      vault.identity_key,
      vault,
    );
    await re_encrypt_drafts(pending.old_identity_key, vault.identity_key);
    await re_encrypt_dev_mode(pending.old_identity_key, vault.identity_key);
    await re_encrypt_recovery_email(
      pending.old_identity_key,
      vault.identity_key,
    );
    await re_encrypt_onboarding_state(
      pending.old_identity_key,
      vault.identity_key,
    );
  } catch {
    /* silently fail */
  }

  if (!pending.old_data_kek) return;

  let old_raw: Uint8Array | null = null;
  let new_raw: Uint8Array | null = null;
  let complete = false;

  try {
    old_raw = base64_to_array(pending.old_data_kek);
    const passphrase_bytes = new TextEncoder().encode(passphrase);

    new_raw = await derive_encryption_key_from_passphrase(passphrase_bytes);
    zero_uint8_array(passphrase_bytes);

    const old_aes = await import_aes_key(old_raw, ["decrypt"]);
    const new_aes = await import_aes_key(new_raw, ["encrypt"]);

    const results = [
      await re_encrypt_signatures(old_aes, new_aes),
      await re_encrypt_templates(old_aes, new_aes),
      await re_encrypt_blocked_senders(old_aes),
      await re_encrypt_allowed_senders(old_aes),
      await re_encrypt_recent_recipients(old_aes),
      await re_encrypt_mail_metadata(old_raw, new_raw),
      await re_encrypt_profile_notes(old_raw, new_raw),
      await re_encrypt_external_accounts(old_aes, new_aes, new_raw),
      await re_encrypt_contact_field_values(old_aes, new_aes),
      await re_encrypt_contact_photos(old_aes, new_aes),
      await re_encrypt_contact_attachments(old_aes, new_aes),
      await re_encrypt_contact_sync_sources(old_aes, new_aes),
    ];

    await re_encrypt_aliases_contacts(old_raw, new_raw);
    await re_encrypt_alias_sub_items_recovery(old_raw, new_raw);

    complete = results.every((result) => result);
  } catch {
    complete = false;
  } finally {
    if (old_raw) zero_uint8_array(old_raw);
    if (new_raw) zero_uint8_array(new_raw);
  }

  if (!complete) {
    await store_pending_reencryption({
      old_identity_key: pending.old_identity_key,
      old_data_kek: pending.old_data_kek,
    });
  }
}
