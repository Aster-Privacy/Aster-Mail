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
import type { ApiResponse } from "@/services/api/client/helpers";
import type { DecryptedThreadMessage } from "@/types/thread";
import type { PreloadedEmail } from "@/components/email/hooks/preload_cache_store";

import { peek_preloaded_email } from "@/components/email/hooks/preload_cache_store";
import { has_readable_body } from "@/components/email/thread_message_merge";
import { view_cache } from "@/hooks/email_list_cache";
import { get_pending_reply_entries } from "@/hooks/pending_reply_messages";

export function is_offline_load_failure(
  response: Pick<ApiResponse<unknown>, "code"> | null | undefined,
): boolean {
  if (response?.code === "NETWORK_ERROR") return true;

  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function offline_cached_copy(
  email_id: string,
  conversation_grouping: boolean,
  user_email?: string | null,
): PreloadedEmail | null {
  const cached = peek_preloaded_email(email_id, user_email);

  if (!cached) return null;
  if (cached.conversation_grouping !== conversation_grouping) return null;
  if (!has_readable_body(cached.email)) return null;

  return cached;
}

export function thread_token_for_email(email_id: string): string | undefined {
  for (const entry of view_cache.values()) {
    const match = entry.state.emails.find((email) => email.id === email_id);

    if (match?.thread_token) return match.thread_token;
  }

  return undefined;
}

export function pending_replies_for_failed_open(
  email_id: string,
  thread_token: string | null | undefined,
): DecryptedThreadMessage[] {
  const token = thread_token || thread_token_for_email(email_id);

  return get_pending_reply_entries(token, email_id)
    .filter((entry) => !entry.is_settled)
    .map((entry) => entry.message);
}
