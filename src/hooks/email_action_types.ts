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

import { show_toast } from "@/components/toast/simple_toast";
import { get_network_status } from "@/native/capacitor_bridge";
import { enqueue_action, type OfflineActionType } from "@/native/offline_queue";

export type ActionType =
  | "star"
  | "pin"
  | "archive"
  | "delete"
  | "spam"
  | "read"
  | "unread"
  | "label"
  | "move"
  | "restore"
  | "permanent_delete";

export interface ActionState {
  is_loading: boolean;
  error: string | null;
}

export type ActionStates = Record<ActionType, ActionState>;

export interface PendingAction<T> {
  id: string;
  original_state: T;
  action_type: ActionType;
}

export interface EmailActionsConfig {
  on_optimistic_update?: (id: string, updates: Partial<InboxEmail>) => void;
  on_bulk_optimistic_update?: (
    ids: string[],
    updates: Partial<InboxEmail>,
  ) => void;
  on_remove_from_list?: (id: string) => void;
  on_bulk_remove_from_list?: (ids: string[]) => void;
  on_error?: (error: string, action_type: ActionType) => void;
  on_success?: (action_type: ActionType, id?: string) => void;
}

export interface UseEmailActionsReturn {
  action_states: ActionStates;
  is_any_action_loading: boolean;
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
  bulk_star: (emails: InboxEmail[], starred: boolean) => Promise<boolean>;
  bulk_archive: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_delete: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_mark_read: (emails: InboxEmail[], is_read: boolean) => Promise<boolean>;
  bulk_mark_spam: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_add_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
  bulk_remove_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
  copy_email_id: (email: InboxEmail) => Promise<boolean>;
  copy_sender_email: (email: InboxEmail) => Promise<boolean>;
}

export const INITIAL_ACTION_STATE: ActionState = {
  is_loading: false,
  error: null,
};

export const INITIAL_ACTION_STATES: ActionStates = {
  star: { ...INITIAL_ACTION_STATE },
  pin: { ...INITIAL_ACTION_STATE },
  archive: { ...INITIAL_ACTION_STATE },
  delete: { ...INITIAL_ACTION_STATE },
  spam: { ...INITIAL_ACTION_STATE },
  read: { ...INITIAL_ACTION_STATE },
  unread: { ...INITIAL_ACTION_STATE },
  label: { ...INITIAL_ACTION_STATE },
  move: { ...INITIAL_ACTION_STATE },
  restore: { ...INITIAL_ACTION_STATE },
  permanent_delete: { ...INITIAL_ACTION_STATE },
};

export function emit_mail_changed(): void {
  window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
}

export function emit_mail_soft_refresh(): void {
  window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
}

export function emit_mail_action(action: ActionType, ids: string[]): void {
  window.dispatchEvent(
    new CustomEvent("astermail:mail-action", {
      detail: { action, ids },
    }),
  );
}

const VIEW_CHANGING_ACTIONS: ActionType[] = [
  "archive",
  "delete",
  "spam",
  "restore",
  "permanent_delete",
  "move",
  "label",
];

export function is_view_changing_action(action: ActionType): boolean {
  return VIEW_CHANGING_ACTIONS.includes(action);
}

const OFFLINE_SUPPORTED_ACTIONS: Record<ActionType, OfflineActionType | null> =
  {
    star: "star",
    archive: "archive",
    delete: "delete",
    read: "mark_read",
    unread: "mark_read",
    move: "move",
    pin: null,
    spam: null,
    label: null,
    restore: null,
    permanent_delete: null,
  };

function get_offline_action_type(action: ActionType): OfflineActionType | null {
  return OFFLINE_SUPPORTED_ACTIONS[action];
}

export async function try_enqueue_offline_action(
  action_type: ActionType,
  email_ids: string[],
  t: (key: TranslationKey) => string,
  extra_payload?: Record<string, unknown>,
): Promise<{ queued: boolean; action_id?: string }> {
  const offline_type = get_offline_action_type(action_type);

  if (!offline_type) {
    return { queued: false };
  }

  const status = await get_network_status();

  if (status.connected) {
    return { queued: false };
  }

  let payload: unknown;

  switch (offline_type) {
    case "star":
      payload = {
        email_ids,
        starred: extra_payload?.starred ?? true,
      };
      break;
    case "mark_read":
      payload = {
        email_ids,
        read: extra_payload?.read ?? true,
      };
      break;
    case "move":
      payload = {
        email_ids,
        folder_id: extra_payload?.folder_id,
      };
      break;
    default:
      payload = { email_ids };
  }

  const action_id = await enqueue_action(offline_type, payload);

  show_toast(t("common.offline_action_queued"), "info");

  return { queued: true, action_id };
}
