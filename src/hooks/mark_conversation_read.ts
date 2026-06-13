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
// their own, so this only fires for real conversations and only when
// conversation grouping is on (in ungrouped mode each message is its own row
// and should clear independently).
//

interface MarkConversationReadOptions {
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_count?: number | null;
  conversation_grouping?: boolean;
}

//
// A conversation worth clearing as a unit is either a grouped row the user
// acted on (grouped_count > 1, only populated when grouping is on) or a
// multi-message thread opened while grouping is enabled. Both checks fail for a
// lone message and for ungrouped mode, so a single message still clears on its
// own and we never mark siblings the user never saw.
//
export function mark_conversation_read({
  thread_token,
  thread_message_count,
  grouped_count,
  conversation_grouping,
}: MarkConversationReadOptions): void {
  if (!thread_token) return;

  const acted_on_group = (grouped_count ?? 0) > 1;
  const opened_grouped_thread =
    conversation_grouping !== false && (thread_message_count ?? 0) > 1;

  if (!acted_on_group && !opened_grouped_thread) return;

  void mark_thread_read(thread_token)
    .then((result) => {
      if (!result.error) emit_mail_soft_refresh();
    })
    .catch(() => {});
}
