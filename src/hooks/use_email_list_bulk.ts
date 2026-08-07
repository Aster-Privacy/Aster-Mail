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
import type { BulkActionResult } from "@/hooks/bulk_action_result";

import { useCallback, type MutableRefObject } from "react";

import { DEFAULT_PAGE_SIZE, expand_email_ids } from "./email_list_helpers";

import { bulk_action_result } from "@/hooks/bulk_action_result";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { trash_thread } from "@/services/api/mail";
import { batched_archive, batched_unarchive } from "@/services/api/archive";
import {
  adjust_stats_unread as adjust_unread_count,
  adjust_stats_inbox as adjust_inbox_count,
  adjust_stats_trash as adjust_trash_count,
  adjust_stats_sent as adjust_sent_count,
  adjust_stats_archived,
} from "@/hooks/use_mail_stats";
import { stale_all_view_caches, remove_email_from_view_cache } from "@/hooks/email_list_cache";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import {
  remove_ids as remove_index_ids,
  remove_thread_entries,
  reindex_ids,
} from "@/services/category_index";

interface UseEmailListBulkParams {
  state: EmailListState;
  set_state: React.Dispatch<React.SetStateAction<EmailListState>>;
  fetch_page_ref: MutableRefObject<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >;
  page_size?: number;
}

interface CountDeltas {
  unread_received: number;
  received: number;
  sent: number;
  message_count: number;
}

function group_size(email: InboxEmail): number {
  if (email.thread_token) {
    return email.thread_message_count && email.thread_message_count > 1
      ? email.thread_message_count
      : 1;
  }

  return expand_email_ids(email).length;
}

function count_deltas(emails: InboxEmail[]): CountDeltas {
  return {
    unread_received: emails
      .filter((e) => e.item_type === "received" && !e.is_read)
      .reduce((sum, e) => sum + group_size(e), 0),
    received: emails
      .filter((e) => e.item_type === "received")
      .reduce((sum, e) => sum + group_size(e), 0),
    sent: emails
      .filter((e) => e.item_type === "sent")
      .reduce((sum, e) => sum + group_size(e), 0),
    message_count: emails.reduce((sum, e) => sum + group_size(e), 0),
  };
}

