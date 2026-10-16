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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { UserPreferences } from "@/services/api/preferences";

import { useEffect, useRef } from "react";

import { mark_conversation_read } from "@/hooks/mark_conversation_read";
import { thread_has_unread_entries } from "@/services/category_index";

type MarkAsReadDelay = UserPreferences["mark_as_read_delay"];

interface ConversationCatchUpOptions {
  email_id: string | null | undefined;
  is_read: boolean;
  is_loading: boolean;
  item_id: string | undefined;
  thread_token: string | null | undefined;
  thread_message_count: number | null | undefined;
  thread_messages: readonly DecryptedThreadMessage[];
  grouped_count_ref: { current: readonly string[] | undefined | null };
  mark_as_read_delay: MarkAsReadDelay | undefined;
  conversation_grouping: boolean | undefined;
}

export function catch_up_delay_ms(
  delay: MarkAsReadDelay | undefined,
): number | null {
  if (delay === "never") return null;
  if (delay === "1_second") return 1000;
  if (delay === "3_seconds") return 3000;

  return 0;
}

export function use_conversation_catch_up_read({
  email_id,
  is_read,
  is_loading,
  item_id,
  thread_token,
  thread_message_count,
  thread_messages,
  grouped_count_ref,
  mark_as_read_delay,
  conversation_grouping,
}: ConversationCatchUpOptions): void {
  const caught_up_ref = useRef<string | null>(null);
  const has_unread_sibling = thread_messages.some(
    (message) =>
      message.id !== email_id &&
      message.item_type === "received" &&
      !message.is_read,
  );

  useEffect(() => {
    if (!email_id || !is_read || is_loading) return;
    if (item_id !== email_id || !thread_token) return;
    if (caught_up_ref.current === email_id) return;
    if (conversation_grouping === false) return;
    const delay_ms = catch_up_delay_ms(mark_as_read_delay);

    if (delay_ms === null) return;
    const pending = () =>
      has_unread_sibling || thread_has_unread_entries(thread_token, email_id);

    if (!pending()) return;
    const timer = window.setTimeout(() => {
      if (!pending()) return;
      caught_up_ref.current = email_id;
      mark_conversation_read({
        thread_token,
        thread_message_count,
        grouped_count: grouped_count_ref.current?.length,
        conversation_grouping,
        acted_id: email_id,
      });
    }, delay_ms);

    return () => window.clearTimeout(timer);
  }, [
    email_id,
    is_read,
    is_loading,
    item_id,
    thread_token,
    thread_message_count,
    has_unread_sibling,
    grouped_count_ref,
    mark_as_read_delay,
    conversation_grouping,
  ]);
}
