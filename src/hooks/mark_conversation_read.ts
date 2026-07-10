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
import { emit_mail_soft_refresh } from "./email_action_types";

import { mark_thread_read } from "@/services/api/mail";
import {
  mark_thread_read_entries,
  thread_has_unread_entries,
} from "@/services/category_index";

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
export function mark_conversation_read({
  thread_token,
  thread_message_count,
  grouped_count,
  conversation_grouping,
  acted_id,
}: MarkConversationReadOptions): void {
  if (!thread_token) return;

  const grouping_on = conversation_grouping !== false;
  const acted_on_group = (grouped_count ?? 0) > 1;
  const opened_grouped_thread =
    grouping_on && (thread_message_count ?? 0) > 1;
  const indexed_thread_pending =
    grouping_on && thread_has_unread_entries(thread_token, acted_id);

  if (!acted_on_group && !opened_grouped_thread && !indexed_thread_pending) {
    return;
  }

  void mark_thread_read(thread_token)
    .then((result) => {
      if (!result.error) {
        mark_thread_read_entries(thread_token);
        emit_mail_soft_refresh();
      }
    })
    .catch(() => {});
}
