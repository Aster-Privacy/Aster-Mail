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




import { request_cache } from "@/services/api/request_cache";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_plan_limits_cache } from "@/hooks/use_plan_limits";
import { clear_aliases_cache } from "@/components/settings/hooks/use_aliases";
import {
  clear_plan_cache,
} from "@/services/plan_limits";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_folders_cache } from "@/hooks/use_folders";
import { clear_tags_cache } from "@/hooks/use_tags";
import { clear_preload_cache } from "@/components/email/hooks/preload_cache";
import { clear_attachment_preview_cache } from "@/hooks/use_attachment_previews";
import { clear_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { clear_unreadable_attachment_rows } from "@/services/crypto/attachment_crypto";
import { clear_all_ratchet_states } from "@/services/crypto/ratchet_state_store";
import {
  clear_preferred_sender_local,
} from "@/lib/preferred_sender";
import { clear_search_index } from "@/hooks/use_search";
import { clear_never_correct_terms } from "@/services/search/spelling";
import { clear_undo_send_state } from "@/hooks/use_undo_send";
import { clear_sender_aliases_cache } from "@/hooks/use_sender_aliases";
import {
  clear_persisted_draft_deletes,
  clear_drafts_cache,
} from "@/hooks/use_drafts_list";
import { clear_scheduled_cache } from "@/hooks/use_scheduled_emails";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";
import { clear_preferences_cache } from "@/services/api/preferences";
import {
  clear_category_index_memory,
} from "@/services/category_index";


export const AUTH_VERIFY_TIMEOUT_MS = 12000;

export async function clear_account_scoped_caches(): Promise<void> {
  clear_mail_stats();
  clear_mail_cache();
  clear_folders_cache();
  clear_tags_cache();
  clear_preload_cache();
  clear_plan_limits_cache();
  clear_aliases_cache();
  clear_plan_cache();
  clear_search_index();
  clear_never_correct_terms();
  clear_recovery_email_cache();
  clear_preferred_sender_local();
  clear_preferences_cache();
  clear_category_index_memory();
  clear_undo_send_state();
  clear_sender_aliases_cache();
  clear_persisted_draft_deletes();
  clear_drafts_cache();
  clear_scheduled_cache();
  clear_attachment_preview_cache();
  clear_attachment_keys();
  clear_unreadable_attachment_rows();
  request_cache.clear();
  await clear_all_ratchet_states();
}

export function safe_log_error(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const payload = err instanceof Error ? { name: err.name } : { kind: typeof err };

  console.error("auth error", JSON.stringify(payload));
}

export const with_timeout = async <T,>(p: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race<T | null>([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
};
