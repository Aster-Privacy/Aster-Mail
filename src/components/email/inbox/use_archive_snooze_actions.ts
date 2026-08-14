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

import { useCallback } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  bulk_succeeded_ids,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import { MAIL_EVENTS, emit_mail_item_updated } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  compute_archive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { get_thread_messages } from "@/services/api/mail";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { ignore_error } from "@/lib/ignore_error";

import {
  remove_ids as remove_index_ids,
  remove_thread_entries,
  reindex_ids,
} from "@/services/category_index";

interface UseArchiveSnoozeActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  get_selected_ids: (emails: InboxEmail[]) => string[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  bulk_archive: (ids: string[]) => Promise<BulkActionResult>;
  bulk_unarchive: (ids: string[]) => Promise<BulkActionResult>;
  bulk_snooze_action: (ids: string[], snooze_until: Date) => Promise<unknown>;
  preferences: {
    confirm_before_archive: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  save_now: () => Promise<void>;
  set_confirmations: React.Dispatch<
    React.SetStateAction<ConfirmationDialogState>
  >;
  dont_ask_archive: boolean;
  set_dont_ask_archive: React.Dispatch<React.SetStateAction<boolean>>;
  pending_archive_email: InboxEmail | null;
  set_pending_archive_email: React.Dispatch<
    React.SetStateAction<InboxEmail | null>
  >;
  set_show_single_archive_confirm: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  dont_ask_single_archive: boolean;
  set_dont_ask_single_archive: React.Dispatch<React.SetStateAction<boolean>>;
}

export function use_archive_snooze_actions({
  t,
  current_view,
  email_state,
  get_selected_ids,
  update_email,
  remove_email,
  bulk_archive,
  bulk_unarchive,
  bulk_snooze_action,
  preferences,
  update_preference,
  save_now,
  set_confirmations,
  dont_ask_archive,
  set_dont_ask_archive,
  pending_archive_email,
  set_pending_archive_email,
  set_show_single_archive_confirm,
  dont_ask_single_archive,
  set_dont_ask_single_archive,
}: UseArchiveSnoozeActionsOptions) {
  const run_bulk_archive = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;
      const result = await bulk_archive(ids);

      show_bulk_result_toast({
        result,
        t,
        success_message: t("common.n_conversations_archived", {
          count: bulk_succeeded_ids(result).length,
        }),
        error_message: t("common.failed_to_archive_emails"),
        action_type: "archive",
      });
    },
    [bulk_archive, t],
  );

  const handle_toolbar_archive = useCallback(async (): Promise<void> => {
    if (!preferences.confirm_before_archive) {
      await run_bulk_archive(get_selected_ids(email_state.emails));
    } else {
      set_confirmations((prev) => ({ ...prev, show_archive: true }));
    }
  }, [
    preferences.confirm_before_archive,
    get_selected_ids,
    email_state.emails,
    run_bulk_archive,
    set_confirmations,
  ]);

  const handle_toolbar_unarchive = useCallback(async (): Promise<void> => {
    const ids = get_selected_ids(email_state.emails);

    if (ids.length === 0) return;
    const result = await bulk_unarchive(ids);

    show_bulk_result_toast({
      result,
      t,
      success_message: t("common.conversations_moved_to_inbox_bulk", {
        count: bulk_succeeded_ids(result).length,
      }),
      error_message: t("common.failed_to_unarchive_emails"),
      action_type: "archive",
    });
  }, [get_selected_ids, email_state.emails, bulk_unarchive, t]);

  const confirm_archive = useCallback(async (): Promise<void> => {
    if (dont_ask_archive) {
      update_preference("confirm_before_archive", false, true);
    }
    await run_bulk_archive(get_selected_ids(email_state.emails));
    set_confirmations((prev) => ({ ...prev, show_archive: false }));
    set_dont_ask_archive(false);
  }, [
    dont_ask_archive,
    get_selected_ids,
    email_state.emails,
    run_bulk_archive,
    update_preference,
    save_now,
    set_confirmations,
    set_dont_ask_archive,
  ]);

  const cancel_archive = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_archive: false }));
    set_dont_ask_archive(false);
  }, [set_confirmations, set_dont_ask_archive]);

  const confirm_single_archive = useCallback(async (): Promise<void> => {
    if (!pending_archive_email) return;
    if (dont_ask_single_archive) {
      update_preference("confirm_before_archive", false, true);
    }
    const email = pending_archive_email;
    const deltas = compute_archive_deltas(email);
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    remove_email(email.id);
    remove_index_ids(all_ids);

    const removed_thread_ids = email.thread_token
      ? remove_thread_entries(email.thread_token)
      : [];

    // Resolve every message of a grouped conversation up front so the archive
    // and its Undo both operate on the same complete id set. Otherwise Undo
    // restores only the visible message and leaves the siblings archived.
    let archive_ids = [...all_ids];

    if (email.thread_token && (email.thread_message_count ?? 1) > 1) {
      try {
        const thread = await get_thread_messages(email.thread_token);
        const sibling_ids = (thread.data?.messages ?? [])
          .filter(
            (message) =>
              message.item_type === "received" &&
              !all_ids.includes(message.id),
          )
          .map((message) => message.id);

        archive_ids = Array.from(new Set([...all_ids, ...sibling_ids]));
      } catch {
        archive_ids = [...all_ids];
      }
    }

    apply_stat_deltas(deltas);
    const result = await batch_archive({ ids: archive_ids, tier: "hot" });

    if (result.data?.success) {
      void bulk_update_metadata_by_ids(archive_ids, {
        is_archived: true,
      }).catch((caught) => ignore_error("components/email/inbox/use_archive_snooze_actions:use_archive_snooze_actions", caught));
      for (const id of archive_ids) {
        emit_mail_item_updated({ id, is_archived: true });
      }
      invalidate_mail_stats();
      show_action_toast({
        message: t("common.conversation_archived"),
        action_type: "archive",
        email_ids: all_ids,
        on_undo: async () => {
          revert_stat_deltas(deltas);
          const undo_result = await batch_unarchive({ ids: archive_ids });

          if (undo_result.error || !undo_result.data?.success) {
            reindex_ids(
              Array.from(new Set([...archive_ids, ...removed_thread_ids])),
            );
            throw new Error("undo unarchive failed");
          }
          try {
            await bulk_update_metadata_by_ids(archive_ids, {
              is_archived: false,
            });
          } catch {
            void 0;
          }
          reindex_ids(Array.from(new Set([...archive_ids, ...removed_thread_ids])));
          for (const id of archive_ids) {
            emit_mail_item_updated({ id, is_archived: false });
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      reindex_ids(Array.from(new Set([...archive_ids, ...removed_thread_ids])));
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      show_toast(t("common.failed_to_archive_emails"), "error");
    }
    set_show_single_archive_confirm(false);
    set_pending_archive_email(null);
    set_dont_ask_single_archive(false);
  }, [
    pending_archive_email,
    dont_ask_single_archive,
    remove_email,
    update_preference,
    save_now,
    set_show_single_archive_confirm,
    set_pending_archive_email,
    set_dont_ask_single_archive,
  ]);

  const cancel_single_archive = useCallback((): void => {
    set_show_single_archive_confirm(false);
    set_pending_archive_email(null);
    set_dont_ask_single_archive(false);
  }, [
    set_show_single_archive_confirm,
    set_pending_archive_email,
    set_dont_ask_single_archive,
  ]);

  const handle_toolbar_snooze = useCallback(
    async (snooze_until: Date): Promise<void> => {
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;
      const snooze_iso = snooze_until.toISOString();
      const ids = selected.map((e) => e.id);

      for (const email of selected) {
        update_email(email.id, {
          snoozed_until: snooze_iso,
          is_selected: false,
        });
      }
      try {
        await bulk_snooze_action(ids, snooze_until);
        if (current_view !== "snoozed") {
          for (const id of ids) {
            remove_email(id);
          }
        }
        for (const id of ids) {
          emit_mail_item_updated({ id, snoozed_until: snooze_iso });
        }
        remove_index_ids(ids);
        show_action_toast({
          message: t("common.conversations_snoozed_bulk", {
            count: selected.length,
          }),
          action_type: "snooze",
          email_ids: ids,
        });
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        for (const email of selected) {
          update_email(email.id, {
            snoozed_until: email.snoozed_until,
            is_selected: true,
          });
        }
        show_toast(t("common.failed_to_snooze_conversations"), "error");
      }
    },
    [
      email_state.emails,
      current_view,
      bulk_snooze_action,
      update_email,
      remove_email,
    ],
  );

  return {
    handle_toolbar_archive,
    handle_toolbar_unarchive,
    confirm_archive,
    cancel_archive,
    confirm_single_archive,
    cancel_single_archive,
    handle_toolbar_snooze,
  };
}
