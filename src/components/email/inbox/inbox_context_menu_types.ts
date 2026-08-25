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
import type { InboxEmail } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";

import { type RestoredEmailEntry } from "@/hooks/email_list_helpers";

export interface UseContextMenuActionsParams {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  get_emails: () => InboxEmail[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  restore_emails: (entries: RestoredEmailEntry[]) => void;
  handle_open_compose: (
    mode: "reply" | "reply_all" | "forward",
    email: InboxEmail,
  ) => void;
  folders_lookup: Map<string, { name: string; color?: string }>;
  tags_lookup: Map<string, { name: string; color?: string; icon?: string }>;
  add_folder_to_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  remove_folder_from_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  add_tag_to_email: (email_id: string, tag_token: string) => Promise<boolean>;
  remove_tag_from_email: (
    email_id: string,
    tag_token: string,
  ) => Promise<boolean>;
  preferences: {
    confirm_before_delete: boolean;
    confirm_before_spam: boolean;
    confirm_before_archive: boolean;
  };
  set_pending_delete_email: (email: InboxEmail | null) => void;
  set_show_single_delete_confirm: (show: boolean) => void;
  set_pending_spam_email: (email: InboxEmail | null) => void;
  set_show_single_spam_confirm: (show: boolean) => void;
  set_pending_archive_email: (email: InboxEmail | null) => void;
  set_show_single_archive_confirm: (show: boolean) => void;
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
  schedule_delete_drafts: (ids: string[]) => () => void;
}

export interface ContextMenuActions {
  handle_delete: (email: InboxEmail) => void;
  handle_archive: (email: InboxEmail) => void;
  handle_spam: (email: InboxEmail) => void;
  handle_toggle_read: (email: InboxEmail) => Promise<void>;
  handle_toggle_star: (email: InboxEmail) => Promise<void>;
  handle_toggle_pin: (email: InboxEmail) => Promise<void>;
  handle_reply: (email: InboxEmail) => void;
  handle_reply_all: (email: InboxEmail) => void;
  handle_forward: (email: InboxEmail) => void;
  handle_find_from_sender: (email: InboxEmail) => void;
  handle_open_in_new_window: (email: InboxEmail) => void;
  handle_folder_toggle: (
    email: InboxEmail,
    folder_token: string,
  ) => Promise<void>;
  handle_tag_toggle: (email: InboxEmail, tag_token: string) => Promise<void>;
  handle_restore: (email: InboxEmail) => Promise<void>;
  handle_mark_not_spam: (email: InboxEmail) => Promise<void>;
  handle_move_to_inbox: (email: InboxEmail) => Promise<void>;
}
