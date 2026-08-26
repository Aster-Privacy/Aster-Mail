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
import type {
  ContextMenuActions,
  UseContextMenuActionsParams,
} from "./inbox_context_menu_types";
import type { InboxEmail } from "@/types/email";

type UseContextMenuActionsHookParams = Omit<
  UseContextMenuActionsParams,
  "get_emails"
> & { emails: InboxEmail[] };

import { useCallback, useMemo, useRef } from "react";

import { build_context_menu_actions } from "./inbox_context_menu_builder";

export type { ContextMenuActions } from "./inbox_context_menu_types";

export function use_context_menu_actions({
  t,
  current_view,
  emails,
  update_email,
  remove_email,
  remove_emails,
  restore_emails,
  handle_open_compose,
  folders_lookup,
  tags_lookup,
  add_folder_to_email,
  remove_folder_from_email,
  add_tag_to_email,
  remove_tag_from_email,
  preferences,
  set_pending_delete_email,
  set_show_single_delete_confirm,
  set_pending_spam_email,
  set_show_single_spam_confirm,
  set_pending_archive_email,
  set_show_single_archive_confirm,
  is_drafts_view,
  is_scheduled_view,
  schedule_delete_drafts,
}: UseContextMenuActionsHookParams): ContextMenuActions {
  const { confirm_before_delete, confirm_before_spam, confirm_before_archive } =
    preferences;

  const emails_ref = useRef(emails);
  emails_ref.current = emails;
  const get_emails = useCallback(() => emails_ref.current, []);

  return useMemo(
    () =>
      build_context_menu_actions({
        t,
        current_view,
        get_emails,
        update_email,
        remove_email,
        remove_emails,
        restore_emails,
        handle_open_compose,
        folders_lookup,
        tags_lookup,
        add_folder_to_email,
        remove_folder_from_email,
        add_tag_to_email,
        remove_tag_from_email,
        preferences: {
          confirm_before_delete,
          confirm_before_spam,
          confirm_before_archive,
        },
        set_pending_delete_email,
        set_show_single_delete_confirm,
        set_pending_spam_email,
        set_show_single_spam_confirm,
        set_pending_archive_email,
        set_show_single_archive_confirm,
        is_drafts_view,
        is_scheduled_view,
        schedule_delete_drafts,
      }),
    [
      t,
      current_view,
      get_emails,
      update_email,
      remove_email,
      remove_emails,
      restore_emails,
      handle_open_compose,
      folders_lookup,
      tags_lookup,
      add_folder_to_email,
      remove_folder_from_email,
      add_tag_to_email,
      remove_tag_from_email,
      confirm_before_delete,
      confirm_before_spam,
      confirm_before_archive,
      set_pending_delete_email,
      set_show_single_delete_confirm,
      is_drafts_view,
      is_scheduled_view,
      schedule_delete_drafts,
    ],
  );
}
