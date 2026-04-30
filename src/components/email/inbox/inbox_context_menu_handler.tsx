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

import { useMemo } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import {
  adjust_unread_count,
  adjust_starred_count,
  adjust_trash_count,
} from "@/hooks/use_mail_counts";
import {
  compute_trash_deltas,
  compute_untrash_deltas,
  compute_removal_deltas,
  compute_restore_deltas,
  compute_archive_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { invalidate_mail_cache, remove_email_from_view_cache } from "@/hooks/email_list_cache";
import { emit_mail_changed } from "@/hooks/email_action_types";
import {
  permanent_delete_mail_item,
  bulk_add_folder,
  bulk_remove_folder,
  batched_bulk_permanent_delete,
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

interface UseContextMenuActionsParams {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  emails: InboxEmail[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  handle_open_compose: (mode: "reply" | "forward", email: InboxEmail) => void;
  folders_lookup: Map<string, { name: string; color?: string }>;
  tags_lookup: Map<string, { name: string; color?: string; icon?: string }>;
  add_folder_to_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  remove_folder_from_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  add_tag_to_email: (email_id: string, tag_token: string) => Promise<boolean>;
  remove_tag_from_email: (
    email_id: string,
    tag_token: string,
  ) => Promise<boolean>;
  preferences: {
    confirm_before_delete: boolean;
    confirm_before_spam: boolean;
    confirm_before_archive: boolean;
  };
  set_pending_delete_email: (email: InboxEmail | null) => void;
  set_show_single_delete_confirm: (show: boolean) => void;
  set_pending_spam_email: (email: InboxEmail | null) => void;
  set_show_single_spam_confirm: (show: boolean) => void;
  set_pending_archive_email: (email: InboxEmail | null) => void;
  set_show_single_archive_confirm: (show: boolean) => void;
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
  schedule_delete_drafts: (ids: string[]) => () => void;
}

export interface ContextMenuActions {
  handle_delete: (email: InboxEmail) => void;
  handle_archive: (email: InboxEmail) => void;
  handle_spam: (email: InboxEmail) => void;
  handle_toggle_read: (email: InboxEmail) => Promise<void>;
  handle_toggle_star: (email: InboxEmail) => Promise<void>;
  handle_toggle_pin: (email: InboxEmail) => Promise<void>;
  handle_reply: (email: InboxEmail) => void;
  handle_forward: (email: InboxEmail) => void;
  handle_folder_toggle: (
    email: InboxEmail,
    folder_token: string,
  ) => Promise<void>;
  handle_tag_toggle: (email: InboxEmail, tag_token: string) => Promise<void>;
  handle_restore: (email: InboxEmail) => Promise<void>;
  handle_mark_not_spam: (email: InboxEmail) => Promise<void>;
  handle_move_to_inbox: (email: InboxEmail) => Promise<void>;
}

export function use_context_menu_actions({
  t,
  current_view,
  emails,
  update_email,
  remove_email,
  remove_emails,
  handle_open_compose,
  folders_lookup,
  tags_lookup,
  add_folder_to_email,
  remove_folder_from_email,
  add_tag_to_email,
  remove_tag_from_email,
  preferences,
  set_pending_delete_email,
  set_show_single_delete_confirm,
  set_pending_spam_email,
  set_show_single_spam_confirm,
  set_pending_archive_email,
  set_show_single_archive_confirm,
  is_drafts_view,
  is_scheduled_view,
  schedule_delete_drafts,
}: UseContextMenuActionsParams): ContextMenuActions {
  return useMemo(() => {
    const is_trash_view = current_view === "trash";

    const perform_delete = async (email: InboxEmail) => {
      if (is_drafts_view) {
        const undo = schedule_delete_drafts([email.id]);

        show_action_toast({
          message: t("common.draft_deleted"),
          action_type: "trash",
          email_ids: [email.id],
          on_undo: async () => {
            undo();
          },
        });

        return;
      }

      if (is_trash_view) {
        const all_ids =
          email.grouped_email_ids && email.grouped_email_ids.length > 1
            ? email.grouped_email_ids
            : [email.id];

        remove_email(email.id);
        for (const eid of all_ids) {
          remove_email_from_view_cache(eid);
        }
        const succeeded =
          all_ids.length === 1
            ? !!(await permanent_delete_mail_item(email.id)).data
            : (await batched_bulk_permanent_delete(all_ids)).success;

        if (succeeded) {
          adjust_trash_count(-all_ids.length);
          invalidate_mail_stats();
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
          update_email(email.id, email);
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

      if (email.thread_token) {
        const result = await trash_thread(email.thread_token, true);

        if (result.data) {
          show_action_toast({
            message: t("common.conversation_moved_to_trash"),
            action_type: "trash",
            email_ids: grouped_ids,
            on_undo: async () => {
              revert_stat_deltas(deltas);
              await trash_thread(email.thread_token!, false);
              window.dispatchEvent(
                new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
              );
            },
          });
          window.dispatchEvent(
            new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
          );
        }
      } else {
        const result = await bulk_update_metadata_by_ids(grouped_ids, {
          is_trashed: true,
        });

        if (result.success) {
          show_action_toast({
            message: t("common.conversation_moved_to_trash"),
            action_type: "trash",
            email_ids: grouped_ids,
            on_undo: async () => {
              revert_stat_deltas(deltas);
              await bulk_update_metadata_by_ids(grouped_ids, { is_trashed: false });
              window.dispatchEvent(
                new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
              );
            },
          });
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
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      } else {
        revert_stat_deltas(deltas);
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
      }
    };

    const handle_spam = async (email: InboxEmail) => {
      const sender = email.sender_email;
      const same_sender_emails = sender
        ? emails.filter(
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
            await bulk_update_metadata_by_ids(combined_ids, {
              is_spam: false,
            });
            if (sender) {
              remove_spam_sender(sender).catch(() => {});
            }
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
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
    };

    const handle_toggle_read = async (email: InboxEmail) => {
      if (is_drafts_view || is_scheduled_view) return;

      const new_state = !email.is_read;
      const is_received = email.item_type === "received";

      update_email(email.id, { is_read: new_state });
      if (is_received) {
        adjust_unread_count(new_state ? -1 : 1);
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
        show_action_toast({
          message: new_state
            ? t("common.marked_as_read_toast")
            : t("common.marked_as_unread_toast"),
          action_type: "read",
          email_ids: [email.id],
          on_undo: async () => {
            if (is_received) {
              adjust_unread_count(new_state ? 1 : -1);
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
      }
    };

    const handle_toggle_star = async (email: InboxEmail) => {
      if (is_drafts_view || is_scheduled_view) return;

      const new_state = !email.is_starred;

      update_email(email.id, { is_starred: new_state });
      adjust_starred_count(new_state ? 1 : -1);

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
            adjust_starred_count(new_state ? -1 : 1);
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
      }
    };

    const handle_reply = (email: InboxEmail) => {
      handle_open_compose("reply", email);
    };

    const handle_forward = (email: InboxEmail) => {
      handle_open_compose("forward", email);
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
        update_email(email.id, { folders: [] });
        const result = await bulk_remove_folder(all_ids, folder_token);

        if (!result.error) {
          emit_mail_item_updated({ id: email.id, folders: [] });
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
      const new_folders = [new_folder];
      const is_inbox =
        current_view === "inbox" ||
        current_view === "" ||
        current_view === "all" ||
        current_view === "starred" ||
        current_view === "snoozed";

      if (is_inbox) {
        emit_mail_items_removed({ ids: [email.id] });
      } else {
        update_email(email.id, { folders: new_folders });
      }
      const result = await bulk_add_folder(all_ids, folder_token);

      if (!result.error) {
        emit_mail_item_updated({ id: email.id, folders: new_folders });
        show_action_toast({
          message: t("common.moved_to_folder", { folder: folder_name }),
          action_type: "folder",
          email_ids: all_ids,
          on_undo: async () => {
            await bulk_remove_folder(all_ids, folder_token);
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
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
      const previous_tags = email.tags || [];
      const is_already_assigned = previous_tags.some((t) => t.id === tag_token);
      const all_ids =
        email.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [email.id];

      if (is_already_assigned) {
        update_email(email.id, {
          tags: previous_tags.filter((t) => t.id !== tag_token),
        });
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
          update_email(email.id, { tags: previous_tags });
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

      remove_email(email.id);
      apply_stat_deltas(deltas);
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
            revert_stat_deltas(deltas);
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              },
              { is_trashed: true },
            );
            invalidate_mail_cache();
            emit_mail_changed();
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
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
            if (email.sender_email) {
              report_spam_sender(email.sender_email).catch(() => {});
            }
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      }
    };

    const handle_move_to_inbox = async (email: InboxEmail) => {
      const deltas = compute_restore_deltas(email);

      remove_email(email.id);
      apply_stat_deltas(deltas);
      const result = await batch_unarchive({ ids: [email.id] });

      if (result.data?.success) {
        invalidate_mail_cache();
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.moved_to_inbox_toast"),
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            revert_stat_deltas(deltas);
            await batch_archive({ ids: [email.id], tier: "hot" });
            invalidate_mail_cache();
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
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
      handle_forward,
      handle_folder_toggle,
      handle_tag_toggle,
      handle_restore,
      handle_mark_not_spam,
      handle_move_to_inbox,
    };
  }, [
    t,
    current_view,
    emails,
    update_email,
    remove_email,
    remove_emails,
    handle_open_compose,
    folders_lookup,
    tags_lookup,
    add_folder_to_email,
    remove_folder_from_email,
    add_tag_to_email,
    remove_tag_from_email,
    preferences.confirm_before_delete,
    preferences.confirm_before_spam,
    preferences.confirm_before_archive,
    set_pending_delete_email,
    set_show_single_delete_confirm,
    is_drafts_view,
    is_scheduled_view,
    schedule_delete_drafts,
  ]);
}
