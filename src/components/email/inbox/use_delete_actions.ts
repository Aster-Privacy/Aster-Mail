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
import type { UserPreferences } from "@/services/api/preferences";
import type { InboxEmail, ConfirmationDialogState } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";
import type { BulkActionResult } from "@/hooks/bulk_action_result";
import type { RestoredEmailEntry } from "@/hooks/email_list_helpers";
import type { BulkDeleteOptions } from "@/hooks/email_list_types";

import { useCallback, useMemo } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  bulk_action_result,
  bulk_succeeded_ids,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import {
  collect_restore_entries,
  expand_email_ids,
  trashes_whole_thread,
} from "@/hooks/email_list_helpers";
import { begin_list_removal } from "@/hooks/list_removal";
import { MAIL_EVENTS, emit_mail_items_removed } from "@/hooks/mail_events";
import {
  invalidate_mail_stats,
  adjust_stats_trash,
  clear_stats_trash,
} from "@/hooks/use_mail_stats";
import { request_cache } from "@/services/api/request_cache";
import {
  compute_trash_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import {
  permanent_delete_mail_item,
  batched_bulk_permanent_delete,
  empty_trash,
} from "@/services/api/mail";
import {
  set_thread_trashed,
  set_threads_trashed,
} from "@/services/trash_state";
import { is_list_email_in_trash } from "@/components/email/viewer_shared/trash_placement";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import {
  invalidate_mail_cache,
  remove_email_from_view_cache,
} from "@/hooks/email_list_cache";

interface UseDeleteActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  get_selected_ids: (emails: InboxEmail[]) => string[];
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  restore_emails: (entries: RestoredEmailEntry[]) => void;
  bulk_delete: (
    ids: string[],
    options?: BulkDeleteOptions,
  ) => Promise<BulkActionResult>;
  schedule_delete_drafts: (ids: string[]) => () => void;
  cancel_scheduled: (id: string) => Promise<boolean>;
  bulk_cancel_scheduled: (ids: string[]) => Promise<boolean>;
  preferences: {
    confirm_before_delete: boolean;
    confirm_before_permanent_delete?: boolean;
    conversation_grouping?: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  save_now: () => Promise<void>;
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
  set_confirmations: React.Dispatch<
    React.SetStateAction<ConfirmationDialogState>
  >;
  dont_ask_delete: boolean;
  set_dont_ask_delete: React.Dispatch<React.SetStateAction<boolean>>;
  pending_delete_email: InboxEmail | null;
  set_pending_delete_email: React.Dispatch<
    React.SetStateAction<InboxEmail | null>
  >;
  set_show_single_delete_confirm: React.Dispatch<React.SetStateAction<boolean>>;
  dont_ask_single_delete: boolean;
  set_dont_ask_single_delete: React.Dispatch<React.SetStateAction<boolean>>;
  set_show_empty_trash_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  set_is_emptying_trash: React.Dispatch<React.SetStateAction<boolean>>;
}

export function delete_choice_preference(
  has_trashed: boolean,
  confirm_before_permanent_delete: boolean | undefined,
): "confirm_before_delete" | "confirm_before_permanent_delete" {
  return has_trashed && confirm_before_permanent_delete !== false
    ? "confirm_before_permanent_delete"
    : "confirm_before_delete";
}

export function use_delete_actions({
  t,
  current_view,
  email_state,
  get_selected_ids,
  remove_email,
  remove_emails,
  restore_emails,
  bulk_delete,
  schedule_delete_drafts,
  cancel_scheduled,
  bulk_cancel_scheduled,
  preferences,
  update_preference,
  save_now,
  is_drafts_view,
  is_scheduled_view,
  set_confirmations,
  dont_ask_delete,
  set_dont_ask_delete,
  pending_delete_email,
  set_pending_delete_email,
  set_show_single_delete_confirm,
  dont_ask_single_delete,
  set_dont_ask_single_delete,
  set_show_empty_trash_dialog,
  set_is_emptying_trash,
}: UseDeleteActionsOptions) {
  const is_trash_view = current_view === "trash";
  const removal_target = useMemo(
    () => ({ remove_emails, restore_emails }),
    [remove_emails, restore_emails],
  );

  const split_by_trash = useCallback(
    (ids: string[]): { trashed: string[]; untrashed: string[] } => {
      const by_id = new Map(email_state.emails.map((e) => [e.id, e]));
      const trashed: string[] = [];
      const untrashed: string[] = [];

      for (const id of ids) {
        const email = by_id.get(id);
        const in_trash = email
          ? is_list_email_in_trash(email, current_view)
          : is_trash_view;

        (in_trash ? trashed : untrashed).push(id);
      }

      return { trashed, untrashed };
    },
    [email_state.emails, current_view, is_trash_view],
  );

  const expand_trashed_ids = useCallback(
    (email: InboxEmail): string[] =>
      is_trash_view ? expand_email_ids(email) : [email.id],
    [is_trash_view],
  );

  const run_permanent_delete = useCallback(
    async (ids: string[]): Promise<void> => {
      const selected_emails = collect_restore_entries(
        email_state.emails,
        ids,
      ).map((entry) => entry.email);
      const expanded_ids = Array.from(
        new Set(selected_emails.flatMap(expand_trashed_ids)),
      );
      const removal = begin_list_removal(
        email_state.emails,
        ids,
        removal_target,
      );

      for (const eid of expanded_ids) {
        remove_email_from_view_cache(eid);
      }
      let failed_message_ids: Set<string>;

      try {
        const result = await batched_bulk_permanent_delete(expanded_ids);

        failed_message_ids = new Set(result.failed_ids);
      } catch {
        failed_message_ids = new Set(expanded_ids);
      }
      const failed_emails = selected_emails.filter((e) =>
        expand_trashed_ids(e).some((id) => failed_message_ids.has(id)),
      );
      const deleted_count = expanded_ids.length - failed_message_ids.size;

      removal.settle(failed_emails.map((e) => e.id));
      if (deleted_count > 0) {
        adjust_stats_trash(-deleted_count);
      }
      if (failed_emails.length > 0) {
        invalidate_mail_stats();
      }
      show_bulk_result_toast({
        result: bulk_action_result(
          ids,
          failed_emails.map((e) => e.id),
        ),
        t,
        success_message: t("common.emails_permanently_deleted", {
          count: deleted_count,
        }),
        error_message: t("common.failed_to_permanently_delete"),
        action_type: "trash",
        email_ids: expanded_ids,
      });
    },
    [email_state.emails, expand_trashed_ids, removal_target, t],
  );

  const is_threaded_email = useCallback(
    (email: InboxEmail): boolean =>
      trashes_whole_thread(email, preferences.conversation_grouping),
    [preferences.conversation_grouping],
  );

  const run_move_to_trash = useCallback(
    async (ids: string[]): Promise<void> => {
      const selected_emails = email_state.emails.filter((e) =>
        ids.includes(e.id),
      );
      const result = await bulk_delete(ids, {
        conversation_grouping: preferences.conversation_grouping,
      });
      const succeeded_ids = bulk_succeeded_ids(result);
      const succeeded_set = new Set(succeeded_ids);
      const succeeded_emails = selected_emails.filter((e) =>
        succeeded_set.has(e.id),
      );
      const undo_thread_tokens = Array.from(
        new Set(
          succeeded_emails
            .filter((e) => is_threaded_email(e))
            .map((e) => e.thread_token as string),
        ),
      );
      const undo_ids = Array.from(
        new Set(
          succeeded_emails
            .filter((e) => !is_threaded_email(e))
            .flatMap(expand_email_ids),
        ),
      );

      show_bulk_result_toast({
        result,
        t,
        success_message: t("common.emails_moved_to_trash", {
          count: succeeded_ids.length,
        }),
        error_message: t("common.failed_to_delete_emails"),
        action_type: "trash",
        email_ids: succeeded_ids,
        on_undo: async () => {
          result.removal?.undo();
          try {
            const thread_result = await set_threads_trashed(
              undo_thread_tokens.map((token) => ({
                thread_token: token,
                known_ids: succeeded_emails
                  .filter((e) => e.thread_token === token)
                  .flatMap(expand_email_ids),
              })),
              false,
            );
            const undo_result =
              undo_ids.length > 0
                ? await bulk_update_metadata_by_ids(undo_ids, {
                    is_trashed: false,
                  })
                : { success: true };

            if (
              !undo_result.success ||
              thread_result.failed_tokens.length > 0
            ) {
              throw new Error("undo trash failed");
            }
          } catch (error) {
            result.removal?.redo();
            throw error;
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    },
    [
      email_state.emails,
      bulk_delete,
      is_threaded_email,
      preferences.conversation_grouping,
      t,
    ],
  );

  const run_cancel_scheduled = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;

      const success =
        ids.length === 1
          ? await cancel_scheduled(ids[0])
          : await bulk_cancel_scheduled(ids);

      if (success) {
        show_action_toast({
          message: t("common.scheduled_email_cancelled"),
          action_type: "trash",
          email_ids: ids,
        });
      } else {
        show_toast(
          t(
            ids.length === 1
              ? "common.scheduled_cancel_failed"
              : "common.scheduled_cancel_partial",
          ),
          "error",
        );
      }
    },
    [cancel_scheduled, bulk_cancel_scheduled, t],
  );

  const run_delete_drafts = useCallback(
    (ids: string[]): void => {
      schedule_delete_drafts(ids);

      show_action_toast({
        message: t("common.drafts_deleted", { count: ids.length }),
        action_type: "trash",
        email_ids: ids,
      });
    },
    [schedule_delete_drafts, t],
  );

  const handle_toolbar_delete = useCallback(async (): Promise<void> => {
    const ids = get_selected_ids(email_state.emails);
    const { trashed, untrashed } =
      is_drafts_view || is_scheduled_view
        ? { trashed: [], untrashed: ids }
        : split_by_trash(ids);
    const asks_before_permanent =
      trashed.length > 0 &&
      preferences.confirm_before_permanent_delete !== false;
    const asks_before_trash =
      untrashed.length > 0 && preferences.confirm_before_delete;

    if (asks_before_permanent || asks_before_trash || is_drafts_view) {
      set_confirmations((prev) => ({ ...prev, show_delete: true }));

      return;
    }

    if (is_scheduled_view) {
      await run_cancel_scheduled(ids);

      return;
    }

    if (trashed.length > 0) await run_permanent_delete(trashed);
    if (untrashed.length > 0) await run_move_to_trash(untrashed);
  }, [
    preferences.confirm_before_delete,
    preferences.confirm_before_permanent_delete,
    run_permanent_delete,
    get_selected_ids,
    email_state.emails,
    run_move_to_trash,
    run_delete_drafts,
    run_cancel_scheduled,
    is_drafts_view,
    is_scheduled_view,
    split_by_trash,
    set_confirmations,
  ]);

  const confirm_delete = useCallback(async (): Promise<void> => {
    const ids = get_selected_ids(email_state.emails);

    if (dont_ask_delete && !is_drafts_view) {
      const has_trashed =
        !is_scheduled_view && split_by_trash(ids).trashed.length > 0;

      update_preference(
        delete_choice_preference(
          has_trashed,
          preferences.confirm_before_permanent_delete,
        ),
        false,
        true,
      );
    }

    if (is_drafts_view) {
      run_delete_drafts(ids);
    } else if (is_scheduled_view) {
      await run_cancel_scheduled(ids);
    } else {
      const { trashed, untrashed } = split_by_trash(ids);

      if (trashed.length > 0) await run_permanent_delete(trashed);
      if (untrashed.length > 0) await run_move_to_trash(untrashed);
    }
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, [
    dont_ask_delete,
    preferences.confirm_before_permanent_delete,
    get_selected_ids,
    email_state.emails,
    run_permanent_delete,
    run_move_to_trash,
    run_delete_drafts,
    run_cancel_scheduled,
    is_drafts_view,
    is_scheduled_view,
    split_by_trash,
    update_preference,
    save_now,
    set_confirmations,
    set_dont_ask_delete,
  ]);

  const cancel_delete = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, [set_confirmations, set_dont_ask_delete]);

  const confirm_single_delete = useCallback(async (): Promise<void> => {
    if (!pending_delete_email) return;
    const email = pending_delete_email;

    if (dont_ask_single_delete) {
      const is_permanent =
        !is_drafts_view &&
        !is_scheduled_view &&
        is_list_email_in_trash(email, current_view);

      update_preference(
        delete_choice_preference(
          is_permanent,
          preferences.confirm_before_permanent_delete,
        ),
        false,
        true,
      );
    }

    if (
      !is_drafts_view &&
      !is_scheduled_view &&
      is_list_email_in_trash(email, current_view)
    ) {
      const removal = begin_list_removal(
        email_state.emails,
        [email.id],
        removal_target,
      );

      remove_email_from_view_cache(email.id);
      const deleted = await permanent_delete_mail_item(email.id)
        .then((result) => !!result.data)
        .catch(() => false);

      removal.settle(deleted ? [] : [email.id]);
      if (deleted) {
        adjust_stats_trash(-1);
        emit_mail_items_removed({ ids: [email.id] });
        show_action_toast({
          message: t("common.email_permanently_deleted"),
          action_type: "trash",
          email_ids: [email.id],
        });
      } else {
        invalidate_mail_stats();
        show_toast(t("common.failed_to_permanently_delete"), "error");
      }
    } else if (is_drafts_view) {
      schedule_delete_drafts([email.id]);

      show_action_toast({
        message: t("common.draft_deleted"),
        action_type: "trash",
        email_ids: [email.id],
      });
    } else if (is_scheduled_view) {
      await run_cancel_scheduled([email.id]);
    } else {
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

      const removal = begin_list_removal(
        email_state.emails,
        grouped_ids.length > 1 ? grouped_ids : [email.id],
        removal_target,
      );
      const set_trashed = (is_trashed: boolean): Promise<boolean> =>
        (thread_scope_token
          ? set_thread_trashed(
              thread_scope_token,
              grouped_ids,
              is_trashed,
            ).then((result) => !!result.data)
          : bulk_update_metadata_by_ids(grouped_ids, { is_trashed }).then(
              (result) => result.success,
            )
        ).catch(() => false);

      apply_stat_deltas(deltas);

      const trashed = await set_trashed(true);

      removal.settle(trashed ? [] : removal.ids);
      if (trashed) {
        show_action_toast({
          message:
            thread_scope_token || grouped_ids.length > 1
              ? t("common.conversation_moved_to_trash")
              : t("common.message_moved_to_trash"),
          action_type: "trash",
          email_ids: grouped_ids,
          on_undo: async () => {
            removal.undo();
            revert_stat_deltas(deltas);
            if (!(await set_trashed(false))) {
              removal.redo();
              apply_stat_deltas(deltas);
              throw new Error("undo trash failed");
            }
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
        if (thread_scope_token) {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        }
      } else {
        revert_stat_deltas(deltas);
        show_toast(t("common.failed_to_delete_emails"), "error");
      }
    }
    set_show_single_delete_confirm(false);
    set_pending_delete_email(null);
    set_dont_ask_single_delete(false);
  }, [
    pending_delete_email,
    dont_ask_single_delete,
    preferences.confirm_before_permanent_delete,
    current_view,
    email_state.emails,
    removal_target,
    is_drafts_view,
    is_scheduled_view,
    schedule_delete_drafts,
    run_cancel_scheduled,
    update_preference,
    preferences.conversation_grouping,
    save_now,
    t,
    set_show_single_delete_confirm,
    set_pending_delete_email,
    set_dont_ask_single_delete,
  ]);

  const cancel_single_delete = useCallback((): void => {
    set_show_single_delete_confirm(false);
    set_pending_delete_email(null);
    set_dont_ask_single_delete(false);
  }, [
    set_show_single_delete_confirm,
    set_pending_delete_email,
    set_dont_ask_single_delete,
  ]);

  const handle_empty_trash = useCallback((): void => {
    set_show_empty_trash_dialog(true);
  }, [set_show_empty_trash_dialog]);

  const confirm_empty_trash = useCallback(async (): Promise<void> => {
    set_is_emptying_trash(true);
    try {
      const result = await empty_trash();

      if (result.data?.success) {
        const removed_ids = email_state.emails.map((e) => e.id);

        for (const email of email_state.emails) {
          remove_email(email.id);
        }
        request_cache.invalidate("/mail/v1/messages");
        invalidate_mail_cache("trash");
        invalidate_mail_cache("all");
        invalidate_mail_cache("starred");
        clear_stats_trash();
        emit_mail_items_removed({ ids: removed_ids });
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.trash_emptied"),
          action_type: "trash",
          email_ids: [],
        });
      } else {
        request_cache.invalidate("/mail/v1/messages");
        invalidate_mail_cache("trash");
        invalidate_mail_stats();
        show_toast(t("common.trash_empty_failed"), "error");
      }
    } catch {
      request_cache.invalidate("/mail/v1/messages");
      invalidate_mail_cache("trash");
      invalidate_mail_stats();
      show_toast(t("common.trash_empty_failed"), "error");
    } finally {
      set_is_emptying_trash(false);
      set_show_empty_trash_dialog(false);
    }
  }, [
    email_state.emails,
    remove_email,
    t,
    set_is_emptying_trash,
    set_show_empty_trash_dialog,
  ]);

  const cancel_empty_trash = useCallback((): void => {
    set_show_empty_trash_dialog(false);
  }, [set_show_empty_trash_dialog]);

  const selection_has_trashed =
    !is_drafts_view &&
    !is_scheduled_view &&
    split_by_trash(get_selected_ids(email_state.emails)).trashed.length > 0;
  const pending_delete_is_permanent =
    !!pending_delete_email &&
    !is_drafts_view &&
    !is_scheduled_view &&
    is_list_email_in_trash(pending_delete_email, current_view);

  return {
    selection_has_trashed,
    pending_delete_is_permanent,
    handle_toolbar_delete,
    confirm_delete,
    cancel_delete,
    confirm_single_delete,
    cancel_single_delete,
    handle_empty_trash,
    confirm_empty_trash,
    cancel_empty_trash,
  };
}
