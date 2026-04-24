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
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  compute_archive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";

interface UseArchiveSnoozeActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  get_selected_ids: (emails: InboxEmail[]) => string[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  bulk_archive: (ids: string[]) => Promise<void>;
  bulk_unarchive: (ids: string[]) => Promise<void>;
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
  const handle_toolbar_archive = useCallback((): void => {
    if (!preferences.confirm_before_archive) {
      const ids = get_selected_ids(email_state.emails);

      bulk_archive(ids);
    } else {
      set_confirmations((prev) => ({ ...prev, show_archive: true }));
    }
  }, [
    preferences.confirm_before_archive,
    get_selected_ids,
    email_state.emails,
    bulk_archive,
    set_confirmations,
  ]);

  const handle_toolbar_unarchive = useCallback((): void => {
    const ids = get_selected_ids(email_state.emails);

    bulk_unarchive(ids);
  }, [get_selected_ids, email_state.emails, bulk_unarchive]);

  const confirm_archive = useCallback(async (): Promise<void> => {
    if (dont_ask_archive) {
      update_preference("confirm_before_archive", false, true);
    }
    const ids = get_selected_ids(email_state.emails);

    await bulk_archive(ids);
    set_confirmations((prev) => ({ ...prev, show_archive: false }));
    set_dont_ask_archive(false);
  }, [
    dont_ask_archive,
    get_selected_ids,
    email_state.emails,
    bulk_archive,
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
    apply_stat_deltas(deltas);
    const result = await batch_archive({ ids: all_ids, tier: "hot" });

    if (result.data?.success) {
      invalidate_mail_cache();
      invalidate_mail_stats();
      show_action_toast({
        message: t("common.conversation_archived"),
        action_type: "archive",
        email_ids: all_ids,
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await batch_unarchive({ ids: all_ids });
          invalidate_mail_cache();
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
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
    [email_state.emails, bulk_snooze_action, update_email],
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
