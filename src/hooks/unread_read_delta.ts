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
import { conversation_needs_thread_read } from "./mark_conversation_read";

import { thread_has_unread_entries } from "@/services/category_index";

export interface ReadUnreadDeltaOptions {
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_count?: number | null;
  conversation_grouping?: boolean;
  acted_id?: string;
  sibling_unread?: boolean;
}

export function conversation_has_unread_sibling(
  options: ReadUnreadDeltaOptions,
): boolean {
  const { thread_token, acted_id, sibling_unread } = options;

  if (sibling_unread) return true;
  if (!thread_token) return false;

  return thread_has_unread_entries(thread_token, acted_id);
}

export function read_clears_conversation(
  options: ReadUnreadDeltaOptions,
): boolean {
  if (!options.thread_token) return true;
  if (!conversation_has_unread_sibling(options)) return true;

  return conversation_needs_thread_read(options);
}

export interface ConversationDeltaEmail {
  id: string;
  item_type?: string;
  is_read?: boolean;
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_email_ids?: string[];
}

export function conversation_read_delta(
  emails: ConversationDeltaEmail[],
  next_read: boolean,
  conversation_grouping?: boolean,
): number {
  const received = emails.filter((email) => email.item_type === "received");

  if (received.length === 0) return 0;

  const acted_ids = new Set(received.map((email) => email.id));
  const groups = new Map<string, ConversationDeltaEmail[]>();

  for (const email of received) {
    const key = email.thread_token ? `t:${email.thread_token}` : `i:${email.id}`;
    const members = groups.get(key);

    if (members) {
      members.push(email);
    } else {
      groups.set(key, [email]);
    }
  }

  let delta = 0;

  for (const members of groups.values()) {
    const thread_token = members[0].thread_token;
    const sibling_unread =
      !!thread_token && thread_has_unread_entries(thread_token, acted_ids);
    const was_unread =
      sibling_unread || members.some((member) => !member.is_read);
    const thread_cleared =
      next_read &&
      members.some((member) =>
        conversation_needs_thread_read({
          thread_token: member.thread_token,
          thread_message_count: member.thread_message_count,
          grouped_count: member.grouped_email_ids?.length,
          conversation_grouping,
          acted_id: member.id,
        }),
      );
    const is_unread = next_read ? sibling_unread && !thread_cleared : true;

    delta += (is_unread ? 1 : 0) - (was_unread ? 1 : 0);
  }

  return delta;
}
