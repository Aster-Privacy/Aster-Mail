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

import { useCallback } from "react";

import {
  bulk_action_result,
  bulk_succeeded_ids,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import { expand_email_ids } from "@/hooks/email_list_helpers";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import {
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
} from "@/services/api/mail";
import {
  batched_bulk_add_tag,
  batched_bulk_remove_tag,
} from "@/services/api/tags";
import {
  remove_ids as remove_index_ids,
  reindex_ids,
} from "@/services/category_index";

interface UseFolderTagActionsOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  current_view: string;
  email_state: {
    emails: InboxEmail[];
    total_messages: number;
  };
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  folders_lookup: Map<string, { name: string; color?: string }>;
  tags_lookup: Map<string, { name: string; color?: string; icon?: string }>;
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
}

export function use_folder_tag_actions({
  t,
  current_view,
  email_state,
  update_email,
  folders_lookup,
  tags_lookup,
  is_drafts_view,
  is_scheduled_view,
}: UseFolderTagActionsOptions) {
  const handle_toolbar_toggle_folder = useCallback(
    async (folder_token: string, should_remove: boolean): Promise<void> => {
      if (is_drafts_view || is_scheduled_view) return;
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;
      const folder_data = folders_lookup.get(folder_token);
      const folder_name = folder_data?.name || t("common.folder_fallback");
      const all_ids = selected.flatMap(expand_email_ids);
      const previous_states = new Map(
        selected.map((e) => [e.id, e.folders || []]),
      );

      const is_inbox =
        current_view === "inbox" ||
        current_view === "" ||
        current_view === "all" ||
        current_view === "starred" ||
        current_view === "snoozed";

      const compute_next_folders = (email_id: string) => {
        const without = (previous_states.get(email_id) ?? []).filter(
          (f) => f.folder_token !== folder_token,
        );

        return should_remove
          ? without
          : [
              ...without,
              { folder_token, name: folder_name, color: folder_data?.color },
            ];
      };

      if (!should_remove && is_inbox) {
        emit_mail_items_removed({ ids: all_ids });
      } else {
        for (const email of selected) {
          update_email(email.id, { folders: compute_next_folders(email.id) });
        }
      }
      const batch_result = should_remove
        ? await batched_bulk_remove_folder(all_ids, folder_token)
        : await batched_bulk_add_folder(all_ids, folder_token);

      const failed_message_ids = new Set(batch_result.failed_ids);
      const failed_emails = selected.filter((e) =>
        expand_email_ids(e).some((id) => failed_message_ids.has(id)),
      );
      const succeeded_emails = selected.filter(
        (e) => !failed_emails.includes(e),
      );
      const succeeded_ids = succeeded_emails.flatMap(expand_email_ids);
      if (failed_emails.length > 0) {
        for (const email of failed_emails) {
          update_email(email.id, {
            folders: previous_states.get(email.id) ?? [],
          });
        }
        if (!should_remove && is_inbox) {
          reindex_ids(failed_emails.flatMap(expand_email_ids));
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        }
      }
      for (const email of succeeded_emails) {
        emit_mail_item_updated({
          id: email.id,
          folders: compute_next_folders(email.id),
        });
      }
      show_bulk_result_toast({
        result: bulk_action_result(
          selected.map((e) => e.id),
          failed_emails.map((e) => e.id),
        ),
        t,
        success_message: should_remove
          ? t("common.conversations_removed_from_folder", {
              count: succeeded_emails.length,
              folder: folder_name,
            })
          : t("common.conversations_moved_to_folder", {
              count: succeeded_emails.length,
              folder: folder_name,
            }),
        error_message: t("common.failed_to_update_emails"),
        action_type: "folder",
        email_ids: succeeded_ids,
        on_undo: async () => {
          if (should_remove) {
            await batched_bulk_add_folder(succeeded_ids, folder_token);
            remove_index_ids(succeeded_ids);
          } else {
            await batched_bulk_remove_folder(succeeded_ids, folder_token);
            reindex_ids(succeeded_ids);
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    },
    [
      email_state.emails,
      folders_lookup,
      update_email,
      current_view,
      is_drafts_view,
      is_scheduled_view,
      t,
    ],
  );

  const handle_toolbar_toggle_tag = useCallback(
    async (tag_token: string, should_remove: boolean): Promise<void> => {
      if (is_drafts_view || is_scheduled_view) return;
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;
      const tag_data = tags_lookup.get(tag_token);
      const tag_name = tag_data?.name || t("common.label_fallback");
      const all_ids = selected.flatMap(expand_email_ids);
      const previous_states = new Map(
        selected.map((e) => [e.id, e.tags || []]),
      );

      for (const email of selected) {
        if (should_remove) {
          update_email(email.id, {
            tags: (email.tags || []).filter((t) => t.id !== tag_token),
          });
        } else {
          update_email(email.id, {
            tags: [
              ...(email.tags || []),
              {
                id: tag_token,
                name: tag_name,
                color: tag_data?.color,
                icon: tag_data?.icon,
              },
            ],
          });
        }
      }
      const batch_result = should_remove
        ? await batched_bulk_remove_tag(all_ids, tag_token)
        : await batched_bulk_add_tag(all_ids, tag_token);

      const failed_message_ids = new Set(batch_result.failed_ids);
      const failed_emails = selected.filter((e) =>
        expand_email_ids(e).some((id) => failed_message_ids.has(id)),
      );
      const succeeded_emails = selected.filter(
        (e) => !failed_emails.includes(e),
      );
      const result = bulk_action_result(
        selected.map((e) => e.id),
        failed_emails.map((e) => e.id),
      );

      for (const email of failed_emails) {
        update_email(email.id, { tags: previous_states.get(email.id) ?? [] });
      }
      for (const email of succeeded_emails) {
        emit_mail_item_updated({
          id: email.id,
          tags: should_remove
            ? (previous_states.get(email.id) ?? []).filter(
                (tag) => tag.id !== tag_token,
              )
            : [
                ...(previous_states.get(email.id) ?? []),
                {
                  id: tag_token,
                  name: tag_name,
                  color: tag_data?.color,
                  icon: tag_data?.icon,
                },
              ],
        });
      }

      const succeeded_ids = succeeded_emails.flatMap(expand_email_ids);

      show_bulk_result_toast({
        result,
        t,
        success_message: should_remove
          ? t("common.conversations_removed_label", {
              count: bulk_succeeded_ids(result).length,
              label: tag_name,
            })
          : t("common.conversations_added_label", {
              count: bulk_succeeded_ids(result).length,
              label: tag_name,
            }),
        error_message: should_remove
          ? t("common.failed_to_remove_labels")
          : t("common.failed_to_add_labels"),
        action_type: "folder",
        email_ids: succeeded_ids,
        on_undo: async () => {
          if (should_remove) {
            await batched_bulk_add_tag(succeeded_ids, tag_token);
          } else {
            await batched_bulk_remove_tag(succeeded_ids, tag_token);
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
    },
    [
      email_state.emails,
      tags_lookup,
      update_email,
      is_drafts_view,
      is_scheduled_view,
      t,
    ],
  );

  return {
    handle_toolbar_toggle_folder,
    handle_toolbar_toggle_tag,
  };
}
