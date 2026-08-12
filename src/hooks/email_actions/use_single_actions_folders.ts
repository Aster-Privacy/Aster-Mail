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
import type { use_single_actions_core } from "./use_single_actions_core";

import { useCallback } from "react";

import { emit_mail_item_updated } from "../mail_events";
import {
  emit_mail_changed,
  emit_mail_soft_refresh,
  emit_mail_action,
} from "../email_action_types";

import {
  add_mail_item_folder,
  remove_mail_item_folder,
  move_mail_item,
  restore_mail_item,
  permanent_delete_mail_item,
  report_spam_sender,
  remove_spam_sender,
} from "@/services/api/mail";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  invalidate_mail_stats,
  adjust_stats_spam,
  adjust_stats_trash,
  adjust_stats_unread,
} from "@/hooks/use_mail_stats";
import { remove_email_from_view_cache } from "@/hooks/email_list_cache";
import { ignore_error } from "@/lib/ignore_error";

import {
  compute_untrash_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";

type SingleActionsFolderParams = Pick<
  ReturnType<typeof use_single_actions_core>,
  | "t"
  | "set_action_loading"
  | "set_action_error"
  | "clear_action_state"
  | "config"
  | "update_with_metadata"
  | "execute_single_action"
>;

export function use_single_actions_folders(params: SingleActionsFolderParams) {
  const {
    t,
    set_action_loading,
    set_action_error,
    clear_action_state,
    config,
    update_with_metadata,
    execute_single_action,
  } = params;

  const mark_as_spam = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const is_received = email.item_type === "received";
      const is_unread = !email.is_read;

      if (is_received) {
        adjust_stats_spam(1);
        if (is_unread) adjust_stats_unread(-1);
      }

      const spam_update = { is_spam: true, is_trashed: false };
      const original_state = {
        is_spam: email.is_spam,
        is_trashed: email.is_trashed,
      };

      const success = await execute_single_action(
        email,
        "spam",
        spam_update,
        () => update_with_metadata(email, spam_update),
        true,
        {
          message: t("common.message_marked_as_spam"),
          action_type: "spam",
          email_ids: [email.id],
          on_undo: async () => {
            if (is_received) {
              adjust_stats_spam(-1);
              if (is_unread) adjust_stats_unread(1);
            }
            await update_with_metadata(email, original_state);
            remove_spam_sender(email.sender_email).catch((caught) =>
              ignore_error(
                "hooks/email_actions/use_single_actions_folders:use_single_actions_folders",
                caught,
              ),
            );
            emit_mail_soft_refresh();
          },
        },
      );

      if (success) {
        report_spam_sender(email.sender_email).catch((caught) =>
          ignore_error(
            "hooks/email_actions/use_single_actions_folders:use_single_actions_folders",
            caught,
          ),
        );
      } else if (is_received) {
        adjust_stats_spam(-1);
        if (is_unread) adjust_stats_unread(1);
      }

      return success;
    },
    [execute_single_action, update_with_metadata, t],
  );

  const unmark_spam = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      adjust_stats_spam(-1);

      const success = await execute_single_action(
        email,
        "spam",
        { is_spam: false },
        () => update_with_metadata(email, { is_spam: false }),
        true,
        {
          message: t("common.marked_as_not_spam"),
          action_type: "not_spam",
          email_ids: [email.id],
          on_undo: async () => {
            adjust_stats_spam(1);
            await update_with_metadata(email, { is_spam: true });
            report_spam_sender(email.sender_email).catch((caught) =>
              ignore_error(
                "hooks/email_actions/use_single_actions_folders:use_single_actions_folders",
                caught,
              ),
            );
            emit_mail_soft_refresh();
          },
        },
      );

      if (success) {
        remove_spam_sender(email.sender_email).catch((caught) =>
          ignore_error(
            "hooks/email_actions/use_single_actions_folders:use_single_actions_folders",
            caught,
          ),
        );
      } else {
        adjust_stats_spam(1);
      }

      return success;
    },
    [execute_single_action, update_with_metadata, t],
  );

  const add_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("label", true);

      try {
        const result = await add_mail_item_folder(email.id, { folder_token });

        if (result.error) {
          set_action_error("label", result.error);

          return false;
        }

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action("label", [email.id]);
        config.on_success?.("label", email.id);

        show_action_toast({
          message: t("common.added_label", { label: folder_token }),
          action_type: "folder",
          email_ids: [email.id],
          on_undo: async () => {
            await remove_mail_item_folder(email.id, folder_token);
            emit_mail_changed();
          },
        });

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : t("common.failed_to_add_label");

        set_action_error("label", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      config.on_success,
      t,
    ],
  );

  const remove_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("label", true);

      try {
        const result = await remove_mail_item_folder(email.id, folder_token);

        if (result.error) {
          set_action_error("label", result.error);

          return false;
        }

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action("label", [email.id]);
        config.on_success?.("label", email.id);

        show_action_toast({
          message: t("common.removed_label", { label: folder_token }),
          action_type: "folder",
          email_ids: [email.id],
          on_undo: async () => {
            await add_mail_item_folder(email.id, { folder_token });
            emit_mail_changed();
          },
        });

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error
            ? err.message
            : t("common.failed_to_remove_label");

        set_action_error("label", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      config.on_success,
      t,
    ],
  );

  const move_to_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("move", true);

      try {
        const result = await move_mail_item(email.id, { folder_token });

        if (result.error) {
          set_action_error("move", result.error);

          return false;
        }

        clear_action_state("move");
        config.on_remove_from_list?.(email.id);
        emit_mail_changed();
        emit_mail_action("move", [email.id]);
        config.on_success?.("move", email.id);

        show_action_toast({
          message: t("common.moved_to_folder", { folder: folder_token }),
          action_type: "folder",
          email_ids: [email.id],
        });

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : t("common.failed_to_move_email");

        set_action_error("move", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      config.on_remove_from_list,
      config.on_success,
      t,
    ],
  );

  const restore_from_trash = useCallback(
    async (
      email: InboxEmail,
      restore_to: "inbox" | "archive" = "inbox",
    ): Promise<boolean> => {
      const base_deltas = compute_untrash_deltas(email);
      const deltas =
        restore_to === "archive"
          ? {
              ...base_deltas,
              inbox: 0,
              archived: email.item_type === "received" ? 1 : 0,
            }
          : base_deltas;

      apply_stat_deltas(deltas);

      const success = await execute_single_action(
        email,
        "restore",
        { is_trashed: false, is_archived: restore_to === "archive" },
        () => restore_mail_item(email.id, { target: restore_to }),
        true,
        {
          message: t("common.restored_from_trash"),
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await update_with_metadata(email, { is_trashed: true });
            emit_mail_item_updated({ id: email.id, is_trashed: true });
            emit_mail_soft_refresh();
          },
        },
      );

      if (success) {
        emit_mail_changed();
      } else {
        revert_stat_deltas(deltas);
      }

      return success;
    },
    [execute_single_action, update_with_metadata, t],
  );

  const permanently_delete = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      set_action_loading("permanent_delete", true);

      try {
        const result = await permanent_delete_mail_item(email.id);

        if (result.error) {
          set_action_error("permanent_delete", result.error);

          return false;
        }

        clear_action_state("permanent_delete");
        adjust_stats_trash(-1);
        invalidate_mail_stats();
        remove_email_from_view_cache(email.id);
        config.on_remove_from_list?.(email.id);
        emit_mail_changed();
        emit_mail_action("permanent_delete", [email.id]);
        config.on_success?.("permanent_delete", email.id);

        show_action_toast({
          message: t("common.email_permanently_deleted"),
          action_type: "trash",
          email_ids: [email.id],
        });

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error
            ? err.message
            : t("common.failed_to_permanently_delete");

        set_action_error("permanent_delete", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      config.on_remove_from_list,
      config.on_success,
      t,
    ],
  );

  return {
    mark_as_spam,
    unmark_spam,
    add_folder,
    remove_folder,
    move_to_folder,
    restore_from_trash,
    permanently_delete,
  };
}
