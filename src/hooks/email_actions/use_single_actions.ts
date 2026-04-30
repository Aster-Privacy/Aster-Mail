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

import { useCallback } from "react";

import {
  emit_mail_item_updated,
  MAIL_EVENTS,
  type MailItemUpdatedEventDetail,
} from "../mail_events";
import {
  type ActionType,
  is_view_changing_action,
  emit_mail_changed,
  emit_mail_soft_refresh,
  emit_mail_action,
  try_enqueue_offline_action,
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
  adjust_starred_count,
  adjust_trash_count,
} from "@/hooks/use_mail_counts";
import {
  invalidate_mail_stats,
  adjust_stats_spam,
} from "@/hooks/use_mail_stats";
import { invalidate_mail_cache, remove_email_from_view_cache } from "@/hooks/email_list_cache";
import {
  compute_trash_deltas,
  compute_archive_deltas,
  compute_unarchive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { use_i18n } from "@/lib/i18n/context";

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
  const { t } = use_i18n();
  const {
    set_action_loading,
    set_action_error,
    clear_action_state,
    create_pending_action,
    remove_pending_action,
    rollback_action,
    config,
  } = state_ctx;
  const { update_with_metadata } = metadata;

  const execute_single_action = useCallback(
    async <T>(
      email: InboxEmail,
      action_type: ActionType,
      optimistic_update: Partial<InboxEmail>,
      api_call: () => Promise<{ data?: T; error?: string }>,
      should_remove_from_list = false,
    ): Promise<boolean> => {
      const original_state: Partial<InboxEmail> = {};

      for (const key of Object.keys(
        optimistic_update,
      ) as (keyof InboxEmail)[]) {
        original_state[key] = email[key] as never;
      }

      create_pending_action(email.id, action_type, original_state);
      set_action_loading(action_type, true);
      config.on_optimistic_update?.(email.id, optimistic_update);

      try {
        const result = await api_call();

        if (result.error) {
          rollback_action(email.id, action_type);
          set_action_error(action_type, result.error);

          return false;
        }

        remove_pending_action(email.id, action_type);
        clear_action_state(action_type);

        if (should_remove_from_list) {
          config.on_remove_from_list?.(email.id);
        }

        if (is_view_changing_action(action_type)) {
          emit_mail_changed();
        } else {
          const metadata_update =
            result.data &&
            typeof result.data === "object" &&
            "encrypted_metadata" in result.data
              ? {
                  encrypted_metadata: (
                    result.data as {
                      encrypted_metadata?: string;
                      metadata_nonce?: string;
                    }
                  ).encrypted_metadata,
                  metadata_nonce: (
                    result.data as {
                      encrypted_metadata?: string;
                      metadata_nonce?: string;
                    }
                  ).metadata_nonce,
                }
              : {};

          emit_mail_item_updated({
            id: email.id,
            ...optimistic_update,
            ...metadata_update,
          } as MailItemUpdatedEventDetail);
        }
        emit_mail_action(action_type, [email.id]);
        config.on_success?.(action_type, email.id);

        return true;
      } catch (err) {
        rollback_action(email.id, action_type);
        const error_message =
          err instanceof Error ? err.message : t("common.unexpected_error");

        set_action_error(action_type, error_message);

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      config,
      rollback_action,
      set_action_error,
      remove_pending_action,
      clear_action_state,
    ],
  );

  const toggle_star = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_starred = !email.is_starred;

      const offline_result = await try_enqueue_offline_action(
        "star",
        [email.id],
        t,
        { starred: new_starred },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_starred: new_starred });
        adjust_starred_count(new_starred ? 1 : -1);

        return true;
      }

      adjust_starred_count(new_starred ? 1 : -1);

      const success = await execute_single_action(
        email,
        "star",
        { is_starred: new_starred },
        () => update_with_metadata(email, { is_starred: new_starred }),
      );

      if (!success) {
        adjust_starred_count(new_starred ? -1 : 1);
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      t,
    ],
  );

  const toggle_pin = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_pinned = !email.is_pinned;

      return execute_single_action(
        email,
        "pin",
        { is_pinned: new_pinned },
        () => update_with_metadata(email, { is_pinned: new_pinned }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const toggle_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_read = !email.is_read;

      const offline_result = await try_enqueue_offline_action(
        new_read ? "read" : "unread",
        [email.id],
        t,
        { read: new_read },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: new_read });

        return true;
      }

      return execute_single_action(
        email,
        new_read ? "read" : "unread",
        { is_read: new_read },
        () => update_with_metadata(email, { is_read: new_read }),
      );
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      t,
    ],
  );

  const mark_as_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (email.is_read) return true;

      const offline_result = await try_enqueue_offline_action(
        "read",
        [email.id],
        t,
        { read: true },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: true });

        return true;
      }

      return execute_single_action(email, "read", { is_read: true }, () =>
        update_with_metadata(email, { is_read: true }),
      );
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      t,
    ],
  );

  const mark_as_unread = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (!email.is_read) return true;

      const offline_result = await try_enqueue_offline_action(
        "unread",
        [email.id],
        t,
        { read: false },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: false });

        return true;
      }

      return execute_single_action(email, "unread", { is_read: false }, () =>
        update_with_metadata(email, { is_read: false }),
      );
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      t,
    ],
  );

  const archive_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const deltas = compute_archive_deltas(email);

      const offline_result = await try_enqueue_offline_action(
        "archive",
        [email.id],
        t,
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_archived: true });
        config.on_remove_from_list?.(email.id);
        apply_stat_deltas(deltas);

        return true;
      }

      apply_stat_deltas(deltas);

      const success = await execute_single_action(
        email,
        "archive",
        { is_archived: true },
        () => update_with_metadata(email, { is_archived: true }),
        true,
      );

      if (success) {
        show_action_toast({
          message: t("common.conversation_archived"),
          action_type: "archive",
          email_ids: [email.id],
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await update_with_metadata(email, { is_archived: false });
            emit_mail_soft_refresh();
          },
        });
      } else {
        revert_stat_deltas(deltas);
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      config.on_remove_from_list,
      t,
    ],
  );

  const unarchive_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const deltas = compute_unarchive_deltas(email);

      apply_stat_deltas(deltas);

      const success = await execute_single_action(
        email,
        "archive",
        { is_archived: false },
        () => update_with_metadata(email, { is_archived: false }),
        true,
      );

      if (success) {
        show_action_toast({
          message: t("common.moved_to_inbox_toast"),
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await update_with_metadata(email, { is_archived: true });
            emit_mail_soft_refresh();
          },
        });
      } else {
        revert_stat_deltas(deltas);
      }

      return success;
    },
    [execute_single_action, update_with_metadata, t],
  );

  const delete_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const deltas = compute_trash_deltas(email);

      const offline_result = await try_enqueue_offline_action(
        "delete",
        [email.id],
        t,
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_trashed: true });
        config.on_remove_from_list?.(email.id);
        apply_stat_deltas(deltas);

        return true;
      }

      apply_stat_deltas(deltas);
      remove_email_from_view_cache(email.id);

      const success = await execute_single_action(
        email,
        "delete",
        { is_trashed: true },
        () => update_with_metadata(email, { is_trashed: true }),
        true,
      );

      if (success) {
        show_action_toast({
          message: t("common.conversation_moved_to_trash_toast"),
          action_type: "trash",
          email_ids: [email.id],
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await update_with_metadata(email, { is_trashed: false });
            emit_mail_soft_refresh();
          },
        });
      } else {
        revert_stat_deltas(deltas);
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      config.on_remove_from_list,
      t,
    ],
  );

  const mark_as_spam = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const is_unread_received =
        email.item_type === "received" && !email.is_read;

      if (is_unread_received) {
        adjust_stats_spam(1);
      }

      const success = await execute_single_action(
        email,
        "spam",
        { is_spam: true },
        () => update_with_metadata(email, { is_spam: true }),
        true,
      );

      if (success) {
        report_spam_sender(email.sender_email).catch(() => {});
        show_action_toast({
          message: t("common.conversation_marked_as_spam_toast"),
          action_type: "spam",
          email_ids: [email.id],
          on_undo: async () => {
            if (is_unread_received) {
              adjust_stats_spam(-1);
            }
            await update_with_metadata(email, { is_spam: false });
            remove_spam_sender(email.sender_email).catch(() => {});
            emit_mail_soft_refresh();
          },
        });
      } else if (is_unread_received) {
        adjust_stats_spam(-1);
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
      );

      if (success) {
        remove_spam_sender(email.sender_email).catch(() => {});
        show_action_toast({
          message: t("common.marked_as_not_spam"),
          action_type: "not_spam",
          email_ids: [email.id],
          on_undo: async () => {
            adjust_stats_spam(1);
            await update_with_metadata(email, { is_spam: true });
            report_spam_sender(email.sender_email).catch(() => {});
            emit_mail_soft_refresh();
          },
        });
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
      const success = await execute_single_action(
        email,
        "restore",
        { is_trashed: false, is_archived: restore_to === "archive" },
        () => restore_mail_item(email.id, { target: restore_to }),
        true,
      );

      if (success) {
        adjust_trash_count(-1);
        invalidate_mail_cache();
        emit_mail_changed();
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.REFRESH_REQUESTED));
        }, 450);

        show_action_toast({
          message: t("common.restored_from_trash"),
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            adjust_trash_count(1);
            await update_with_metadata(email, { is_trashed: true });
            invalidate_mail_cache();
            emit_mail_soft_refresh();
          },
        });
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
        adjust_trash_count(-1);
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
