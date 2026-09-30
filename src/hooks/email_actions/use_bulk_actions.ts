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
import type { ActionStateContext } from "./use_action_state";
import type { MetadataHelpers } from "./use_metadata_helpers";

import { useCallback } from "react";

import {
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "../mail_events";
import {
  type ActionType,
  emit_mail_changed,
  emit_mail_soft_refresh,
  emit_mail_action,
} from "../email_action_types";

import { report_spam_sender, remove_spam_sender } from "@/services/api/mail";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import {
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
  get_thread_messages,
} from "@/services/api/mail";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { PROGRESS_THRESHOLDS } from "@/constants/batch_config";
import {
  bulk_action_result,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import {
  collect_conversation_thread_tokens,
  mark_conversation_threads_read,
} from "@/hooks/mark_conversation_read";
import { conversation_read_delta } from "@/hooks/unread_read_delta";
import { use_preferences } from "@/contexts/preferences_context";
import {
  adjust_stats_starred,
  adjust_stats_unread,
} from "@/hooks/use_mail_stats";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { use_i18n } from "@/lib/i18n/context";
import { ignore_error } from "@/lib/ignore_error";
import { user_facing_error } from "@/utils/user_facing_error";

const ARCHIVE_BATCH_CHUNK_SIZE = 100;

async function run_archive_batch(
  ids: string[],
  is_archived: boolean,
): Promise<{ error?: string; failed_ids: string[] }> {
  const failed_ids: string[] = [];

  let error: string | undefined;

  for (let i = 0; i < ids.length; i += ARCHIVE_BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ARCHIVE_BATCH_CHUNK_SIZE);
    const result = is_archived
      ? await api_batch_archive({ ids: chunk, tier: "hot" })
      : await api_batch_unarchive({ ids: chunk });

    if (result.error || !result.data?.success) {
      error = error || result.error || "batch archive failed";
      failed_ids.push(...chunk);
    }
  }

  return error ? { error, failed_ids } : { failed_ids };
}

async function apply_archive_batch_for_undo(
  meta: { is_archived?: boolean },
  ids: string[],
): Promise<void> {
  if (meta.is_archived === undefined || ids.length === 0) return;

  const result = await run_archive_batch(ids, meta.is_archived === true);

  if (result.error || result.failed_ids.length > 0) {
    throw new Error(result.error || "batch archive failed");
  }
}

export interface BulkActions {
  bulk_star: (emails: InboxEmail[], starred: boolean) => Promise<boolean>;
  bulk_archive: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_unarchive: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_delete: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_mark_read: (emails: InboxEmail[], is_read: boolean) => Promise<boolean>;
  bulk_mark_spam: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_unmark_spam: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_add_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
  bulk_remove_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
}

export function use_bulk_actions(
  state_ctx: ActionStateContext,
  metadata: MetadataHelpers,
): BulkActions {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const {
    set_action_loading,
    set_action_error,
    clear_action_state,
    create_pending_action,
    remove_pending_action,
    rollback_action,
    bulk_abort_ref,
    config,
  } = state_ctx;
  const { bulk_update_with_metadata } = metadata;

  const execute_bulk_action = useCallback(
    async (
      emails: InboxEmail[],
      action_config: {
        action_type: ActionType;
        optimistic_update: Partial<InboxEmail>;
        original_state_extractor: (email: InboxEmail) => Partial<InboxEmail>;
        metadata_update: Partial<{
          is_read: boolean;
          is_starred: boolean;
          is_pinned: boolean;
          is_trashed: boolean;
          is_archived: boolean;
          is_spam: boolean;
        }>;
        remove_from_list?: boolean;
        emit_view_change?: boolean;
        error_message: string;
        success_toast?: {
          message_key: string;
          toast_action_type:
            | "archive"
            | "trash"
            | "spam"
            | "read"
            | "unread"
            | "star"
            | "unstar"
            | "folder"
            | "pin"
            | "restore"
            | "not_spam"
            | "snooze";
          undo_metadata?: Partial<{
            is_read: boolean;
            is_starred: boolean;
            is_pinned: boolean;
            is_trashed: boolean;
            is_archived: boolean;
            is_spam: boolean;
          }>;
          compute_undo_metadata?: (email: InboxEmail) => Partial<{
            is_read: boolean;
            is_starred: boolean;
            is_pinned: boolean;
            is_trashed: boolean;
            is_archived: boolean;
            is_spam: boolean;
          }>;
          on_after_undo?: (undone: InboxEmail[]) => void | Promise<void>;
        };
        extra_failed_ids?: string[];
        on_before_api?: () => void;
        on_partial_failure?: (failed_ids: string[]) => void;
        on_full_rollback?: () => void;
        finalize_failed_ids?: (succeeded_ids: string[]) => Promise<string[]>;
      },
    ): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(
          email.id,
          action_config.action_type,
          action_config.original_state_extractor(email),
        );
      }
      set_action_loading(action_config.action_type, true);
      config.on_bulk_optimistic_update?.(ids, action_config.optimistic_update);

      const optimistic_can_evict =
        action_config.optimistic_update.is_starred === false ||
        action_config.optimistic_update.is_trashed === true ||
        action_config.optimistic_update.is_spam === true ||
        action_config.optimistic_update.is_archived === true;

      if (!action_config.emit_view_change && !optimistic_can_evict) {
        for (const email of emails) {
          emit_mail_item_updated({
            id: email.id,
            ...action_config.optimistic_update,
          } as MailItemUpdatedEventDetail);
        }
      }

      if (action_config.remove_from_list) {
        config.on_bulk_remove_from_list?.(ids);
      }

      action_config.on_before_api?.();

      const abort_controller = new AbortController();

      bulk_abort_ref.current = abort_controller;

      if (show_progress) {
        show_action_toast({
          message: t("common.processing_count", {
            completed: "0",
            total: ids.length,
          }),
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => abort_controller.abort(),
        });
      }

      try {
        const result = await bulk_update_with_metadata(
          emails,
          action_config.metadata_update,
          {
            signal: abort_controller.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total, t);
            },
          },
        );

        if (show_progress) hide_action_toast();

        const failed_set = new Set(result.failed_ids);

        if (action_config.finalize_failed_ids) {
          const extra_failed_ids = await action_config.finalize_failed_ids(
            ids.filter((id) => !failed_set.has(id)),
          );

          for (const id of extra_failed_ids) {
            failed_set.add(id);
          }
        }

        const failed_ids = ids.filter((id) => failed_set.has(id));

        if (failed_ids.length > 0) {
          for (const id of failed_ids) {
            rollback_action(id, action_config.action_type);
          }
          if (!action_config.emit_view_change) {
            for (const email of emails) {
              if (failed_set.has(email.id)) {
                emit_mail_item_updated({
                  id: email.id,
                  ...action_config.original_state_extractor(email),
                } as MailItemUpdatedEventDetail);
              }
            }
          }
          action_config.on_partial_failure?.(failed_ids);
        }

        const successful_ids = ids.filter((i) => !failed_set.has(i));

        for (const id of successful_ids) {
          remove_pending_action(id, action_config.action_type);
        }
        clear_action_state(action_config.action_type);

        if (action_config.emit_view_change) {
          emit_mail_changed();
        } else {
          for (const email of emails.filter((e) => !failed_set.has(e.id))) {
            emit_mail_item_updated({
              id: email.id,
              ...action_config.optimistic_update,
            } as MailItemUpdatedEventDetail);
          }
        }

        emit_mail_action(action_config.action_type, successful_ids);
        config.on_success?.(action_config.action_type);

        if (action_config.success_toast) {
          const successful_emails = emails.filter((e) => !failed_set.has(e.id));
          const compute_undo =
            action_config.success_toast.compute_undo_metadata;
          const fixed_undo = action_config.success_toast.undo_metadata;

          let on_undo: (() => Promise<void>) | undefined;

          if (compute_undo) {
            on_undo = async () => {
              const groups = new Map<
                string,
                {
                  meta: Partial<{
                    is_read: boolean;
                    is_starred: boolean;
                    is_pinned: boolean;
                    is_trashed: boolean;
                    is_archived: boolean;
                    is_spam: boolean;
                  }>;
                  emails: InboxEmail[];
                }
              >();

              for (const email of successful_emails) {
                const meta = compute_undo(email);
                const key = JSON.stringify(meta);
                const entry = groups.get(key);

                if (entry) {
                  entry.emails.push(email);
                } else {
                  groups.set(key, { meta, emails: [email] });
                }
              }

              for (const { meta, emails: group } of groups.values()) {
                await apply_archive_batch_for_undo(
                  meta,
                  group.map((e) => e.id),
                );
                await bulk_update_with_metadata(group, meta);
              }
              await action_config.success_toast?.on_after_undo?.(
                successful_emails,
              );
              emit_mail_soft_refresh();
            };
          } else if (fixed_undo) {
            on_undo = async () => {
              await apply_archive_batch_for_undo(
                fixed_undo,
                successful_emails.map((e) => e.id),
              );
              await bulk_update_with_metadata(successful_emails, fixed_undo);
              await action_config.success_toast?.on_after_undo?.(
                successful_emails,
              );
              emit_mail_soft_refresh();
            };
          }

          const extra_failed = action_config.extra_failed_ids ?? [];

          show_bulk_result_toast({
            result: bulk_action_result(
              [...ids, ...extra_failed],
              [...failed_ids, ...extra_failed],
            ),
            t,
            success_message: t(
              action_config.success_toast.message_key as TranslationKey,
              { count: successful_ids.length },
            ),
            error_message: action_config.error_message,
            action_type: action_config.success_toast.toast_action_type,
            email_ids: successful_ids,
            ...(on_undo ? { on_undo } : {}),
          });
        }

        return result.success && failed_ids.length === 0;
      } catch {
        if (show_progress) hide_action_toast();
        for (const id of ids) {
          rollback_action(id, action_config.action_type);
        }
        if (!action_config.emit_view_change) {
          for (const email of emails) {
            emit_mail_item_updated({
              id: email.id,
              ...action_config.original_state_extractor(email),
            } as MailItemUpdatedEventDetail);
          }
        }
        action_config.on_full_rollback?.();
        set_action_error(
          action_config.action_type,
          action_config.error_message,
        );

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      config,
      bulk_update_with_metadata,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      set_action_error,
      bulk_abort_ref,
      t,
    ],
  );

  const bulk_star = useCallback(
    async (emails: InboxEmail[], starred: boolean): Promise<boolean> => {
      const emails_changing = emails.filter(
        (e) => e.is_starred !== starred,
      ).length;
      const count_delta = starred ? emails_changing : -emails_changing;

      if (count_delta !== 0) {
        adjust_stats_starred(count_delta);
      }

      return execute_bulk_action(emails, {
        action_type: "star",
        optimistic_update: { is_starred: starred },
        original_state_extractor: (email) => ({
          is_starred: email.is_starred,
        }),
        metadata_update: { is_starred: starred },
        error_message: t("common.failed_to_update_emails"),
        success_toast: {
          message_key: starred
            ? "common.conversations_starred_bulk"
            : "common.conversations_unstarred_bulk",
          toast_action_type: starred ? "star" : "unstar",
        },
        on_partial_failure: (failed_ids) => {
          const failed_changing = emails.filter(
            (e) => failed_ids.includes(e.id) && e.is_starred !== starred,
          ).length;
          const failed_delta = starred ? -failed_changing : failed_changing;

          if (failed_delta !== 0) {
            adjust_stats_starred(failed_delta);
          }
        },
        on_full_rollback: () => {
          if (count_delta !== 0) {
            adjust_stats_starred(-count_delta);
          }
        },
      });
    },
    [execute_bulk_action, t],
  );

  const sync_grouped_siblings = useCallback(
    (emails: InboxEmail[], is_archived: boolean): void => {
      void (async () => {
        try {
          const base_ids = new Set(
            emails.flatMap((email) => [
              email.id,
              ...(email.grouped_email_ids ?? []),
            ]),
          );
          const sibling_ids = emails.flatMap((email) =>
            email.grouped_email_ids && email.grouped_email_ids.length > 1
              ? email.grouped_email_ids.filter((id) => id !== email.id)
              : [],
          );
          const threaded = emails.filter(
            (email) =>
              email.thread_token && (email.thread_message_count ?? 1) > 1,
          );

          for (const email of threaded) {
            try {
              const thread = await get_thread_messages(email.thread_token!);
              const extra = (thread.data?.messages ?? [])
                .filter(
                  (message) =>
                    message.item_type === "received" &&
                    !base_ids.has(message.id),
                )
                .map((message) => message.id);

              sibling_ids.push(...extra);
            } catch (caught) {
              ignore_error("use_bulk_actions:sync_grouped_siblings", caught);
            }
          }

          const unique_ids = Array.from(new Set(sibling_ids));

          if (unique_ids.length === 0) return;
          await bulk_update_metadata_by_ids(unique_ids, { is_archived });
        } catch {
          void 0;
        }
      })();
    },
    [],
  );

  const expand_grouped_ids = useCallback((emails: InboxEmail[]): string[] => {
    return Array.from(
      new Set(
        emails.flatMap((e) =>
          e.grouped_email_ids && e.grouped_email_ids.length > 1
            ? e.grouped_email_ids
            : [e.id],
        ),
      ),
    );
  }, []);

  const split_archive_failures = useCallback(
    (emails: InboxEmail[], failed_ids: string[]) => {
      const failed_set = new Set(failed_ids);
      const is_failed = (email: InboxEmail) =>
        (email.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [email.id]
        ).some((id) => failed_set.has(id));

      return {
        applied: emails.filter((email) => !is_failed(email)),
        failed: emails.filter(is_failed).map((email) => email.id),
      };
    },
    [],
  );

  const bulk_archive = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const batch_result = await run_archive_batch(
        expand_grouped_ids(emails),
        true,
      );
      const archive_split = split_archive_failures(
        emails,
        batch_result.failed_ids,
      );

      if (archive_split.applied.length === 0) {
        set_action_error("archive", t("common.failed_to_archive_emails"));

        return false;
      }

      const ok = await execute_bulk_action(archive_split.applied, {
        action_type: "archive",
        extra_failed_ids: archive_split.failed,
        optimistic_update: {
          is_archived: true,
          is_trashed: false,
          is_spam: false,
        },
        original_state_extractor: (email) => ({
          is_archived: email.is_archived,
          is_trashed: email.is_trashed,
          is_spam: email.is_spam,
        }),
        metadata_update: {
          is_archived: true,
          is_trashed: false,
          is_spam: false,
        },
        remove_from_list: true,
        emit_view_change: true,
        error_message: t("common.failed_to_archive_emails"),
        success_toast: {
          message_key: "common.n_conversations_archived",
          toast_action_type: "archive",
          compute_undo_metadata: (email) => ({
            is_archived: email.is_archived,
            is_trashed: email.is_trashed,
            is_spam: email.is_spam,
          }),
        },
      });

      if (ok) sync_grouped_siblings(archive_split.applied, true);

      return ok && archive_split.failed.length === 0;
    },
    [
      execute_bulk_action,
      sync_grouped_siblings,
      expand_grouped_ids,
      split_archive_failures,
      set_action_error,
      t,
    ],
  );

  const bulk_unarchive = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const batch_result = await run_archive_batch(
        expand_grouped_ids(emails),
        false,
      );
      const restore_split = split_archive_failures(
        emails,
        batch_result.failed_ids,
      );

      if (restore_split.applied.length === 0) {
        set_action_error("restore", t("common.failed_to_move_email"));

        return false;
      }

      const ok = await execute_bulk_action(restore_split.applied, {
        action_type: "restore",
        extra_failed_ids: restore_split.failed,
        optimistic_update: { is_archived: false },
        original_state_extractor: (email) => ({
          is_archived: email.is_archived,
        }),
        metadata_update: { is_archived: false },
        remove_from_list: true,
        emit_view_change: true,
        error_message: t("common.failed_to_move_email"),
        success_toast: {
          message_key: "common.moved_to_inbox_toast",
          toast_action_type: "restore",
          undo_metadata: { is_archived: true },
        },
      });

      if (ok) sync_grouped_siblings(restore_split.applied, false);

      return ok && restore_split.failed.length === 0;
    },
    [
      execute_bulk_action,
      sync_grouped_siblings,
      expand_grouped_ids,
      split_archive_failures,
      set_action_error,
      t,
    ],
  );

  const bulk_delete = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      return execute_bulk_action(emails, {
        action_type: "delete",
        optimistic_update: { is_trashed: true },
        original_state_extractor: (email) => ({
          is_trashed: email.is_trashed,
        }),
        metadata_update: { is_trashed: true },
        remove_from_list: true,
        emit_view_change: true,
        error_message: t("common.failed_to_delete_emails"),
        success_toast: {
          message_key: "common.n_conversations_moved_to_trash",
          toast_action_type: "trash",
          undo_metadata: { is_trashed: false },
        },
      });
    },
    [execute_bulk_action, t],
  );

  const bulk_mark_read = useCallback(
    async (emails: InboxEmail[], is_read: boolean): Promise<boolean> => {
      const action_type: ActionType = is_read ? "read" : "unread";
      const unread_delta = conversation_read_delta(
        emails,
        is_read,
        preferences.conversation_grouping,
      );

      if (unread_delta !== 0) adjust_stats_unread(unread_delta);

      return execute_bulk_action(emails, {
        action_type,
        optimistic_update: { is_read },
        original_state_extractor: (email) => ({
          is_read: email.is_read,
        }),
        metadata_update: { is_read },
        error_message: is_read
          ? t("common.failed_to_mark_as_read")
          : t("common.failed_to_mark_as_unread"),
        success_toast: {
          message_key: is_read
            ? "common.conversations_marked_as_read_bulk"
            : "common.conversations_marked_as_unread_bulk",
          toast_action_type: is_read ? "read" : "unread",
        },
        on_partial_failure: (failed_ids) => {
          const failed_set = new Set(failed_ids);
          const revert_delta = -conversation_read_delta(
            emails.filter((e) => failed_set.has(e.id)),
            is_read,
            preferences.conversation_grouping,
          );

          if (revert_delta !== 0) adjust_stats_unread(revert_delta);
        },
        on_full_rollback: () => {
          if (unread_delta !== 0) adjust_stats_unread(-unread_delta);
        },
        finalize_failed_ids: is_read
          ? async (succeeded_ids) => {
              const succeeded_set = new Set(succeeded_ids);
              const candidates = emails.filter((e) => succeeded_set.has(e.id));
              const thread_result = await mark_conversation_threads_read(
                collect_conversation_thread_tokens(
                  candidates,
                  preferences.conversation_grouping,
                ),
              );
              const failed_tokens = new Set(thread_result.failed_ids);

              return candidates
                .filter(
                  (e) => !!e.thread_token && failed_tokens.has(e.thread_token),
                )
                .map((e) => e.id);
            }
          : undefined,
      });
    },
    [execute_bulk_action, t, preferences.conversation_grouping],
  );

  const bulk_mark_spam = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const result = await execute_bulk_action(emails, {
        action_type: "spam",
        optimistic_update: { is_spam: true, is_trashed: false },
        original_state_extractor: (email) => ({
          is_spam: email.is_spam,
          is_trashed: email.is_trashed,
        }),
        metadata_update: { is_spam: true, is_trashed: false },
        remove_from_list: true,
        emit_view_change: true,
        error_message: t("common.failed_to_mark_as_spam"),
        success_toast: {
          message_key: "common.n_conversations_marked_as_spam",
          toast_action_type: "spam",
          compute_undo_metadata: (email) => ({
            is_spam: email.is_spam,
            is_trashed: email.is_trashed,
          }),
          on_after_undo: (undone) => {
            const undone_senders = new Set(
              undone.map((e) => e.sender_email).filter(Boolean),
            );

            for (const sender of undone_senders) {
              remove_spam_sender(sender).catch((caught) =>
                ignore_error(
                  "hooks/email_actions/use_bulk_actions:use_bulk_actions",
                  caught,
                ),
              );
            }
          },
        },
      });

      if (result) {
        const unique_senders = new Set(
          emails.map((e) => e.sender_email).filter(Boolean),
        );

        for (const sender of unique_senders) {
          report_spam_sender(sender).catch((caught) =>
            ignore_error(
              "hooks/email_actions/use_bulk_actions:use_bulk_actions",
              caught,
            ),
          );
        }
      }

      return result;
    },
    [execute_bulk_action, t],
  );

  const bulk_unmark_spam = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const result = await execute_bulk_action(emails, {
        action_type: "spam",
        optimistic_update: { is_spam: false },
        original_state_extractor: (email) => ({ is_spam: email.is_spam }),
        metadata_update: { is_spam: false },
        remove_from_list: true,
        emit_view_change: true,
        error_message: t("common.failed_to_move_email"),
        success_toast: {
          message_key: "common.conversations_marked_as_not_spam_bulk",
          toast_action_type: "not_spam",
          compute_undo_metadata: (email) => ({ is_spam: email.is_spam }),
        },
      });

      if (result) {
        const unique_senders = new Set(
          emails.map((e) => e.sender_email).filter(Boolean),
        );

        for (const sender of unique_senders) {
          remove_spam_sender(sender).catch((caught) =>
            ignore_error(
              "hooks/email_actions/use_bulk_actions:use_bulk_actions",
              caught,
            ),
          );
        }
      }

      return result;
    },
    [execute_bulk_action, t],
  );

  const bulk_add_folder = useCallback(
    async (emails: InboxEmail[], folder_token: string): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      set_action_loading("label", true);

      const abort_controller = new AbortController();

      bulk_abort_ref.current = abort_controller;

      if (show_progress) {
        show_action_toast({
          message: t("common.processing_count", {
            completed: "0",
            total: ids.length,
          }),
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => abort_controller.abort(),
        });
      }

      try {
        const result = await batched_bulk_add_folder(ids, folder_token, {
          signal: abort_controller.signal,
          on_progress: (completed, total) => {
            if (show_progress) update_progress_toast(completed, total, t);
          },
        });

        if (show_progress) hide_action_toast();

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action(
          "label",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        if (result.was_cancelled) {
          set_action_error("label", t("settings.status_cancelled"));
          show_toast(t("settings.status_cancelled"), "error");

          return false;
        }
        if (result.failed_ids.length > 0) {
          set_action_error("label", t("common.failed_to_add_labels"));
          show_toast(t("common.failed_to_add_labels"), "error");

          return false;
        }
        config.on_success?.("label");

        return result.success;
      } catch (err) {
        if (show_progress) hide_action_toast();
        const error_message = user_facing_error(
          err,
          t("common.failed_to_add_labels"),
        );

        set_action_error("label", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      clear_action_state,
      config.on_success,
      set_action_error,
      bulk_abort_ref,
      t,
    ],
  );

  const bulk_remove_folder = useCallback(
    async (emails: InboxEmail[], folder_token: string): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      set_action_loading("label", true);

      const abort_controller = new AbortController();

      bulk_abort_ref.current = abort_controller;

      if (show_progress) {
        show_action_toast({
          message: t("common.processing_count", {
            completed: "0",
            total: ids.length,
          }),
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => abort_controller.abort(),
        });
      }

      try {
        const result = await batched_bulk_remove_folder(ids, folder_token, {
          signal: abort_controller.signal,
          on_progress: (completed, total) => {
            if (show_progress) update_progress_toast(completed, total, t);
          },
        });

        if (show_progress) hide_action_toast();

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action(
          "label",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        if (result.was_cancelled) {
          set_action_error("label", t("settings.status_cancelled"));
          show_toast(t("settings.status_cancelled"), "error");

          return false;
        }
        if (result.failed_ids.length > 0) {
          set_action_error("label", t("common.failed_to_remove_labels"));
          show_toast(t("common.failed_to_remove_labels"), "error");

          return false;
        }
        config.on_success?.("label");

        return result.success;
      } catch (err) {
        if (show_progress) hide_action_toast();
        const error_message = user_facing_error(
          err,
          t("common.failed_to_remove_labels"),
        );

        set_action_error("label", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      clear_action_state,
      config.on_success,
      set_action_error,
      bulk_abort_ref,
      t,
    ],
  );

  return {
    bulk_star,
    bulk_archive,
    bulk_unarchive,
    bulk_delete,
    bulk_mark_read,
    bulk_mark_spam,
    bulk_unmark_spam,
    bulk_add_folder,
    bulk_remove_folder,
  };
}
