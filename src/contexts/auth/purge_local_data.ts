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
import { clear_all_session_passphrases } from "./session_passphrase";

import { api_client } from "@/services/api/client";
import { logout_user } from "@/services/api/auth";
import { purge_favicon_cache } from "@/lib/favicon_cache_db";
import { wipe_all_storage } from "@/services/crypto/secure_storage";
import {
  logout_all as storage_logout_all,
  clear_cache,
  clear_all_switch_tokens,
} from "@/services/account_manager";
import {
  clear_session,
  clear_all_session_data,
} from "@/services/secure_storage";
import { stop_session_timeout } from "@/services/session_timeout_service";
import { sync_client } from "@/services/sync_client";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_drafts_cache } from "@/hooks/use_drafts_list";
import { clear_scheduled_cache } from "@/hooks/use_scheduled_emails";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";
import { clear_search_index } from "@/hooks/use_search";
import { clear_never_correct_terms } from "@/services/search/spelling";
import { lock_all_folders } from "@/hooks/use_protected_folder";
import { clear_attachment_preview_cache } from "@/hooks/use_attachment_previews";
import { clear_all_app_lock_data } from "@/services/app_lock_store";
import { clear_category_index } from "@/services/category_index";
import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { clear_all_ratchet_states } from "@/services/crypto/ratchet_state_store";
import { clear_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { clear_unreadable_attachment_rows } from "@/services/crypto/attachment_crypto";
import { clear_plaintext_cache } from "@/services/crypto/ratchet_plaintext_cache";
import { clear_escrow_miss_cache } from "@/services/crypto/message_escrow";
import { clear_translation_cache } from "@/services/translation/translation_cache";
import { clear_detection_cache } from "@/services/translation/language_detect";
import { release_engines } from "@/services/translation/engine_registry";

export async function purge_all_local_data(): Promise<void> {
  const errors: Error[] = [];

  stop_session_timeout();
  lock_all_folders();
  sync_client.disconnect();
  clear_vault_from_memory();
  clear_escrow_miss_cache();
  api_client.set_expected_user_id(null);

  api_client.begin_intentional_logout();
  try {
    await logout_user();
  } catch {}

  try {
    await storage_logout_all();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await wipe_all_storage();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  clear_all_app_lock_data();
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("aster:lockdown:")) localStorage.removeItem(key);
    if (key === "pq_prekey_missing") localStorage.removeItem(key);
    if (key.startsWith("astermail_pq_self_heal_at_")) {
      localStorage.removeItem(key);
    }
    if (key.startsWith("astermail_pq_reconciler_at_")) {
      localStorage.removeItem(key);
    }
  }
  clear_cache();
  clear_mail_stats();
  clear_mail_cache();
  clear_drafts_cache();
  clear_scheduled_cache();
  clear_recovery_email_cache();
  clear_search_index();
  clear_never_correct_terms();
  clear_session();
  clear_all_switch_tokens();
  clear_attachment_keys();
  clear_unreadable_attachment_rows();
  clear_attachment_preview_cache();
  clear_translation_cache();
  clear_detection_cache();
  release_engines();

  try {
    await clear_category_index();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await clear_all_ratchet_states();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await clear_plaintext_cache();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await clear_all_session_data();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  api_client.clear_auth_data();
  try {
    await api_client.clear_session_cookies();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await clear_all_session_passphrases();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await purge_favicon_cache();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  if (errors.length > 0 && import.meta.env.DEV) {
    errors.forEach((err) => console.error("purge_all_local_data:", err));
  }
}
