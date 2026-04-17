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

import { useCallback } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { MAIL_EVENTS, emit_mail_items_removed } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { adjust_trash_count } from "@/hooks/use_mail_counts";
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
  trash_thread,
} from "@/services/api/mail";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";

interface UseDeleteActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  get_selected_ids: (emails: InboxEmail[]) => string[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  bulk_delete: (ids: string[]) => Promise<void>;
  schedule_delete_drafts: (ids: string[]) => () => void;
  preferences: {
    confirm_before_delete: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => void;
  save_now: () => Promise<void>;
  is_drafts_view: boolean;
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

export function use_delete_actions({
  t,
  current_view,
  email_state,
  get_selected_ids,
  update_email,
  remove_email,
  bulk_delete,
  schedule_delete_drafts,
  preferences,
  update_preference,
  save_now,
  is_drafts_view,
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
  const handle_toolbar_delete = useCallback(async (): Promise<void> => {
    const is_trash_view = current_view === "trash";

    if (!preferences.confirm_before_delete) {
      const ids = get_selected_ids(email_state.emails);

      if (is_trash_view) {
        const selected_emails = email_state.emails.filter((e) =>
          ids.includes(e.id),
        );
        const expanded_ids = Array.from(
          new Set(
            selected_emails.flatMap((e) =>
              e.grouped_email_ids && e.grouped_email_ids.length > 1
                ? e.grouped_email_ids
                : [e.id],
            ),
          ),
        );

        for (const id of ids) {
          remove_email(id);
        }
        const result = await batched_bulk_permanent_delete(expanded_ids);

        if (result.success) {
          adjust_trash_count(-expanded_ids.length);
          invalidate_mail_stats();
          show_action_toast({
            message: t("common.emails_permanently_deleted", {
              count: expanded_ids.length,
            }),
            action_type: "trash",
            email_ids: expanded_ids,
          });
        } else {
          for (const email of selected_emails) {
            update_email(email.id, email);
          }
        }
      } else if (is_drafts_view) {
        const undo = schedule_delete_drafts(ids);

        show_action_toast({
          message: t("common.drafts_deleted", { count: ids.length }),
          action_type: "trash",
          email_ids: ids,
          on_undo: async () => {
            undo();
          },
        });
      } else {
        const selected_emails = email_state.emails.filter((e) =>
          ids.includes(e.id),
        );
        const expanded_ids = Array.from(
          new Set(
            selected_emails.flatMap((e) =>
              e.grouped_email_ids && e.grouped_email_ids.length > 1
                ? e.grouped_email_ids
                : [e.id],
            ),
          ),
        );

        await bulk_delete(ids);
        show_action_toast({
          message: t("common.emails_moved_to_trash", { count: ids.length }),
          action_type: "trash",
          email_ids: ids,
          on_undo: async () => {
            await bulk_update_metadata_by_ids(expanded_ids, {
              is_trashed: false,
            });
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      }
    } else {
      set_confirmations((prev) => ({ ...prev, show_delete: true }));
    }
  }, [
    preferences.confirm_before_delete,
    get_selected_ids,
    email_state.emails,
    bulk_delete,
    schedule_delete_drafts,
    is_drafts_view,
    current_view,
    remove_email,
    update_email,
    t,
    set_confirmations,
  ]);

  const confirm_delete = useCallback(async (): Promise<void> => {
    if (dont_ask_delete) {
      update_preference("confirm_before_delete", false);
      await save_now();
    }
    const ids = get_selected_ids(email_state.emails);
    const is_trash_view = current_view === "trash";

    if (is_trash_view) {
      const selected_emails = email_state.emails.filter((e) =>
        ids.includes(e.id),
      );
      const expanded_ids = Array.from(
        new Set(
          selected_emails.flatMap((e) =>
            e.grouped_email_ids && e.grouped_email_ids.length > 1
              ? e.grouped_email_ids
              : [e.id],
          ),
        ),
      );

      for (const id of ids) {
        remove_email(id);
      }
      const result = await batched_bulk_permanent_delete(expanded_ids);

      if (result.success) {
        adjust_trash_count(-expanded_ids.length);
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.emails_permanently_deleted", {
            count: expanded_ids.length,
          }),
          action_type: "trash",
          email_ids: expanded_ids,
        });
      } else {
        for (const email of selected_emails) {
          update_email(email.id, email);
        }
      }
    } else if (is_drafts_view) {
      const undo = schedule_delete_drafts(ids);

      show_action_toast({
        message: t("common.drafts_deleted", { count: ids.length }),
        action_type: "trash",
        email_ids: ids,
        on_undo: async () => {
          undo();
        },
      });
    } else {
      const selected_emails = email_state.emails.filter((e) =>
        ids.includes(e.id),
      );
      const expanded_ids = Array.from(
        new Set(
          selected_emails.flatMap((e) =>
            e.grouped_email_ids && e.grouped_email_ids.length > 1
              ? e.grouped_email_ids
              : [e.id],
          ),
        ),
      );

      await bulk_delete(ids);
      show_action_toast({
        message: t("common.emails_moved_to_trash", { count: ids.length }),
        action_type: "trash",
        email_ids: ids,
        on_undo: async () => {
          await bulk_update_metadata_by_ids(expanded_ids, {
            is_trashed: false,
          });
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    }
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, [
    dont_ask_delete,
    get_selected_ids,
    email_state.emails,
    bulk_delete,
    schedule_delete_drafts,
    is_drafts_view,
    current_view,
    remove_email,
    update_email,
    update_preference,
    save_now,
    t,
    set_confirmations,
    set_dont_ask_delete,
  ]);

  const cancel_delete = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, [set_confirmations, set_dont_ask_delete]);

  const confirm_single_delete = useCallback(async (): Promise<void> => {
    if (!pending_delete_email) return;
    if (dont_ask_single_delete) {
      update_preference("confirm_before_delete", false);
      await save_now();
    }
    const email = pending_delete_email;
    const is_trash_view = current_view === "trash";

    if (is_trash_view) {
      remove_email(email.id);
      const result = await permanent_delete_mail_item(email.id);

      if (result.data) {
        adjust_trash_count(-1);
        invalidate_mail_stats();
        emit_mail_items_removed({ ids: [email.id] });
        show_action_toast({
          message: t("common.email_permanently_deleted"),
          action_type: "trash",
          email_ids: [email.id],
        });
      } else {
        update_email(email.id, email);
      }
    } else if (is_drafts_view) {
      const undo = schedule_delete_drafts([email.id]);

      show_action_toast({
        message: t("common.draft_deleted"),
        action_type: "trash",
        email_ids: [email.id],
        on_undo: async () => {
          undo();
        },
      });
    } else {
      const deltas = compute_trash_deltas(email);

      remove_email(email.id);
      apply_stat_deltas(deltas);

      if (email.thread_token) {
        const result = await trash_thread(email.thread_token, true);

        if (result.data) {
          show_action_toast({
            message: t("common.conversation_moved_to_trash"),
            action_type: "trash",
            email_ids: [email.id],
            on_undo: async () => {
              revert_stat_deltas(deltas);
              await trash_thread(email.thread_token!, false);
              window.dispatchEvent(
                new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
              );
            },
          });
        }
      } else {
        const all_ids =
          email.grouped_email_ids && email.grouped_email_ids.length > 1
            ? email.grouped_email_ids
            : [email.id];
        const result = await bulk_update_metadata_by_ids(all_ids, {
          is_trashed: true,
        });

        if (result.success) {
          show_action_toast({
            message: t("common.conversation_moved_to_trash"),
            action_type: "trash",
            email_ids: all_ids,
            on_undo: async () => {
              revert_stat_deltas(deltas);
              await bulk_update_metadata_by_ids(all_ids, { is_trashed: false });
              window.dispatchEvent(
                new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
              );
            },
          });
        }
      }
    }
    set_show_single_delete_confirm(false);
    set_pending_delete_email(null);
    set_dont_ask_single_delete(false);
  }, [
    pending_delete_email,
    dont_ask_single_delete,
    current_view,
    remove_email,
    is_drafts_view,
    schedule_delete_drafts,
    update_preference,
    save_now,
    t,
    update_email,
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
        const trash_count = email_state.emails.length;

        for (const email of email_state.emails) {
          remove_email(email.id);
        }
        request_cache.invalidate("/mail/v1/messages");
        invalidate_mail_cache("trash");
        invalidate_mail_cache("all");
        invalidate_mail_cache("starred");
        adjust_trash_count(-trash_count);
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

  return {
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