function sort_by_timestamp_desc(emails: InboxEmail[]): InboxEmail[] {
  return [...emails].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function use_email_list_bulk({
  state,
  set_state,
  fetch_page_ref,
  page_size = DEFAULT_PAGE_SIZE,
}: UseEmailListBulkParams) {
  const restore_emails = useCallback(
    (emails: InboxEmail[]) => {
      if (emails.length === 0) return;
      set_state((prev) => {
        const already_present = new Set(prev.emails.map((e) => e.id));
        const fresh_restores = emails.filter((e) => !already_present.has(e.id));

        if (fresh_restores.length === 0) return prev;

        return {
          ...prev,
          emails: sort_by_timestamp_desc([...prev.emails, ...fresh_restores]),
          total_messages: prev.total_messages + fresh_restores.length,
        };
      });
    },
    [set_state],
  );

  const refill_if_empty = useCallback(() => {
    set_state((prev) => {
      if (prev.emails.length === 0 && prev.has_more) {
        fetch_page_ref.current?.(0, page_size);
      }

      return prev;
    });
  }, [set_state, fetch_page_ref, page_size]);

  const bulk_delete = useCallback(
    async (ids: string[]): Promise<BulkActionResult> => {
      if (ids.length === 0) return bulk_action_result([]);

      const id_set = new Set(ids);
      const selected_emails = state.emails.filter((e) => id_set.has(e.id));
      const threaded_emails = selected_emails.filter((e) => e.thread_token);
      const non_threaded_emails = selected_emails.filter((e) => !e.thread_token);
      const non_threaded_ids = non_threaded_emails.flatMap(expand_email_ids);
      const deltas = count_deltas(selected_emails);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));

      const thread_removed_ids = new Map<string, string[]>();

      remove_index_ids(Array.from(new Set([...ids, ...non_threaded_ids])));
      for (const email of threaded_emails) {
        if (email.thread_token && !thread_removed_ids.has(email.thread_token)) {
          thread_removed_ids.set(
            email.thread_token,
            remove_thread_entries(email.thread_token),
          );
        }
      }
      for (const id of ids) {
        remove_email_from_view_cache(id);
      }
      for (const nid of non_threaded_ids) {
        remove_email_from_view_cache(nid);
      }
      if (deltas.unread_received > 0) {
        adjust_unread_count(-deltas.unread_received);
      }
      if (deltas.received > 0) {
        adjust_inbox_count(-deltas.received);
      }
      if (deltas.sent > 0) {
        adjust_sent_count(-deltas.sent);
      }
      adjust_trash_count(deltas.message_count);

      const failed_email_ids = new Set<string>();
      const unique_thread_tokens = Array.from(
        new Set(threaded_emails.map((e) => e.thread_token as string)),
      );
      const thread_outcomes = await Promise.all(
        unique_thread_tokens.map(async (token) => {
          try {
            const result = await trash_thread(token, true);

            return { token, ok: !!result.data };
          } catch {
            return { token, ok: false };
          }
        }),
      );
      const failed_tokens = new Set(
        thread_outcomes.filter((o) => !o.ok).map((o) => o.token),
      );

      for (const email of threaded_emails) {
        if (email.thread_token && failed_tokens.has(email.thread_token)) {
          failed_email_ids.add(email.id);
        }
      }

      if (non_threaded_ids.length > 0) {
        let failed_message_ids = non_threaded_ids;

        try {
          const result = await bulk_update_metadata_by_ids(non_threaded_ids, {
            is_trashed: true,
          });

          failed_message_ids = result.failed_ids;
        } catch {
          failed_message_ids = non_threaded_ids;
        }

        const failed_message_set = new Set(failed_message_ids);

        for (const email of non_threaded_emails) {
          if (expand_email_ids(email).some((id) => failed_message_set.has(id))) {
            failed_email_ids.add(email.id);
          }
        }
      }

      const failed_emails = selected_emails.filter((e) =>
        failed_email_ids.has(e.id),
      );

      if (failed_emails.length > 0) {
        const restored = count_deltas(failed_emails);

        reindex_ids(
          Array.from(
            new Set(
              failed_emails.flatMap((email) =>
                email.thread_token
                  ? [
                      email.id,
                      ...(thread_removed_ids.get(email.thread_token) ?? []),
                    ]
                  : expand_email_ids(email),
              ),
            ),
          ),
        );
        if (restored.unread_received > 0) {
          adjust_unread_count(restored.unread_received);
        }
        if (restored.received > 0) {
          adjust_inbox_count(restored.received);
        }
        if (restored.sent > 0) {
          adjust_sent_count(restored.sent);
        }
        adjust_trash_count(-restored.message_count);
        restore_emails(failed_emails);
      }
      if (failed_email_ids.size < ids.length) {
        refill_if_empty();
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        }, 300);
      }

      return bulk_action_result(ids, failed_email_ids);
    },
    [state.emails, set_state, restore_emails, refill_if_empty],
  );

  const bulk_archive = useCallback(
    async (ids: string[]): Promise<BulkActionResult> => {
      if (ids.length === 0) return bulk_action_result([]);

      const id_set = new Set(ids);
      const selected_emails = state.emails.filter((e) => id_set.has(e.id));
      const expanded_ids = Array.from(
        new Set(selected_emails.flatMap(expand_email_ids)),
      );
      const deltas = count_deltas(selected_emails);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      remove_index_ids(expanded_ids);
      if (deltas.unread_received > 0) {
        adjust_unread_count(-deltas.unread_received);
      }
      if (deltas.received > 0) {
        adjust_inbox_count(-deltas.received);
      }
      adjust_stats_archived(expanded_ids.length);
      stale_all_view_caches();

      let failed_message_ids = expanded_ids;

      try {
        const result = await batched_archive(expanded_ids, "hot");

        failed_message_ids = result.failed_ids;
      } catch {
        failed_message_ids = expanded_ids;
      }

      const failed_message_set = new Set(failed_message_ids);
      const failed_emails = selected_emails.filter((e) =>
        expand_email_ids(e).some((id) => failed_message_set.has(id)),
      );

      if (failed_emails.length > 0) {
        const restored = count_deltas(failed_emails);
        const restored_ids = Array.from(
          new Set(failed_emails.flatMap(expand_email_ids)),
        );

        reindex_ids(restored_ids);
        if (restored.unread_received > 0) {
          adjust_unread_count(restored.unread_received);
        }
        if (restored.received > 0) {
          adjust_inbox_count(restored.received);
        }
        adjust_stats_archived(-restored_ids.length);
        restore_emails(failed_emails);
      }

      const archived_ids = expanded_ids.filter(
        (id) => !failed_message_set.has(id),
      );

      if (archived_ids.length > 0) {
        let blob_updated = false;

        try {
          const blob_result = await bulk_update_metadata_by_ids(archived_ids, {
            is_archived: true,
          });

          blob_updated = blob_result.success;
        } catch {
          blob_updated = false;
        }
        if (!blob_updated) {
          reindex_ids(archived_ids);
        }
        refill_if_empty();
      }

      return bulk_action_result(
        ids,
        failed_emails.map((e) => e.id),
      );
    },
    [state.emails, set_state, restore_emails, refill_if_empty],
  );

  const bulk_unarchive = useCallback(
    async (ids: string[]): Promise<BulkActionResult> => {
      if (ids.length === 0) return bulk_action_result([]);

      const id_set = new Set(ids);
      const selected_emails = state.emails.filter((e) => id_set.has(e.id));
      const expanded_ids = Array.from(
        new Set(selected_emails.flatMap(expand_email_ids)),
      );
      const deltas = count_deltas(selected_emails);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      if (deltas.unread_received > 0) {
        adjust_unread_count(deltas.unread_received);
      }
      if (deltas.received > 0) {
        adjust_inbox_count(deltas.received);
      }
      adjust_stats_archived(-expanded_ids.length);
      stale_all_view_caches();

      let failed_message_ids = expanded_ids;

      try {
        const result = await batched_unarchive(expanded_ids);

        failed_message_ids = result.failed_ids;
      } catch {
        failed_message_ids = expanded_ids;
      }

      const failed_message_set = new Set(failed_message_ids);
      const failed_emails = selected_emails.filter((e) =>
        expand_email_ids(e).some((id) => failed_message_set.has(id)),
      );

      if (failed_emails.length > 0) {
        const restored = count_deltas(failed_emails);
        const restored_ids = Array.from(
          new Set(failed_emails.flatMap(expand_email_ids)),
        );

        if (restored.unread_received > 0) {
          adjust_unread_count(-restored.unread_received);
        }
        if (restored.received > 0) {
          adjust_inbox_count(-restored.received);
        }
        adjust_stats_archived(restored_ids.length);
        restore_emails(failed_emails);
      }

      const unarchived_ids = expanded_ids.filter(
        (id) => !failed_message_set.has(id),
      );

      if (unarchived_ids.length > 0) {
        try {
          await bulk_update_metadata_by_ids(unarchived_ids, {
            is_archived: false,
          });
        } catch {
          void 0;
        }
        reindex_ids(unarchived_ids);
        refill_if_empty();

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        }, 300);
      }

      return bulk_action_result(
        ids,
        failed_emails.map((e) => e.id),
      );
    },
    [state.emails, set_state, restore_emails, refill_if_empty],
  );

  return {
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
  };
}
