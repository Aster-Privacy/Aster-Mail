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

import { bulk_action_by_scope, bulk_undo } from "@/services/api/mail";
import {
  stale_all_view_caches,
  view_cache,
} from "@/hooks/email_list_cache";
import { set_all_indexed_read, set_ids_read } from "@/services/category_index";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  adjust_stats_unread,
  invalidate_mail_stats,
} from "@/hooks/use_mail_stats";
import { use_i18n } from "@/lib/i18n/context";
import { FULL_MAILBOX_ITEM_CAP } from "@/services/bulk_mail_scan";
import { show_toast } from "@/components/toast/simple_toast";
import {
  emit_mail_item_updated,
  emit_mail_soft_refresh,
} from "@/hooks/mail_events";
import {
  clear_read_intent,
  clear_scope_read_intent,
  note_read_intent,
  note_scope_read_intent,
} from "@/services/read_intent";

export const QUICK_ACTION_CONFIRM_KEYS: Record<
  string,
  { title: string; message: string }
> = {
  mark_all_read: {
    title: "mail.mark_all_read_confirm_title",
    message: "mail.mark_all_read_confirm_message",
  },
  archive_all_read: {
    title: "mail.archive_all_read_confirm_title",
    message: "mail.archive_all_read_confirm_message",
  },
  delete_old: {
    title: "mail.delete_old_confirm_title",
    message: "mail.delete_old_confirm_message",
  },
};

export type Translate = ReturnType<typeof use_i18n>["t"];

export function notify_scan_truncated(
  reached_cap: boolean,
  t: Translate,
): void {
  if (!reached_cap) return;

  show_toast(
    t("common.bulk_action_truncated", {
      count: FULL_MAILBOX_ITEM_CAP,
    }),
    "warning",
  );
}

function collect_cached_unread_ids(skip_ids: readonly string[]): string[] {
  const skip = new Set(skip_ids);
  const found = new Set<string>();

  for (const cached of view_cache.values()) {
    for (const email of cached.state.emails) {
      if (
        email.is_read ||
        email.item_type !== "received" ||
        email.is_trashed ||
        skip.has(email.id)
      ) {
        continue;
      }
      found.add(email.id);
    }
  }

  return [...found];
}

export async function mark_all_read_by_scope(t: Translate): Promise<void> {
  const scope_token = note_scope_read_intent();
  const indexed_ids = set_all_indexed_read(true);
  const cached_ids = collect_cached_unread_ids(indexed_ids);

  note_read_intent(cached_ids, true);

  const locally_read_ids = [...indexed_ids, ...cached_ids];

  for (const id of locally_read_ids) {
    emit_mail_item_updated({ id, is_read: true });
  }
  if (locally_read_ids.length > 0) {
    adjust_stats_unread(-locally_read_ids.length);
  }
  const res = await bulk_action_by_scope({
    action: "mark_read",
    scope: { item_type: "received", is_trashed: false },
  }).catch(() => null);

  if (!res || res.error || !res.data) {
    clear_scope_read_intent(scope_token);
    set_ids_read(indexed_ids, false);
    clear_read_intent(indexed_ids, false);
    clear_read_intent(cached_ids, true);
    for (const id of locally_read_ids) {
      emit_mail_item_updated({ id, is_read: false });
    }
    if (locally_read_ids.length > 0) {
      adjust_stats_unread(locally_read_ids.length);
    }
    stale_all_view_caches();
    emit_mail_soft_refresh();
    show_toast(res?.error || t("common.something_went_wrong"), "error");

    return;
  }
  const { batch_id, affected_count, undoable, completed } = res.data;
  const finished = completed !== false;

  if (affected_count === 0 && locally_read_ids.length === 0) {
    show_toast(t("common.no_unread_emails"), "info");

    return;
  }

  if (affected_count > locally_read_ids.length) {
    adjust_stats_unread(locally_read_ids.length - affected_count);
  }
  stale_all_view_caches();
  invalidate_mail_stats();
  emit_mail_soft_refresh();

  show_action_toast({
    message: t("common.emails_marked_as_read", {
      count: affected_count,
    }),
    action_type: "read",
    email_ids: [],
    on_undo:
      undoable && finished
        ? async () => {
            const undo_result = await bulk_undo(batch_id);

            if (!undo_result.data?.success) {
              throw new Error("undo mark read failed");
            }
            clear_scope_read_intent(scope_token);
            set_ids_read(locally_read_ids, false);
            adjust_stats_unread(
              undo_result.data.restored_count || affected_count,
            );
            stale_all_view_caches();
            invalidate_mail_stats();
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          }
        : undefined,
  });

  if (!finished) {
    show_toast(t("common.bulk_action_continues_in_background"), "info");
  }
}
