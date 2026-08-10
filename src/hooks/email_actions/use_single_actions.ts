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
import type { ActionStateContext } from "./use_action_state";
import type { MetadataHelpers } from "./use_metadata_helpers";

import { use_single_actions_core } from "./use_single_actions_core";
import { use_single_actions_flags } from "./use_single_actions_flags";
import { use_single_actions_folders } from "./use_single_actions_folders";

export interface SingleActions {
  toggle_star: (email: InboxEmail) => Promise<boolean>;
  toggle_pin: (email: InboxEmail) => Promise<boolean>;
  toggle_read: (email: InboxEmail) => Promise<boolean>;
  mark_as_read: (email: InboxEmail) => Promise<boolean>;
  mark_as_unread: (email: InboxEmail) => Promise<boolean>;
  archive_email: (email: InboxEmail) => Promise<boolean>;
  unarchive_email: (email: InboxEmail) => Promise<boolean>;
  delete_email: (email: InboxEmail) => Promise<boolean>;
  mark_as_spam: (email: InboxEmail) => Promise<boolean>;
  unmark_spam: (email: InboxEmail) => Promise<boolean>;
  add_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  remove_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  move_to_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  restore_from_trash: (
    email: InboxEmail,
    restore_to?: "inbox" | "archive",
  ) => Promise<boolean>;
  permanently_delete: (email: InboxEmail) => Promise<boolean>;
}

export function use_single_actions(
  state_ctx: ActionStateContext,
  metadata: MetadataHelpers,
): SingleActions {
  const {
    t,
    preferences,
    set_action_loading,
    set_action_error,
    clear_action_state,
    config,
    update_with_metadata,
    execute_single_action,
  } = use_single_actions_core(state_ctx, metadata);

  const {
    toggle_star,
    toggle_pin,
    toggle_read,
    mark_as_read,
    mark_as_unread,
    archive_email,
    unarchive_email,
    delete_email,
  } = use_single_actions_flags({
    t,
    preferences,
    config,
    update_with_metadata,
    execute_single_action,
  });

  const {
    mark_as_spam,
    unmark_spam,
    add_folder,
    remove_folder,
    move_to_folder,
    restore_from_trash,
    permanently_delete,
  } = use_single_actions_folders({
    t,
    set_action_loading,
    set_action_error,
    clear_action_state,
    config,
    update_with_metadata,
    execute_single_action,
  });

  return {
    toggle_star,
    toggle_pin,
    toggle_read,
    mark_as_read,
    mark_as_unread,
    archive_email,
    unarchive_email,
    delete_email,
    mark_as_spam,
    unmark_spam,
    add_folder,
    remove_folder,
    move_to_folder,
    restore_from_trash,
    permanently_delete,
  };
}
