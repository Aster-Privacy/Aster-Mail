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


import {
  
  bulk_action_by_scope,
  bulk_undo,
} from "@/services/api/mail";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import {
  show_action_toast,
  
  
} from "@/components/toast/action_toast";
import {
  adjust_stats_unread,
  invalidate_mail_stats,
} from "@/hooks/use_mail_stats";
import { use_i18n } from "@/lib/i18n/context";
import {
  
  
  FULL_MAILBOX_ITEM_CAP,
} from "@/services/bulk_mail_scan";
import { show_toast } from "@/components/toast/simple_toast";


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

export function notify_scan_truncated(reached_cap: boolean, t: Translate): void {
  if (!reached_cap) return;

  show_toast(
    t("common.bulk_action_truncated", {
      count: String(FULL_MAILBOX_ITEM_CAP),
    }),
    "warning",
  );
}

export async function mark_all_read_by_scope(t: Translate): Promise<void> {
  const res = await bulk_action_by_scope({
    action: "mark_read",
    scope: { item_type: "received", is_trashed: false },
  });

  if (res.error || !res.data) {
    show_toast(t("common.something_went_wrong"), "error");

    return;
  }

  const { batch_id, affected_count, undoable, completed } = res.data;
  const finished = completed !== false;

  if (affected_count > 0) {
    stale_all_view_caches();
    adjust_stats_unread(-affected_count);
    invalidate_mail_stats();
    window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
  }

  show_action_toast({
    message: t("common.emails_marked_as_read", {
      count: String(affected_count),
    }),
    action_type: "read",
    email_ids: [],
    on_undo:
      undoable && finished
        ? async () => {
            adjust_stats_unread(affected_count);
            await bulk_undo(batch_id);
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

