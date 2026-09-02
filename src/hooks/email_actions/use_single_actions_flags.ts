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
  emit_mail_soft_refresh,
  try_enqueue_offline_action,
} from "../email_action_types";

import { trash_thread } from "@/services/api/mail";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import {
  adjust_stats_starred,
  adjust_stats_unread,
} from "@/hooks/use_mail_stats";
import {
  conversation_has_unread_sibling,
  read_clears_conversation,
} from "@/hooks/unread_read_delta";
import { mark_conversation_read } from "@/hooks/mark_conversation_read";
import { remove_email_from_view_cache } from "@/hooks/email_list_cache";
import {
  clear_flag_intents,
  note_flag_intents,
} from "@/services/read_intent";
import {
  compute_trash_deltas,
  compute_archive_deltas,
  compute_unarchive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";

type SingleActionsFlagsParams = Pick<
  ReturnType<typeof use_single_actions_core>,
  | "t"
  | "preferences"
  | "config"
  | "update_with_metadata"
  | "execute_single_action"
>;

export function use_single_actions_flags(params: SingleActionsFlagsParams) {
  const {
    t,
    preferences,
    config,
    update_with_metadata,
    execute_single_action,
  } = params;

  const toggle_star = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_starred = !email.is_starred;

      note_flag_intents([email.id], { is_starred: new_starred });

      const offline_result = await try_enqueue_offline_action(
        "star",
        [email.id],
        t,
        { starred: new_starred },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_starred: new_starred });
        adjust_stats_starred(new_starred ? 1 : -1);

        return true;
      }

      adjust_stats_starred(new_starred ? 1 : -1);

      const success = await execute_single_action(
        email,
        "star",
        { is_starred: new_starred },
        () => update_with_metadata(email, { is_starred: new_starred }),
      );

      if (!success) {
        adjust_stats_starred(new_starred ? -1 : 1);
        clear_flag_intents([email.id], { is_starred: new_starred });
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

      note_flag_intents([email.id], { is_pinned: new_pinned });

      const success = await execute_single_action(
        email,
        "pin",
        { is_pinned: new_pinned },
        () => update_with_metadata(email, { is_pinned: new_pinned }),
      );

      if (!success) {
        clear_flag_intents([email.id], { is_pinned: new_pinned });
      }

      return success;
    },
    [execute_single_action, update_with_metadata],
  );

  const toggle_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_read = !email.is_read;
      const is_received = email.item_type === "received";
      const conversation_options = {
        thread_token: email.thread_token,
        thread_message_count: email.thread_message_count,
        grouped_count: email.grouped_email_ids?.length,
        conversation_grouping: preferences.conversation_grouping,
        acted_id: email.id,
      };
      const should_adjust_unread =
        is_received &&
        (new_read
          ? read_clears_conversation(conversation_options)
          : !conversation_has_unread_sibling(conversation_options));

      const offline_result = await try_enqueue_offline_action(
        new_read ? "read" : "unread",
        [email.id],
        t,
        { read: new_read },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: new_read });
        emit_mail_item_updated({ id: email.id, is_read: new_read });
        if (should_adjust_unread) adjust_stats_unread(new_read ? -1 : 1);

        return true;
      }

      if (should_adjust_unread) adjust_stats_unread(new_read ? -1 : 1);
      emit_mail_item_updated({ id: email.id, is_read: new_read });

      const success = await execute_single_action(
        email,
        new_read ? "read" : "unread",
        { is_read: new_read },
        () => update_with_metadata(email, { is_read: new_read }),
      );

      if (!success) {
        emit_mail_item_updated({ id: email.id, is_read: !new_read });
        if (should_adjust_unread) adjust_stats_unread(new_read ? 1 : -1);
      }

      if (success && is_received && new_read) {
        mark_conversation_read(conversation_options);
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      preferences.conversation_grouping,
      t,
    ],
  );

  const mark_as_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (email.is_read) return true;

      const is_received = email.item_type === "received";
      const conversation_options = {
        thread_token: email.thread_token,
        thread_message_count: email.thread_message_count,
        grouped_count: email.grouped_email_ids?.length,
        conversation_grouping: preferences.conversation_grouping,
        acted_id: email.id,
      };
      const should_adjust_unread =
        is_received && read_clears_conversation(conversation_options);

      const offline_result = await try_enqueue_offline_action(
        "read",
        [email.id],
        t,
        { read: true },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: true });
        emit_mail_item_updated({ id: email.id, is_read: true });
        if (should_adjust_unread) adjust_stats_unread(-1);

        return true;
      }

      if (should_adjust_unread) adjust_stats_unread(-1);
      emit_mail_item_updated({ id: email.id, is_read: true });

      const success = await execute_single_action(
        email,
        "read",
        { is_read: true },
        () => update_with_metadata(email, { is_read: true }),
      );

      if (!success) {
        emit_mail_item_updated({ id: email.id, is_read: false });
        if (should_adjust_unread) adjust_stats_unread(1);
      }

      if (success && is_received) {
        mark_conversation_read(conversation_options);
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      preferences.conversation_grouping,
      t,
    ],
  );

  const mark_as_unread = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (!email.is_read) return true;

      const is_received = email.item_type === "received";
      const should_adjust_unread =
        is_received &&
        !conversation_has_unread_sibling({
          thread_token: email.thread_token,
          acted_id: email.id,
        });

      const offline_result = await try_enqueue_offline_action(
        "unread",
        [email.id],
        t,
        { read: false },
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_read: false });
        emit_mail_item_updated({ id: email.id, is_read: false });
        if (should_adjust_unread) adjust_stats_unread(1);

        return true;
      }

      if (should_adjust_unread) adjust_stats_unread(1);
      emit_mail_item_updated({ id: email.id, is_read: false });

      const success = await execute_single_action(
        email,
        "unread",
        { is_read: false },
        () => update_with_metadata(email, { is_read: false }),
      );

      if (!success) {
        emit_mail_item_updated({ id: email.id, is_read: true });
        if (should_adjust_unread) adjust_stats_unread(-1);
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

  const archive_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const deltas = compute_archive_deltas(email);
      const grouped_ids =
        email.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [email.id];

      const offline_result = await try_enqueue_offline_action(
        "archive",
        grouped_ids,
        t,
      );

      const archive_update = {
        is_archived: true,
        is_trashed: false,
        is_spam: false,
      };
      const original_state = {
        is_archived: email.is_archived,
        is_trashed: email.is_trashed,
        is_spam: email.is_spam,
      };

      note_flag_intents(grouped_ids, archive_update);

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, archive_update);
        config.on_remove_from_list?.(email.id);
        apply_stat_deltas(deltas);

        return true;
      }

      apply_stat_deltas(deltas);

      const success = await execute_single_action(
        email,
        "archive",
        archive_update,
        async () => {
          const batch_result = await api_batch_archive({
            ids: grouped_ids,
            tier: "hot",
          });

          if (batch_result.error || !batch_result.data?.success) {
            return {
              error: batch_result.error || t("common.failed_to_archive_emails"),
            };
          }

          if (grouped_ids.length > 1) {
            const meta = await bulk_update_metadata_by_ids(
              grouped_ids,
              archive_update,
            );

            if (!meta.success) {
              return { error: t("common.failed_to_archive_emails") };
            }
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, ...archive_update });
            }

            return { data: {} };
          }

          return update_with_metadata(email, archive_update);
        },
        true,
        {
          message:
            grouped_ids.length > 1
              ? t("common.conversation_archived")
              : t("common.message_archived"),
          action_type: "archive",
          email_ids: grouped_ids,
          on_undo: async () => {
            note_flag_intents(grouped_ids, original_state);
            const undo_result = await api_batch_unarchive({
              ids: grouped_ids,
            });

            if (undo_result.error || !undo_result.data?.success) {
              clear_flag_intents(grouped_ids, original_state);
              throw new Error(
                undo_result.error || t("common.failed_to_move_email"),
              );
            }
            revert_stat_deltas(deltas);
            if (grouped_ids.length > 1) {
              await bulk_update_metadata_by_ids(grouped_ids, original_state);
              for (const id of grouped_ids) {
                emit_mail_item_updated({ id, ...original_state });
              }
            } else {
              await update_with_metadata(email, original_state);
            }
            emit_mail_soft_refresh();
          },
        },
      );

      if (!success) {
        revert_stat_deltas(deltas);
        clear_flag_intents(grouped_ids, archive_update);
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
        async () => {
          const batch_result = await api_batch_unarchive({ ids: [email.id] });

          if (batch_result.error || !batch_result.data?.success) {
            return {
              error: batch_result.error || t("common.failed_to_move_email"),
            };
          }

          return update_with_metadata(email, { is_archived: false });
        },
        true,
        {
          message: t("common.moved_to_inbox_toast"),
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            const undo_result = await api_batch_archive({
              ids: [email.id],
              tier: "hot",
            });

            if (undo_result.error || !undo_result.data?.success) {
              throw new Error(
                undo_result.error || t("common.failed_to_archive_emails"),
              );
            }
            revert_stat_deltas(deltas);
            await update_with_metadata(email, { is_archived: true });
            emit_mail_soft_refresh();
          },
        },
      );

      if (success) {
        emit_mail_soft_refresh();
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
      const grouped_ids =
        email.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [email.id];
      const thread_scope_token =
        email.thread_token &&
        (grouped_ids.length > 1 ||
          (preferences.conversation_grouping !== false &&
            (email.thread_message_count ?? 0) > 1))
          ? email.thread_token
          : null;

      note_flag_intents(grouped_ids, { is_trashed: true });

      const offline_result = await try_enqueue_offline_action(
        "delete",
        grouped_ids,
        t,
      );

      if (offline_result.queued) {
        config.on_optimistic_update?.(email.id, { is_trashed: true });
        config.on_remove_from_list?.(email.id);
        apply_stat_deltas(deltas);

        return true;
      }

      apply_stat_deltas(deltas);
      for (const id of grouped_ids) {
        remove_email_from_view_cache(id);
      }

      const success = await execute_single_action(
        email,
        "delete",
        { is_trashed: true },
        async () => {
          if (thread_scope_token) {
            const result = await trash_thread(thread_scope_token, true);

            if (!result.data) {
              return { error: t("common.failed_to_delete_emails") };
            }
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, is_trashed: true });
            }

            return { data: {} };
          }

          if (grouped_ids.length > 1) {
            const meta = await bulk_update_metadata_by_ids(grouped_ids, {
              is_trashed: true,
            });

            if (!meta.success) {
              return { error: t("common.failed_to_delete_emails") };
            }
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, is_trashed: true });
            }

            return { data: {} };
          }

          return update_with_metadata(email, { is_trashed: true });
        },
        true,
        {
          message:
            thread_scope_token || grouped_ids.length > 1
              ? t("common.conversation_moved_to_trash_toast")
              : t("common.message_moved_to_trash"),
          action_type: "trash",
          email_ids: grouped_ids,
          on_undo: async () => {
            revert_stat_deltas(deltas);
            note_flag_intents(grouped_ids, { is_trashed: false });
            if (thread_scope_token) {
              const undo_result = await trash_thread(thread_scope_token, false);

              if (undo_result.error) {
                clear_flag_intents(grouped_ids, { is_trashed: false });
                throw new Error("undo trash failed");
              }
              for (const id of grouped_ids) {
                emit_mail_item_updated({ id, is_trashed: false });
              }
            } else if (grouped_ids.length > 1) {
              const undo_result = await bulk_update_metadata_by_ids(
                grouped_ids,
                { is_trashed: false },
              );

              if (!undo_result.success) {
                clear_flag_intents(grouped_ids, { is_trashed: false });
                throw new Error("undo trash failed");
              }
              for (const id of grouped_ids) {
                emit_mail_item_updated({ id, is_trashed: false });
              }
            } else {
              const undo_result = await update_with_metadata(email, {
                is_trashed: false,
              });

              if (undo_result.error) throw new Error("undo trash failed");
            }
            emit_mail_soft_refresh();
          },
        },
      );

      if (!success) {
        revert_stat_deltas(deltas);
        clear_flag_intents(grouped_ids, { is_trashed: true });
      }

      return success;
    },
    [
      execute_single_action,
      update_with_metadata,
      config.on_optimistic_update,
      config.on_remove_from_list,
      preferences.conversation_grouping,
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
  };
}
