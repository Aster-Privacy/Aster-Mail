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
import type {
  ContextMenuActions,
  UseContextMenuActionsParams,
} from "./inbox_context_menu_types";

import { build_core_context_menu_actions } from "./inbox_context_menu_actions_core";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  compute_untrash_deltas,
  compute_restore_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { emit_mail_changed } from "@/hooks/email_action_types";
import {
  bulk_add_folder,
  bulk_remove_folder,
  trash_thread,
  report_spam_sender,
  remove_spam_sender,
} from "@/services/api/mail";
import { bulk_add_tag, bulk_remove_tag } from "@/services/api/tags";
import {
  update_item_metadata,
  bulk_update_metadata_by_ids,
} from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";

export function build_context_menu_actions(
  params: UseContextMenuActionsParams,
): ContextMenuActions {
  const {
    t,
    current_view,
    emails,
    update_email,
    remove_email,
    remove_emails,
    handle_open_compose,
    folders_lookup,
    tags_lookup,
    preferences,
    set_pending_delete_email,
    set_show_single_delete_confirm,
    set_pending_spam_email,
    set_show_single_spam_confirm,
    set_pending_archive_email,
    set_show_single_archive_confirm,
    is_drafts_view,
    is_scheduled_view,
  } = params;
  const {
    perform_delete,
    handle_archive,
    handle_spam,
    handle_toggle_read,
    handle_toggle_pin,
    handle_toggle_star,
  } = build_core_context_menu_actions(params);

  const handle_reply = (email: InboxEmail) => {
    handle_open_compose("reply", email);
  };

  const handle_reply_all = (email: InboxEmail) => {
    handle_open_compose("reply_all", email);
  };

  const handle_forward = (email: InboxEmail) => {
    handle_open_compose("forward", email);
  };

  const handle_find_from_sender = (email: InboxEmail) => {
    if (!email.sender_email) return;
    window.dispatchEvent(
      new CustomEvent("astermail:open-search-with-query", {
        detail: { query: `from:${email.sender_email}` },
      }),
    );
  };

  const handle_open_in_new_window = (email: InboxEmail) => {
    const width = Math.min(
      1180,
      Math.max(760, Math.round(window.screen.availWidth * 0.62)),
    );
    const height = Math.min(
      960,
      Math.max(560, Math.round(window.screen.availHeight * 0.86)),
    );
    const left = Math.max(
      0,
      Math.round(window.screenX + (window.outerWidth - width) / 2),
    );
    const top = Math.max(
      0,
      Math.round(window.screenY + (window.outerHeight - height) / 2),
    );

    window.open(
      `/email/${encodeURIComponent(email.id)}?popup=1`,
      "_blank",
      `popup=yes,noopener,noreferrer,width=${width},height=${height},left=${left},top=${top}`,
    );
  };

  const handle_folder_toggle = async (
    email: InboxEmail,
    folder_token: string,
  ) => {
    if (is_drafts_view || is_scheduled_view) return;

    const folder_data = folders_lookup.get(folder_token);
    const folder_name = folder_data?.name || t("common.folder_fallback");
    const previous_folders = email.folders || [];
    const is_already_assigned = previous_folders.some(
      (f) => f.folder_token === folder_token,
    );
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    if (is_already_assigned) {
      const remaining_folders = previous_folders.filter(
        (f) => f.folder_token !== folder_token,
      );

      update_email(email.id, { folders: remaining_folders });
      const result = await bulk_remove_folder(all_ids, folder_token);

      if (!result.error) {
        emit_mail_item_updated({ id: email.id, folders: remaining_folders });
        show_action_toast({
          message: t("common.removed_from_folder", { folder: folder_name }),
          action_type: "folder",
          email_ids: all_ids,
          on_undo: async () => {
            await bulk_add_folder(all_ids, folder_token);
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      } else {
        update_email(email.id, { folders: previous_folders });
      }

      return;
    }

    const new_folder = {
      folder_token,
      name: folder_name,
      color: folder_data?.color,
    };
    const is_inbox =
      current_view === "inbox" ||
      current_view === "" ||
      current_view === "all" ||
      current_view === "starred" ||
      current_view === "snoozed";

    if (is_inbox) {
      emit_mail_items_removed({ ids: [email.id] });
    } else {
      update_email(email.id, { folders: [new_folder] });
    }
    const result = await bulk_add_folder(all_ids, folder_token);

    if (!result.error) {
      emit_mail_item_updated({ id: email.id, folders: [new_folder] });
      show_action_toast({
        message: t("common.moved_to_folder", { folder: folder_name }),
        action_type: "folder",
        email_ids: all_ids,
        on_undo: async () => {
          await bulk_remove_folder(all_ids, folder_token);
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      update_email(email.id, { folders: previous_folders });
      if (is_inbox) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      }
    }
  };

  const handle_tag_toggle = async (email: InboxEmail, tag_token: string) => {
    if (is_drafts_view || is_scheduled_view) return;

    const tag_data = tags_lookup.get(tag_token);
    const tag_name = tag_data?.name || t("common.label_fallback");
    const live_email = emails.find((e) => e.id === email.id) ?? email;
    const previous_tags = live_email.tags || [];
    const is_already_assigned = previous_tags.some((t) => t.id === tag_token);
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];
    const is_tag_view = current_view === `tag-${tag_token}`;

    if (is_already_assigned) {
      if (is_tag_view) {
        remove_email(email.id);
      } else {
        update_email(email.id, {
          tags: previous_tags.filter((t) => t.id !== tag_token),
        });
      }
      const result = await bulk_remove_tag(all_ids, tag_token);

      if (!result.error) {
        emit_mail_item_updated({
          id: email.id,
          tags: previous_tags.filter((t) => t.id !== tag_token),
        });
        show_action_toast({
          message: t("common.removed_label", { label: tag_name }),
          action_type: "folder",
          email_ids: all_ids,
          on_undo: async () => {
            await bulk_add_tag(all_ids, tag_token);
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      } else {
        if (is_tag_view) {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        } else {
          update_email(email.id, { tags: previous_tags });
        }
      }
    } else {
      const new_tag = {
        id: tag_token,
        name: tag_name,
        color: tag_data?.color,
        icon: tag_data?.icon,
      };

      update_email(email.id, { tags: [...previous_tags, new_tag] });
      const result = await bulk_add_tag(all_ids, tag_token);

      if (!result.error) {
        emit_mail_item_updated({
          id: email.id,
          tags: [...previous_tags, new_tag],
        });
        show_action_toast({
          message: t("common.added_label", { label: tag_name }),
          action_type: "folder",
          email_ids: all_ids,
          on_undo: async () => {
            await bulk_remove_tag(all_ids, tag_token);
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      } else {
        update_email(email.id, { tags: previous_tags });
      }
    }
  };

  const handle_restore = async (email: InboxEmail) => {
    const deltas = compute_untrash_deltas(email);
    const is_thread =
      !!email.thread_token && (email.thread_message_count ?? 0) > 1;
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

    if (is_thread) {
      const result = await trash_thread(email.thread_token!, false);

      if (result.data) {
        for (const id of grouped_ids) {
          emit_mail_item_updated({ id, is_trashed: false });
        }
        emit_mail_changed();

        show_action_toast({
          message: t("common.restored_from_trash"),
          action_type: "restore",
          email_ids: grouped_ids,
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await trash_thread(email.thread_token!, true);
            for (const id of grouped_ids) {
              emit_mail_item_updated({ id, is_trashed: true });
            }
            emit_mail_changed();
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      } else {
        revert_stat_deltas(deltas);
      }

      return;
    }

    const result = await update_item_metadata(
      email.id,
      {
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      },
      { is_trashed: false },
    );

    if (result.success) {
      emit_mail_item_updated({
        id: email.id,
        is_trashed: false,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      emit_mail_changed();

      show_action_toast({
        message: t("common.restored_from_trash"),
        action_type: "restore",
        email_ids: [email.id],
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await update_item_metadata(
            email.id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_trashed: true },
          );
          emit_mail_item_updated({ id: email.id, is_trashed: true });
          emit_mail_changed();
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
    }
  };

  const handle_mark_not_spam = async (email: InboxEmail) => {
    const deltas = compute_restore_deltas(email);

    remove_email(email.id);
    apply_stat_deltas(deltas);
    const result = await update_item_metadata(
      email.id,
      {
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      },
      { is_spam: false },
    );

    if (result.success) {
      emit_mail_item_updated({
        id: email.id,
        is_spam: false,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      if (email.sender_email) {
        remove_spam_sender(email.sender_email).catch(() => {});
      }
      show_action_toast({
        message: t("common.marked_as_not_spam"),
        action_type: "not_spam",
        email_ids: [email.id],
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await update_item_metadata(
            email.id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_spam: true },
          );
          emit_mail_item_updated({ id: email.id, is_spam: true });
          if (email.sender_email) {
            report_spam_sender(email.sender_email).catch(() => {});
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      show_toast(t("common.failed_to_update_emails"), "error");
    }
  };

  const handle_move_to_inbox = async (email: InboxEmail) => {
    const deltas = compute_restore_deltas(email);
    const all_ids =
      email.grouped_email_ids && email.grouped_email_ids.length > 1
        ? email.grouped_email_ids
        : [email.id];

    remove_email(email.id);
    apply_stat_deltas(deltas);
    const result = await batch_unarchive({ ids: all_ids });

    if (result.data?.success) {
      await bulk_update_metadata_by_ids(all_ids, { is_archived: false });
      for (const eid of all_ids) {
        emit_mail_item_updated({ id: eid, is_archived: false });
      }
      invalidate_mail_stats();
      show_action_toast({
        message: t("common.moved_to_inbox_toast"),
        action_type: "restore",
        email_ids: all_ids,
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await batch_archive({ ids: all_ids, tier: "hot" });
          await bulk_update_metadata_by_ids(all_ids, { is_archived: true });
          for (const eid of all_ids) {
            emit_mail_item_updated({ id: eid, is_archived: true });
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    } else {
      revert_stat_deltas(deltas);
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
    }
  };

  const handle_delete_action = (email: InboxEmail) => {
    if (preferences.confirm_before_delete) {
      set_pending_delete_email(email);
      set_show_single_delete_confirm(true);
    } else {
      perform_delete(email);
    }
  };

  const handle_spam_action = (email: InboxEmail) => {
    if (preferences.confirm_before_spam) {
      set_pending_spam_email(email);
      set_show_single_spam_confirm(true);
    } else {
      handle_spam(email);
    }
  };

  const handle_archive_action = (email: InboxEmail) => {
    if (preferences.confirm_before_archive) {
      set_pending_archive_email(email);
      set_show_single_archive_confirm(true);
    } else {
      handle_archive(email);
    }
  };

  return {
    handle_delete: handle_delete_action,
    handle_archive: handle_archive_action,
    handle_spam: handle_spam_action,
    handle_toggle_read,
    handle_toggle_star,
    handle_toggle_pin,
    handle_reply,
    handle_reply_all,
    handle_forward,
    handle_find_from_sender,
    handle_open_in_new_window,
    handle_folder_toggle,
    handle_tag_toggle,
    handle_restore,
    handle_mark_not_spam,
    handle_move_to_inbox,
  };
}
