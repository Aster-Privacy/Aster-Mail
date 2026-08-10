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
import { useMemo } from "react";

import type { SelectionMenuScope } from "@/components/email/inbox/inbox_email_list";
import { use_category_drop } from "@/components/email/inbox/use_category_drop";
import { use_inbox_bulk_actions } from "@/components/email/inbox/use_inbox_bulk_actions";
import { use_inbox_selection } from "@/components/email/inbox/use_inbox_selection";
import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";
import { use_inbox_categories } from "@/hooks/use_inbox_categories";
import type { EmailCategory, InboxEmail } from "@/types/email";

export type InboxSelectionMenuParams = {
  categories: ReturnType<typeof use_inbox_categories>;
  selection: ReturnType<typeof use_inbox_selection>;
  toolbar: ReturnType<typeof use_inbox_toolbar_actions>;
  bulk_actions: ReturnType<typeof use_inbox_bulk_actions>;
  email_state: { emails: InboxEmail[] };
  effective_total_for_pages: number;
  handle_category_drop: ReturnType<typeof use_category_drop>;
  set_show_toolbar_custom_snooze: (value: boolean) => void;
};

export function use_inbox_selection_menu({
  categories,
  selection,
  toolbar,
  bulk_actions,
  email_state,
  effective_total_for_pages,
  handle_category_drop,
  set_show_toolbar_custom_snooze,
}: InboxSelectionMenuParams): SelectionMenuScope | null {
  const {
    handle_delete_wrapped,
    handle_archive_wrapped,
    handle_unarchive_wrapped,
    handle_spam_wrapped,
    handle_mark_read_wrapped,
    handle_mark_unread_wrapped,
    handle_restore_wrapped,
    handle_not_spam_wrapped,
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
  } = bulk_actions;

  const selected_emails = useMemo(
    () => email_state.emails.filter((e) => e.is_selected),
    [email_state.emails],
  );

  const selection_menu = useMemo((): SelectionMenuScope | null => {
    const is_all_mode = selection.select_all_mode;
    const count = is_all_mode
      ? Math.max(effective_total_for_pages - selection.excluded_ids.length, 0)
      : selection.selected_count;

    if (!is_all_mode && count < 2) return null;

    return {
      count,
      is_all_mode,
      has_unread: is_all_mode || selected_emails.some((e) => !e.is_read),
      has_read: is_all_mode || selected_emails.some((e) => e.is_read),
      get_folder_status: selection.get_folder_status_for_selection,
      get_tag_status: selection.get_tag_status_for_selection,
      on_archive: handle_archive_wrapped,
      on_delete: handle_delete_wrapped,
      on_spam: handle_spam_wrapped,
      on_mark_read: handle_mark_read_wrapped,
      on_mark_unread: handle_mark_unread_wrapped,
      on_restore: handle_restore_wrapped,
      on_mark_not_spam: handle_not_spam_wrapped,
      on_move_to_inbox: handle_unarchive_wrapped,
      on_snooze: toolbar.handle_toolbar_snooze,
      on_custom_snooze: () => set_show_toolbar_custom_snooze(true),
      on_folder_toggle: (folder_token: string) => {
        handle_folder_toggle_wrapped(
          folder_token,
          selection.get_folder_status_for_selection(folder_token) === "all",
        );
      },
      on_tag_toggle: (tag_token: string) => {
        handle_tag_toggle_wrapped(
          tag_token,
          selection.get_tag_status_for_selection(tag_token) === "all",
        );
      },
      on_category_change: categories.enabled
        ? (category: EmailCategory) => {
            void handle_category_drop(
              category,
              selected_emails.map((e) => e.id),
            );
          }
        : undefined,
    };
  }, [
    selection,
    selected_emails,
    effective_total_for_pages,
    toolbar,
    categories.enabled,
    handle_category_drop,
    handle_archive_wrapped,
    handle_delete_wrapped,
    handle_spam_wrapped,
    handle_mark_read_wrapped,
    handle_mark_unread_wrapped,
    handle_restore_wrapped,
    handle_not_spam_wrapped,
    handle_unarchive_wrapped,
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
  ]);

  return selection_menu;
}
