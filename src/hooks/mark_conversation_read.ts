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
import type { BulkActionResult } from "./bulk_action_result";

import { emit_mail_soft_refresh } from "./email_action_types";
import { bulk_action_result } from "./bulk_action_result";

import { mark_thread_read } from "@/services/api/mail";
import {
  mark_thread_read_entries,
  thread_has_unread_entries,
} from "@/services/category_index";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

const THREAD_READ_CONCURRENCY = 10;

//
// Reading or marking a message read only ever touches the single message in
// view. The unread badge, however, counts a conversation as unread while ANY
// of its messages is unread (the server groups by thread). So reading a
// multi-message conversation leaves the thread counted: the optimistic "-1"
// is correct for the thread, but the next stats refetch finds the thread still
// has unread siblings and the badge climbs back. That is the "the count never
// goes down when I read" report.
//
// Marking the whole thread read keeps the badge (and the inbox row) in step
// with what the user actually read. Single-message threads already clear on
// their own, so this only fires for real conversations: grouped rows, opened
// grouped threads, or threads the category index still counts unread. In
// ungrouped mode every message is its own row (the index derives per-message
// rows too), so siblings always clear independently and none of the thread
// paths fire.
//

interface MarkConversationReadOptions {
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_count?: number | null;
  conversation_grouping?: boolean;
  acted_id?: string;
}

//
// A conversation worth clearing as a unit is a grouped row the user acted on
// (grouped_count > 1), a multi-message thread opened while grouping is
// enabled, or (grouping on) a thread whose category index entries are still
// unread beyond the acted message - category rows carry grouped_count 1 even
// for real conversations. A lone message with no unread indexed siblings
// still clears on its own.
//
export function conversation_needs_thread_read({
  thread_token,
  thread_message_count,
  grouped_count,
  conversation_grouping,
  acted_id,
}: MarkConversationReadOptions): boolean {
  if (!thread_token) return false;

  const grouping_on = conversation_grouping !== false;
  const acted_on_group = (grouped_count ?? 0) > 1;
  const opened_grouped_thread = grouping_on && (thread_message_count ?? 0) > 1;
  const indexed_thread_pending =
    grouping_on && thread_has_unread_entries(thread_token, acted_id);

  return acted_on_group || opened_grouped_thread || indexed_thread_pending;
}

export interface ConversationThreadCandidate {
  id: string;
  item_type?: string;
  is_read?: boolean;
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_email_ids?: string[];
}

export function collect_conversation_thread_tokens(
  emails: ConversationThreadCandidate[],
  conversation_grouping?: boolean,
): string[] {
  const tokens = new Set<string>();

  for (const email of emails) {
    if (email.item_type !== "received") continue;
    if (!email.thread_token || tokens.has(email.thread_token)) continue;
    if (
      conversation_needs_thread_read({
        thread_token: email.thread_token,
        thread_message_count: email.thread_message_count,
        grouped_count: email.grouped_email_ids?.length,
        conversation_grouping,
        acted_id: email.id,
      })
    ) {
      tokens.add(email.thread_token);
    }
  }

  return Array.from(tokens);
}

export async function mark_conversation_threads_read(
  thread_tokens: string[],
): Promise<BulkActionResult> {
  if (thread_tokens.length === 0) return bulk_action_result([]);

  const failed_tokens: string[] = [];

  for (
    let index = 0;
    index < thread_tokens.length;
    index += THREAD_READ_CONCURRENCY
  ) {
    const chunk = thread_tokens.slice(index, index + THREAD_READ_CONCURRENCY);

    await Promise.all(
      chunk.map(async (token) => {
        try {
          const result = await mark_thread_read(token);

          if (result.error) {
            failed_tokens.push(token);

            return;
          }
          mark_thread_read_entries(token);
        } catch {
          failed_tokens.push(token);
        }
      }),
    );
  }

  emit_mail_soft_refresh();
  invalidate_mail_stats();

  return bulk_action_result(thread_tokens, failed_tokens);
}

export function mark_conversation_read(
  options: MarkConversationReadOptions,
): void {
  const { thread_token } = options;

  if (!thread_token) return;
  if (!conversation_needs_thread_read(options)) return;

  void mark_thread_read(thread_token)
    .then((result) => {
      if (!result.error) {
        mark_thread_read_entries(thread_token);
        emit_mail_soft_refresh();
        invalidate_mail_stats();
      }
    })
    .catch(() => {});
}
