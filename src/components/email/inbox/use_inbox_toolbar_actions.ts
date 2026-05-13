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

import { useState, useCallback } from "react";

import { use_delete_actions } from "./use_delete_actions";
import { use_folder_tag_actions } from "./use_folder_tag_actions";
import { use_archive_snooze_actions } from "./use_archive_snooze_actions";

import { show_action_toast, update_progress_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { MAIL_EVENTS, emit_mail_item_updated } from "@/hooks/mail_events";
import {
  adjust_unread_count,
  adjust_starred_count,
} from "@/hooks/use_mail_counts";
import {
  compute_removal_deltas,
  compute_restore_deltas,
  compute_untrash_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import {
  update_item_metadata,
  bulk_update_metadata_by_ids,
} from "@/services/crypto/mail_metadata";
import {
  batched_bulk_permanent_delete,
  report_spam_sender,
  remove_spam_sender,
  trash_thread,
} from "@/services/api/mail";

interface UseInboxToolbarActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  get_selected_ids: (emails: InboxEmail[]) => string[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  bulk_delete: (ids: string[]) => Promise<void>;
  schedule_delete_drafts: (ids: string[]) => () => void;
  bulk_archive: (ids: string[]) => Promise<void>;
  bulk_unarchive: (ids: string[]) => Promise<void>;
  bulk_snooze_action: (ids: string[], snooze_until: Date) => Promise<unknown>;
  folders_lookup: Map<string, { name: string; color?: string }>;
  tags_lookup: Map<string, { name: string; color?: string; icon?: string }>;
  preferences: {
    confirm_before_delete: boolean;
    confirm_before_spam: boolean;
    confirm_before_archive: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  save_now: () => Promise<void>;
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
}

export function use_inbox_toolbar_actions({
  t,
  current_view,
  email_state,
  get_selected_ids,
  update_email,
  remove_email,
  remove_emails,
  bulk_delete,
  schedule_delete_drafts,
  bulk_archive,
  bulk_unarchive,
  bulk_snooze_action,
  folders_lookup,
  tags_lookup,
  preferences,
  update_preference,
  save_now,
  is_drafts_view,
  is_scheduled_view,
}: UseInboxToolbarActionsOptions) {
  const [confirmations, set_confirmations] = useState<ConfirmationDialogState>({
    show_delete: false,
    show_archive: false,
    show_spam: false,
  });
  const [dont_ask_delete, set_dont_ask_delete] = useState(false);
  const [dont_ask_archive, set_dont_ask_archive] = useState(false);
  const [dont_ask_spam, set_dont_ask_spam] = useState(false);
  const [show_empty_spam_dialog, set_show_empty_spam_dialog] = useState(false);
  const [is_emptying_spam, set_is_emptying_spam] = useState(false);
  const [show_empty_trash_dialog, set_show_empty_trash_dialog] =
    useState(false);
  const [is_emptying_trash, set_is_emptying_trash] = useState(false);
  const [pending_delete_email, set_pending_delete_email] =
    useState<InboxEmail | null>(null);
  const [show_single_delete_confirm, set_show_single_delete_confirm] =
    useState(false);
  const [pending_spam_email, set_pending_spam_email] =
    useState<InboxEmail | null>(null);
  const [show_single_spam_confirm, set_show_single_spam_confirm] =
    useState(false);
  const [pending_archive_email, set_pending_archive_email] =
    useState<InboxEmail | null>(null);
  const [show_single_archive_confirm, set_show_single_archive_confirm] =
    useState(false);
  const [dont_ask_single_delete, set_dont_ask_single_delete] = useState(false);
  const [dont_ask_single_spam, set_dont_ask_single_spam] = useState(false);
  const [dont_ask_single_archive, set_dont_ask_single_archive] =
    useState(false);

  const delete_actions = use_delete_actions({
    t,
    current_view,
    email_state,
    get_selected_ids,
    update_email,
    remove_email,
    remove_emails,
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
  });

  const folder_tag_actions = use_folder_tag_actions({
    t,
    current_view,
    email_state,
    update_email,
    folders_lookup,
    tags_lookup,
    is_drafts_view,
    is_scheduled_view,
  });

  const archive_snooze_actions = use_archive_snooze_actions({
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
  });

  const confirm_single_spam = useCallback(async (): Promise<void> => {
    if (!pending_spam_email) return;
    if (dont_ask_single_spam) {
      update_preference("confirm_before_spam", false, true);
    }
    const email = pending_spam_email;
    const sender = email.sender_email;
    const same_sender_emails = sender
      ? email_state.emails.filter(
          (e) =>
            e.sender_email === sender &&
            e.id !== email.id &&
            !e.is_spam,
        )
      : [];

    const deltas = compute_removal_deltas(email);
    const same_sender_deltas = same_sender_emails.map(compute_removal_deltas);
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    const same_sender_ids = same_sender_emails.flatMap((e) =>
      e.grouped_email_ids && e.grouped_email_ids.length > 1
        ? e.grouped_email_ids
        : [e.id],
    );

    const combined_ids = [...all_ids, ...same_sender_ids];

    remove_email(email.id);
    for (const e of same_sender_emails) {
      remove_email(e.id);
    }
    apply_stat_deltas(deltas);
    for (const d of same_sender_deltas) {
      apply_stat_deltas(d);
    }

    const result = await bulk_update_metadata_by_ids(combined_ids, {
      is_spam: true,
      is_trashed: false,
    });

    if (result.success) {
      if (sender) {
        report_spam_sender(sender).catch(() => {});
      }
      show_action_toast({
        message: t("common.conversation_marked_as_spam"),
        action_type: "spam",
        email_ids: combined_ids,
        on_undo: async () => {
          revert_stat_deltas(deltas);
          for (const d of same_sender_deltas) {
            revert_stat_deltas(d);
          }
          await bulk_update_metadata_by_ids(combined_ids, { is_spam: false });
          if (sender) {
            remove_spam_sender(sender).catch(() => {});
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      for (const d of same_sender_deltas) {
        revert_stat_deltas(d);
      }
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
      show_toast(t("common.failed_to_mark_as_spam"), "error");
    }
    set_show_single_spam_confirm(false);
    set_pending_spam_email(null);
    set_dont_ask_single_spam(false);
  }, [
    pending_spam_email,
    dont_ask_single_spam,
    remove_email,
    update_preference,
    save_now,
    email_state.emails,
  ]);

  const cancel_single_spam = useCallback((): void => {
    set_show_single_spam_confirm(false);
    set_pending_spam_email(null);
    set_dont_ask_single_spam(false);
  }, []);

  const handle_empty_spam = useCallback((): void => {
    set_show_empty_spam_dialog(true);
  }, []);

  const confirm_empty_spam = useCallback(async (): Promise<void> => {
    set_is_emptying_spam(true);
    try {
      const spam_emails = email_state.emails.filter((e) => e.is_spam);
      const spam_ids = spam_emails.map((e) => e.id);

      if (spam_ids.length === 0) {
        set_show_empty_spam_dialog(false);

        return;
      }
      const result = await batched_bulk_permanent_delete(spam_ids);

      if (result.success) {
        for (const id of spam_ids) {
          remove_email(id);
        }
        show_action_toast({
          message: t("common.spam_emails_permanently_deleted", {
            count: spam_ids.length,
          }),
          action_type: "trash",
          email_ids: spam_ids,
        });
      }
    } finally {
      set_is_emptying_spam(false);
      set_show_empty_spam_dialog(false);
    }
  }, [email_state.emails, remove_email]);

  const cancel_empty_spam = useCallback((): void => {
    set_show_empty_spam_dialog(false);
  }, []);

  const handle_toolbar_mark_read = useCallback(async (): Promise<void> => {
    if (is_drafts_view || is_scheduled_view) return;
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;
    const has_unread = selected.some((e) => !e.is_read);
    const new_state = has_unread;
    const unread_count_delta = selected.reduce((acc, email) => {
      if (email.item_type !== "received") return acc;
      if (new_state && !email.is_read) return acc - 1;
      if (!new_state && email.is_read) return acc + 1;

      return acc;
    }, 0);

    for (const email of selected) {
      update_email(email.id, { is_read: new_state });
    }
    if (unread_count_delta !== 0) {
      adjust_unread_count(unread_count_delta);
    }
    const total = selected.length;

    if (total > 5) {
      show_action_toast({
        message: t("common.processing_count", { completed: 0, total }),
        action_type: "progress",
        email_ids: selected.map((e) => e.id),
        progress: { completed: 0, total },
      });
    }

    let completed = 0;
    const results = await Promise.all(
      selected.map(async (email) => {
        const result = await update_item_metadata(
          email.id,
          {
            encrypted_metadata: email.encrypted_metadata,
            metadata_nonce: email.metadata_nonce,
            metadata_version: email.metadata_version,
          },
          { is_read: new_state },
        );

        if (total > 5) update_progress_toast(++completed, total, t);

        return result;
      }),
    );

    selected.forEach((email, index) => {
      const result = results[index];

      if (result.success && result.encrypted) {
        emit_mail_item_updated({
          id: email.id,
          is_read: new_state,
          encrypted_metadata: result.encrypted.encrypted_metadata,
          metadata_nonce: result.encrypted.metadata_nonce,
        });
      }
    });
    show_action_toast({
      message: new_state
        ? t("common.conversations_marked_as_read_bulk", {
            count: selected.length,
          })
        : t("common.conversations_marked_as_unread_bulk", {
            count: selected.length,
          }),
      action_type: "read",
      email_ids: selected.map((e) => e.id),
    });
  }, [email_state.emails, update_email, is_drafts_view, is_scheduled_view]);

  const handle_toolbar_mark_unread = useCallback(async (): Promise<void> => {
    if (is_drafts_view || is_scheduled_view) return;
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;
    const unread_count_delta = selected.reduce((acc, email) => {
      if (email.item_type !== "received") return acc;
      if (email.is_read) return acc + 1;

      return acc;
    }, 0);

    for (const email of selected) {
      update_email(email.id, { is_read: false });
    }
    if (unread_count_delta !== 0) {
      adjust_unread_count(unread_count_delta);
    }
    const total = selected.length;

    if (total > 5) {
      show_action_toast({
        message: t("common.processing_count", { completed: 0, total }),
        action_type: "progress",
        email_ids: selected.map((e) => e.id),
        progress: { completed: 0, total },
      });
    }

    let completed = 0;
    const results = await Promise.all(
      selected.map(async (email) => {
        const result = await update_item_metadata(
          email.id,
          {
            encrypted_metadata: email.encrypted_metadata,
            metadata_nonce: email.metadata_nonce,
            metadata_version: email.metadata_version,
          },
          { is_read: false },
        );

        if (total > 5) update_progress_toast(++completed, total, t);

        return result;
      }),
    );

    selected.forEach((email, index) => {
      const result = results[index];

      if (result.success && result.encrypted) {
        emit_mail_item_updated({
          id: email.id,
          is_read: false,
          encrypted_metadata: result.encrypted.encrypted_metadata,
          metadata_nonce: result.encrypted.metadata_nonce,
        });
      }
    });
    show_action_toast({
      message: t("common.conversations_marked_as_unread_bulk", {
        count: selected.length,
      }),
      action_type: "read",
      email_ids: selected.map((e) => e.id),
    });
  }, [email_state.emails, update_email, is_drafts_view, is_scheduled_view]);

  const handle_toolbar_toggle_star = useCallback(async (): Promise<void> => {
    if (is_drafts_view || is_scheduled_view) return;
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;
    const new_state = selected.some((e) => !e.is_starred);
    const changed = selected.filter((e) => e.is_starred !== new_state);

    if (changed.length === 0) return;

    for (const email of changed) {
      update_email(email.id, { is_starred: new_state });
    }
    adjust_starred_count(new_state ? changed.length : -changed.length);

    const total = changed.length;

    if (total > 5) {
      show_action_toast({
        message: t("common.processing_count", { completed: 0, total }),
        action_type: "progress",
        email_ids: changed.map((e) => e.id),
        progress: { completed: 0, total },
      });
    }

    let completed = 0;
    const results = await Promise.all(
      changed.map(async (email) => {
        const result = await update_item_metadata(
          email.id,
          {
            encrypted_metadata: email.encrypted_metadata,
            metadata_nonce: email.metadata_nonce,
            metadata_version: email.metadata_version,
          },
          { is_starred: new_state },
        );

        if (total > 5) update_progress_toast(++completed, total, t);

        return result;
      }),
    );

    changed.forEach((email, index) => {
      const result = results[index];

      if (result.success && result.encrypted) {
        emit_mail_item_updated({
          id: email.id,
          is_starred: new_state,
          encrypted_metadata: result.encrypted.encrypted_metadata,
          metadata_nonce: result.encrypted.metadata_nonce,
        });
      }
    });
    show_action_toast({
      message: new_state
        ? t("common.conversations_starred_bulk", { count: changed.length })
        : t("common.conversations_unstarred_bulk", { count: changed.length }),
      action_type: "star",
      email_ids: changed.map((e) => e.id),
    });
  }, [email_state.emails, update_email, is_drafts_view, is_scheduled_view, t]);

  const perform_toolbar_spam = useCallback(async (): Promise<void> => {
    if (is_drafts_view || is_scheduled_view) return;
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;

    const expanded_ids = Array.from(
      new Set(
        selected.flatMap((e) =>
          e.grouped_email_ids && e.grouped_email_ids.length > 1
            ? e.grouped_email_ids
            : [e.id],
        ),
      ),
    );

    const result = await bulk_update_metadata_by_ids(expanded_ids, {
      is_spam: true,
      is_trashed: false,
    });

    if (!result.success) return;
    const unique_senders = new Set(
      selected.map((e) => e.sender_email).filter(Boolean),
    );

    for (const sender of unique_senders) {
      report_spam_sender(sender).catch(() => {});
    }
    for (const email of selected) {
      remove_email(email.id);
    }
    show_action_toast({
      message: t("common.conversations_marked_as_spam_bulk", {
        count: selected.length,
      }),
      action_type: "spam",
      email_ids: expanded_ids,
      on_undo: async () => {
        await bulk_update_metadata_by_ids(expanded_ids, { is_spam: false });
        for (const sender of unique_senders) {
          remove_spam_sender(sender).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      },
    });
  }, [email_state.emails, remove_email, is_drafts_view, is_scheduled_view]);

  const handle_toolbar_spam = useCallback((): void => {
    if (!preferences.confirm_before_spam) {
      perform_toolbar_spam();
    } else {
      set_confirmations((prev) => ({ ...prev, show_spam: true }));
    }
  }, [preferences.confirm_before_spam, perform_toolbar_spam]);

  const confirm_spam = useCallback(async (): Promise<void> => {
    if (dont_ask_spam) {
      update_preference("confirm_before_spam", false, true);
    }
    await perform_toolbar_spam();
    set_confirmations((prev) => ({ ...prev, show_spam: false }));
    set_dont_ask_spam(false);
  }, [dont_ask_spam, perform_toolbar_spam, update_preference, save_now]);

  const cancel_spam = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_spam: false }));
    set_dont_ask_spam(false);
  }, []);

  const handle_toolbar_restore = useCallback(async (): Promise<void> => {
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;
    const ids = selected.map((e) => e.id);
    const is_spam_restore = current_view === "spam";
    const total = selected.length;

    if (total > 5) {
      show_action_toast({
        message: t("common.processing_count", { completed: 0, total }),
        action_type: "progress",
        email_ids: selected.map((e) => e.id),
        progress: { completed: 0, total },
      });
    }

    const thread_tokens = !is_spam_restore
      ? Array.from(
          new Set(
            selected
              .filter(
                (e) =>
                  !!e.thread_token && (e.thread_message_count ?? 0) > 1,
              )
              .map((e) => e.thread_token as string),
          ),
        )
      : [];
    const singleton_ids = selected
      .filter(
        (e) =>
          is_spam_restore ||
          !e.thread_token ||
          (e.thread_message_count ?? 0) <= 1,
      )
      .map((e) => e.id);

    const thread_results = await Promise.all(
      thread_tokens.map((tok) => trash_thread(tok, false)),
    );
    const thread_ok = thread_results.every((r) => !!r.data);
    const bulk_result =
      singleton_ids.length > 0
        ? await bulk_update_metadata_by_ids(
            singleton_ids,
            is_spam_restore ? { is_spam: false } : { is_trashed: false },
          )
        : { success: true, updated_count: 0, failed_ids: [] };

    if (total > 5) update_progress_toast(total, total, t);

    if (!thread_ok || !bulk_result.success) return;
    if (is_spam_restore) {
      const unique_senders = new Set(
        selected.map((e) => e.sender_email).filter(Boolean),
      );

      for (const sender of unique_senders) {
        remove_spam_sender(sender).catch(() => {});
      }
    }
    for (const email of selected) {
      if (is_spam_restore) {
        const deltas = compute_restore_deltas(email);

        remove_email(email.id);
        apply_stat_deltas(deltas);
      } else {
        const deltas = compute_untrash_deltas(email);

        remove_email(email.id);
        apply_stat_deltas(deltas);
      }
    }
    show_action_toast({
      message: t("common.conversations_restored_bulk", {
        count: selected.length,
      }),
      action_type: "restore",
      email_ids: ids,
      on_undo: async () => {
        if (is_spam_restore) {
          const unique_senders = new Set(
            selected.map((e) => e.sender_email).filter(Boolean),
          );

          for (const sender of unique_senders) {
            report_spam_sender(sender).catch(() => {});
          }
        }
        const undo_update = is_spam_restore
          ? { is_spam: true }
          : { is_trashed: true };

        await Promise.all([
          ...thread_tokens.map((tok) => trash_thread(tok, true)),
          singleton_ids.length > 0
            ? bulk_update_metadata_by_ids(singleton_ids, undo_update)
            : Promise.resolve(),
        ]);
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      },
    });
  }, [email_state.emails, current_view, remove_email, apply_stat_deltas]);

  return {
    confirmations,
    dont_ask_delete,
    set_dont_ask_delete,
    dont_ask_archive,
    set_dont_ask_archive,
    dont_ask_spam,
    set_dont_ask_spam,
    show_empty_spam_dialog,
    is_emptying_spam,
    show_empty_trash_dialog,
    is_emptying_trash,
    show_single_delete_confirm,
    show_single_spam_confirm,
    show_single_archive_confirm,
    dont_ask_single_delete,
    set_dont_ask_single_delete,
    dont_ask_single_spam,
    set_dont_ask_single_spam,
    dont_ask_single_archive,
    set_dont_ask_single_archive,
    set_pending_delete_email,
    set_show_single_delete_confirm,
    set_pending_spam_email,
    set_show_single_spam_confirm,
    set_pending_archive_email,
    set_show_single_archive_confirm,
    handle_toolbar_delete: delete_actions.handle_toolbar_delete,
    handle_toolbar_archive: archive_snooze_actions.handle_toolbar_archive,
    handle_toolbar_unarchive: archive_snooze_actions.handle_toolbar_unarchive,
    handle_toolbar_toggle_folder:
      folder_tag_actions.handle_toolbar_toggle_folder,
    handle_toolbar_toggle_tag: folder_tag_actions.handle_toolbar_toggle_tag,
    confirm_delete: delete_actions.confirm_delete,
    confirm_archive: archive_snooze_actions.confirm_archive,
    cancel_delete: delete_actions.cancel_delete,
    cancel_archive: archive_snooze_actions.cancel_archive,
    confirm_single_delete: delete_actions.confirm_single_delete,
    cancel_single_delete: delete_actions.cancel_single_delete,
    confirm_single_spam,
    cancel_single_spam,
    confirm_single_archive: archive_snooze_actions.confirm_single_archive,
    cancel_single_archive: archive_snooze_actions.cancel_single_archive,
    handle_empty_spam,
    confirm_empty_spam,
    cancel_empty_spam,
    handle_empty_trash: delete_actions.handle_empty_trash,
    confirm_empty_trash: delete_actions.confirm_empty_trash,
    cancel_empty_trash: delete_actions.cancel_empty_trash,
    handle_toolbar_mark_read,
    handle_toolbar_mark_unread,
    handle_toolbar_toggle_star,
    handle_toolbar_spam,
    confirm_spam,
    cancel_spam,
    handle_toolbar_restore,
    handle_toolbar_snooze: archive_snooze_actions.handle_toolbar_snooze,
  };
}
