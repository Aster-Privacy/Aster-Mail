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
import type { UseContextMenuActionsParams } from "./inbox_context_menu_types";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import {
  adjust_stats_unread,
  adjust_stats_starred,
  adjust_stats_trash,
  invalidate_mail_stats,
} from "@/hooks/use_mail_stats";
import {
  conversation_has_unread_sibling,
  read_clears_conversation,
} from "@/hooks/unread_read_delta";
import {
  compute_trash_deltas,
  compute_removal_deltas,
  compute_archive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { mark_conversation_read } from "@/hooks/mark_conversation_read";
import { remove_email_from_view_cache } from "@/hooks/email_list_cache";
import { collect_restore_entries } from "@/hooks/email_list_helpers";
import {
  remove_ids as remove_index_ids,
  remove_thread_entries,
  reindex_ids,
} from "@/services/category_index";
import {
  permanent_delete_mail_item,
  batched_bulk_permanent_delete,
  trash_thread,
  report_spam_sender,
  remove_spam_sender,
} from "@/services/api/mail";
import {
  update_item_metadata,
  bulk_update_metadata_by_ids,
} from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";

export function build_core_context_menu_actions(
  params: UseContextMenuActionsParams,
) {
  const {
    t,
    current_view,
    emails,
    update_email,
    remove_email,
    remove_emails,
    restore_emails,
    is_drafts_view,
    is_scheduled_view,
    schedule_delete_drafts,
  } = params;

  const is_trash_view = current_view === "trash";

  const perform_delete = async (email: InboxEmail) => {
    if (is_drafts_view) {
      schedule_delete_drafts([email.id]);

      show_action_toast({
        message: t("common.draft_deleted"),
        action_type: "trash",
        email_ids: [email.id],
      });

      return;
    }

    if (is_trash_view) {
      const all_ids =
        email.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [email.id];

      const restore_entries = collect_restore_entries(emails, [email.id]);

      remove_email(email.id);
      for (const eid of all_ids) {
        remove_email_from_view_cache(eid);
      }
      const succeeded =
        all_ids.length === 1
          ? !!(await permanent_delete_mail_item(email.id)).data
          : (await batched_bulk_permanent_delete(all_ids)).success;

      if (succeeded) {
        adjust_stats_trash(-all_ids.length);
        emit_mail_items_removed({ ids: all_ids });
        show_action_toast({
          message:
            all_ids.length === 1
              ? t("common.email_permanently_deleted")
              : t("common.emails_permanently_deleted", {
                  count: all_ids.length,
                }),
          action_type: "trash",
          email_ids: all_ids,
        });
      } else {
        restore_emails(restore_entries);
        invalidate_mail_stats();
        show_toast(t("common.failed_to_permanently_delete"), "error");
      }

      return;
    }

    const deltas = compute_trash_deltas(email);
    const grouped_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    if (grouped_ids.length > 1) {
      remove_emails(grouped_ids);
    } else {
      remove_email(email.id);
    }
    apply_stat_deltas(deltas);

    const removed_thread_ids = email.thread_token
      ? remove_thread_entries(email.thread_token)
      : [];
    const trashed_index_ids = Array.from(
      new Set([...grouped_ids, ...removed_thread_ids]),
    );

    remove_index_ids(grouped_ids);

    if (email.thread_token) {
      const result = await trash_thread(email.thread_token, true);

      if (result.data) {
        for (const id of grouped_ids) {
          emit_mail_item_updated({ id, is_trashed: true });
        }
        show_action_toast({
          message: t("common.conversation_moved_to_trash"),
          action_type: "trash",
          email_ids: grouped_ids,
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await trash_thread(email.thread_token!, false);
            reindex_ids(trashed_index_ids);
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, is_trashed: false });
            }
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      } else {
        revert_stat_deltas(deltas);
        reindex_ids(trashed_index_ids);
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        show_toast(t("common.failed_to_delete_emails"), "error");
      }
    } else {
      const result = await bulk_update_metadata_by_ids(grouped_ids, {
        is_trashed: true,
      });

      if (result.success) {
        for (const id of grouped_ids) {
          emit_mail_item_updated({ id, is_trashed: true });
        }
        show_action_toast({
          message: t("common.conversation_moved_to_trash"),
          action_type: "trash",
          email_ids: grouped_ids,
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await bulk_update_metadata_by_ids(grouped_ids, {
              is_trashed: false,
            });
            reindex_ids(trashed_index_ids);
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, is_trashed: false });
            }
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      } else {
        revert_stat_deltas(deltas);
        reindex_ids(trashed_index_ids);
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        show_toast(t("common.failed_to_delete_emails"), "error");
      }
    }
  };

  const handle_archive = async (email: InboxEmail) => {
    const deltas = compute_archive_deltas(email);
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    remove_email(email.id);
    apply_stat_deltas(deltas);

    const archived_thread_ids = email.thread_token
      ? remove_thread_entries(email.thread_token)
      : [];
    const archived_index_ids = Array.from(
      new Set([...all_ids, ...archived_thread_ids]),
    );

    remove_index_ids(all_ids);
    const result = await batch_archive({ ids: all_ids, tier: "hot" });

    if (result.data?.success) {
      await bulk_update_metadata_by_ids(all_ids, { is_archived: true });
      for (const eid of all_ids) {
        emit_mail_item_updated({ id: eid, is_archived: true });
      }
      invalidate_mail_stats();
      show_action_toast({
        message: t("common.conversation_archived"),
        action_type: "archive",
        email_ids: all_ids,
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await batch_unarchive({ ids: all_ids });
          reindex_ids(archived_index_ids);
          for (const eid of all_ids) {
            emit_mail_item_updated({ id: eid, is_archived: false });
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      reindex_ids(archived_index_ids);
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
    }
  };

  const handle_spam = async (email: InboxEmail) => {
    const sender = email.sender_email;
    const same_sender_emails = sender
      ? emails.filter(
          (e) => e.sender_email === sender && e.id !== email.id && !e.is_spam,
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

    const spam_thread_ids = [email, ...same_sender_emails].flatMap((e) =>
      e.thread_token ? remove_thread_entries(e.thread_token) : [],
    );
    const spam_index_ids = Array.from(
      new Set([...combined_ids, ...spam_thread_ids]),
    );

    remove_index_ids(combined_ids);

    const result = await bulk_update_metadata_by_ids(combined_ids, {
      is_spam: true,
      is_trashed: false,
    });

    if (result.success) {
      for (const id of combined_ids) {
        emit_mail_item_updated({ id, is_spam: true });
      }
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
          await bulk_update_metadata_by_ids(combined_ids, {
            is_spam: false,
          });
          reindex_ids(spam_index_ids);
          for (const id of combined_ids) {
            emit_mail_item_updated({ id, is_spam: false });
          }
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
      reindex_ids(spam_index_ids);
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
      show_toast(t("common.failed_to_mark_as_spam"), "error");
    }
  };

  const handle_toggle_read = async (email: InboxEmail) => {
    if (is_drafts_view || is_scheduled_view) return;

    const new_state = !email.is_read;
    const is_received = email.item_type === "received";
    const conversation_options = {
      thread_token: email.thread_token,
      grouped_count: email.grouped_email_ids?.length,
      acted_id: email.id,
    };
    const should_adjust_unread =
      is_received &&
      (new_state
        ? read_clears_conversation(conversation_options)
        : !conversation_has_unread_sibling(conversation_options));

    update_email(email.id, { is_read: new_state });
    if (should_adjust_unread) {
      adjust_stats_unread(new_state ? -1 : 1);
    }
    const result = await update_item_metadata(
      email.id,
      {
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      },
      { is_read: new_state },
    );

    if (result.success) {
      emit_mail_item_updated({
        id: email.id,
        is_read: new_state,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      if (new_state && is_received) {
        mark_conversation_read(conversation_options);
      }
      show_action_toast({
        message: new_state
          ? t("common.marked_as_read_toast")
          : t("common.marked_as_unread_toast"),
        action_type: "read",
        email_ids: [email.id],
        on_undo: async () => {
          if (should_adjust_unread) {
            adjust_stats_unread(new_state ? 1 : -1);
          }
          const undo_result = await update_item_metadata(
            email.id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_read: !new_state },
          );

          emit_mail_item_updated({
            id: email.id,
            is_read: !new_state,
            encrypted_metadata: undo_result.encrypted?.encrypted_metadata,
            metadata_nonce: undo_result.encrypted?.metadata_nonce,
          });
        },
      });
    } else {
      update_email(email.id, { is_read: email.is_read });
      if (should_adjust_unread) {
        adjust_stats_unread(new_state ? 1 : -1);
      }
      show_toast(
        new_state
          ? t("common.failed_to_mark_as_read")
          : t("common.failed_to_mark_as_unread"),
        "error",
      );
    }
  };

  const handle_toggle_pin = async (email: InboxEmail) => {
    if (is_drafts_view || is_scheduled_view) return;

    const new_state = !email.is_pinned;

    update_email(email.id, { is_pinned: new_state });
    const result = await update_item_metadata(
      email.id,
      {
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      },
      { is_pinned: new_state },
    );

    if (result.success) {
      emit_mail_item_updated({
        id: email.id,
        is_pinned: new_state,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      show_action_toast({
        message: new_state
          ? t("common.pinned_toast")
          : t("common.unpinned_toast"),
        action_type: "pin",
        email_ids: [email.id],
        on_undo: async () => {
          const undo_result = await update_item_metadata(
            email.id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_pinned: !new_state },
          );

          emit_mail_item_updated({
            id: email.id,
            is_pinned: !new_state,
            encrypted_metadata: undo_result.encrypted?.encrypted_metadata,
            metadata_nonce: undo_result.encrypted?.metadata_nonce,
          });
        },
      });
    } else {
      update_email(email.id, { is_pinned: !new_state });
      show_toast(t("common.failed_to_update"), "error");
    }
  };

  const handle_toggle_star = async (email: InboxEmail) => {
    if (is_drafts_view || is_scheduled_view) return;

    const new_state = !email.is_starred;

    update_email(email.id, { is_starred: new_state });
    adjust_stats_starred(new_state ? 1 : -1);

    const result = await update_item_metadata(
      email.id,
      {
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      },
      { is_starred: new_state },
    );

    if (result.success) {
      emit_mail_item_updated({
        id: email.id,
        is_starred: new_state,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      show_action_toast({
        message: new_state
          ? t("common.starred_toast")
          : t("common.unstarred_toast"),
        action_type: "star",
        email_ids: [email.id],
        on_undo: async () => {
          adjust_stats_starred(new_state ? -1 : 1);
          const undo_result = await update_item_metadata(
            email.id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_starred: !new_state },
          );

          emit_mail_item_updated({
            id: email.id,
            is_starred: !new_state,
            encrypted_metadata: undo_result.encrypted?.encrypted_metadata,
            metadata_nonce: undo_result.encrypted?.metadata_nonce,
          });
        },
      });
    } else {
      update_email(email.id, { is_starred: !new_state });
      adjust_stats_starred(new_state ? -1 : 1);
      show_toast(t("common.failed_to_update"), "error");
    }
  };

  return {
    perform_delete,
    handle_archive,
    handle_spam,
    handle_toggle_read,
    handle_toggle_pin,
    handle_toggle_star,
  };
}
