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
import type { EmailListState, InboxEmail } from "@/types/email";

import { useCallback, type MutableRefObject } from "react";

import { DEFAULT_PAGE_SIZE } from "./email_list_helpers";

import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { trash_thread } from "@/services/api/mail";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import {
  adjust_unread_count,
  adjust_inbox_count,
  adjust_trash_count,
  adjust_sent_count,
} from "@/hooks/use_mail_counts";
import { adjust_stats_archived } from "@/hooks/use_mail_stats";
import { invalidate_mail_cache, remove_email_from_view_cache } from "@/hooks/email_list_cache";

interface UseEmailListBulkParams {
  state: EmailListState;
  set_state: React.Dispatch<React.SetStateAction<EmailListState>>;
  fetch_page_ref: MutableRefObject<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >;
}

export function use_email_list_bulk({
  state,
  set_state,
  fetch_page_ref,
}: UseEmailListBulkParams) {
  const bulk_delete = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const threaded_emails = emails_to_restore.filter((e) => e.thread_token);
      const non_threaded_emails = emails_to_restore.filter(
        (e) => !e.thread_token,
      );

      const non_threaded_ids = non_threaded_emails.flatMap((e) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids
          : [e.id],
      );

      const thread_group_size = (e: InboxEmail) =>
        e.thread_message_count && e.thread_message_count > 1
          ? e.thread_message_count
          : 1;

      const non_thread_group_size = (e: InboxEmail) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids.length
          : 1;

      const unread_received_count =
        threaded_emails
          .filter((e) => e.item_type === "received" && !e.is_read)
          .reduce((sum, e) => sum + thread_group_size(e), 0) +
        non_threaded_emails
          .filter((e) => e.item_type === "received" && !e.is_read)
          .reduce((sum, e) => sum + non_thread_group_size(e), 0);

      const received_count =
        threaded_emails
          .filter((e) => e.item_type === "received")
          .reduce((sum, e) => sum + thread_group_size(e), 0) +
        non_threaded_emails
          .filter((e) => e.item_type === "received")
          .reduce((sum, e) => sum + non_thread_group_size(e), 0);

      const sent_count =
        threaded_emails
          .filter((e) => e.item_type === "sent")
          .reduce((sum, e) => sum + thread_group_size(e), 0) +
        non_threaded_emails
          .filter((e) => e.item_type === "sent")
          .reduce((sum, e) => sum + non_thread_group_size(e), 0);

      const estimated_trash_delta =
        threaded_emails.reduce((sum, e) => sum + thread_group_size(e), 0) +
        non_threaded_ids.length;

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      for (const id of ids) {
        remove_email_from_view_cache(id);
      }
      for (const nid of non_threaded_ids) {
        remove_email_from_view_cache(nid);
      }
      if (unread_received_count > 0) {
        adjust_unread_count(-unread_received_count);
      }
      if (received_count > 0) {
        adjust_inbox_count(-received_count);
      }
      if (sent_count > 0) {
        adjust_sent_count(-sent_count);
      }
      adjust_trash_count(estimated_trash_delta);

      try {
        const unique_thread_tokens = Array.from(
          new Set(threaded_emails.map((e) => e.thread_token!)),
        );
        const thread_results = await Promise.all(
          unique_thread_tokens.map((token) => trash_thread(token, true)),
        );

        if (thread_results.some((r) => !r.data)) {
          throw new Error("thread trash failed");
        }

        if (non_threaded_ids.length > 0) {
          const result = await bulk_update_metadata_by_ids(non_threaded_ids, {
            is_trashed: true,
          });

          if (!result.success) {
            throw new Error("bulk trash failed");
          }
        }

        const remaining = state.emails.filter((e) => !id_set.has(e.id));

        if (remaining.length === 0 && state.has_more) {
          fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
        }
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(unread_received_count);
        }
        if (received_count > 0) {
          adjust_inbox_count(received_count);
        }
        if (sent_count > 0) {
          adjust_sent_count(sent_count);
        }
        adjust_trash_count(-estimated_trash_delta);
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails, state.has_more, set_state, fetch_page_ref],
  );

  const bulk_archive = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const expanded_ids = Array.from(
        new Set(
          emails_to_restore.flatMap((e) =>
            e.grouped_email_ids && e.grouped_email_ids.length > 1
              ? e.grouped_email_ids
              : [e.id],
          ),
        ),
      );

      const group_size = (e: InboxEmail) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids.length
          : 1;

      const unread_received_count = emails_to_restore
        .filter((e) => e.item_type === "received" && !e.is_read)
        .reduce((sum, e) => sum + group_size(e), 0);
      const received_count = emails_to_restore
        .filter((e) => e.item_type === "received")
        .reduce((sum, e) => sum + group_size(e), 0);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      if (unread_received_count > 0) {
        adjust_unread_count(-unread_received_count);
      }
      if (received_count > 0) {
        adjust_inbox_count(-received_count);
      }
      adjust_stats_archived(expanded_ids.length);
      invalidate_mail_cache();

      try {
        await api_batch_archive({ ids: expanded_ids, tier: "hot" });

        const remaining = state.emails.filter((e) => !id_set.has(e.id));

        if (remaining.length === 0 && state.has_more) {
          fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
        }
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(unread_received_count);
        }
        if (received_count > 0) {
          adjust_inbox_count(received_count);
        }
        adjust_stats_archived(-expanded_ids.length);
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails, state.has_more, set_state, fetch_page_ref],
  );

  const bulk_unarchive = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const expanded_ids = Array.from(
        new Set(
          emails_to_restore.flatMap((e) =>
            e.grouped_email_ids && e.grouped_email_ids.length > 1
              ? e.grouped_email_ids
              : [e.id],
          ),
        ),
      );

      const group_size = (e: InboxEmail) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids.length
          : 1;

      const unread_received_count = emails_to_restore
        .filter((e) => e.item_type === "received" && !e.is_read)
        .reduce((sum, e) => sum + group_size(e), 0);
      const received_count = emails_to_restore
        .filter((e) => e.item_type === "received")
        .reduce((sum, e) => sum + group_size(e), 0);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      if (unread_received_count > 0) {
        adjust_unread_count(unread_received_count);
      }
      if (received_count > 0) {
        adjust_inbox_count(received_count);
      }
      adjust_stats_archived(-expanded_ids.length);
      invalidate_mail_cache();

      try {
        await api_batch_unarchive({ ids: expanded_ids });

        const remaining = state.emails.filter((e) => !id_set.has(e.id));

        if (remaining.length === 0 && state.has_more) {
          fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
        }
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(-unread_received_count);
        }
        if (received_count > 0) {
          adjust_inbox_count(-received_count);
        }
        adjust_stats_archived(expanded_ids.length);
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails, state.has_more, set_state, fetch_page_ref],
  );

  return {
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
  };
}
