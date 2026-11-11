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
import { clear_account_memory_stores } from "./account_memory_stores";
import { erase_device_traces } from "./local_data_registry";

import { api_client } from "@/services/api/client";
import { logout_user } from "@/services/api/auth";
import { purge_favicon_cache } from "@/lib/favicon_cache_db";
import { clear_icon_cache } from "@/lib/icon_cache";
import { wipe_all_storage } from "@/services/crypto/secure_storage";
import {
  logout_all as storage_logout_all,
  clear_cache,
  clear_all_switch_tokens,
  get_current_account,
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
import { clear_attachment_preview_cache as revoke_attachment_preview_blobs } from "@/services/attachment_preview_cache";
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
import { reset_special_offer_status } from "@/stores/special_offer_status";
import { forget_external_account_problems } from "@/stores/external_account_health_store";
import { ignore_error } from "@/lib/ignore_error";
import { safe_local_keys, safe_local_remove } from "@/lib/safe_storage";
import { INVITE_ANSWER_PREFIX } from "@/services/calendar/invite_answers";
import { clear_preload_cache } from "@/components/email/hooks/preload_cache_store";
import { clear_billing_cache } from "@/components/settings/billing/billing_cache";
import { clear_family_cache } from "@/components/settings/billing/family_section/family_cache";

export interface PurgeLocalDataOptions {
  erase_device_traces?: boolean;
}

const DEVICE_RELEASE_TIMEOUT_MS = 4000;

function settle_within(task: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);

    task
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

async function release_remote_device_links(): Promise<void> {
  await settle_within(
    Promise.all([
      Promise.all([
        import("@/native/desktop_device_auth"),
        get_current_account().catch(() => null),
      ]).then(([module, current]) =>
        module.revoke_paired_device([current?.device_id]),
      ),
      import("@/services/push_subscription").then((module) =>
        module.unsubscribe_from_push(),
      ),
    ]),
    DEVICE_RELEASE_TIMEOUT_MS,
  );
}

export async function purge_all_local_data(
  options: PurgeLocalDataOptions = {},
): Promise<boolean> {
  const errors: Error[] = [];

  if (options.erase_device_traces) {
    await release_remote_device_links();
  }

  stop_session_timeout();
  lock_all_folders();

  sync_client.disconnect();
  clear_vault_from_memory();
  clear_preload_cache();
  clear_account_memory_stores();
  forget_external_account_problems();
  clear_escrow_miss_cache();
  reset_special_offer_status();
  api_client.set_expected_user_id(null);

  api_client.begin_intentional_logout();
  try {
    await logout_user();
  } catch (caught) {
    ignore_error("contexts/auth/purge_local_data:purge_all_local_data", caught);
  }

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
  for (const key of safe_local_keys()) {
    if (
      key.startsWith("aster:lockdown:") ||
      key === "pq_prekey_missing" ||
      key.startsWith("astermail_pq_self_heal_at_") ||
      key.startsWith("astermail_pq_self_heal_keys_") ||
      key.startsWith("astermail_pq_reconciler_at_") ||
      key.startsWith(INVITE_ANSWER_PREFIX)
    ) {
      safe_local_remove(key);
    }
  }
  clear_cache();
  clear_mail_stats();
  await clear_mail_cache();
  await import("@/services/calendar/sync_engine")
    .then((module) => module.clear_calendar_sync_state())
    .catch(() => undefined);
  await import("@/services/calendar/sync_store")
    .then((module) => module.clear_calendar_sync_cache())
    .catch(() => undefined);
  clear_drafts_cache();
  clear_scheduled_cache();
  clear_recovery_email_cache();
  clear_billing_cache();
  clear_family_cache();
  clear_search_index();
  clear_never_correct_terms();
  clear_session();
  clear_all_switch_tokens();
  clear_attachment_keys();
  clear_unreadable_attachment_rows();
  clear_attachment_preview_cache();
  revoke_attachment_preview_blobs();
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

  clear_icon_cache();

  try {
    await purge_favicon_cache();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  if (options.erase_device_traces) {
    try {
      const { erase_device_pairing } =
        await import("@/native/desktop_device_auth");

      await erase_device_pairing();
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }

    try {
      if (!(await erase_device_traces())) {
        errors.push(new Error("device traces remain"));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  if (errors.length > 0 && import.meta.env.DEV) {
    errors.forEach((err) => console.error("purge_all_local_data:", err));
  }

  return errors.length === 0;
}
