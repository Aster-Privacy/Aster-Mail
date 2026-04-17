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

import { show_action_toast } from "@/components/toast/action_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import { bulk_add_folder, bulk_remove_folder } from "@/services/api/mail";
import { bulk_add_tag, bulk_remove_tag } from "@/services/api/tags";

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
      const folder_name = folder_data?.name || "folder";
      const all_ids = selected.flatMap((e) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids
          : [e.id],
      );
      const representative_ids = selected.map((e) => e.id);
      const previous_states = selected.map((e) => ({
        id: e.id,
        folders: e.folders || [],
      }));

      const is_inbox =
        current_view === "inbox" ||
        current_view === "" ||
        current_view === "all" ||
        current_view === "starred" ||
        current_view === "snoozed";

      if (!should_remove && is_inbox) {
        emit_mail_items_removed({ ids: representative_ids });
      } else {
        for (const email of selected) {
          if (should_remove) {
            update_email(email.id, { folders: [] });
          } else {
            update_email(email.id, {
              folders: [
                {
                  folder_token,
                  name: folder_name,
                  color: folder_data?.color,
                },
              ],
            });
          }
        }
      }
      const result = should_remove
        ? await bulk_remove_folder(all_ids, folder_token)
        : await bulk_add_folder(all_ids, folder_token);

      if (result.error) {
        for (const prev of previous_states) {
          update_email(prev.id, { folders: prev.folders });
        }
        if (!should_remove && is_inbox) {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        }

        return;
      }
      for (const email of selected) {
        emit_mail_item_updated({
          id: email.id,
          folders: should_remove
            ? []
            : [
                {
                  folder_token,
                  name: folder_name,
                  color: folder_data?.color,
                },
              ],
        });
      }
      show_action_toast({
        message: should_remove
          ? t("common.conversations_removed_from_folder", {
              count: selected.length,
              folder: folder_name,
            })
          : t("common.conversations_moved_to_folder", {
              count: selected.length,
              folder: folder_name,
            }),
        action_type: "folder",
        email_ids: all_ids,
        on_undo: async () => {
          if (should_remove) {
            await bulk_add_folder(all_ids, folder_token);
          } else {
            await bulk_remove_folder(all_ids, folder_token);
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
    ],
  );

  const handle_toolbar_toggle_tag = useCallback(
    async (tag_token: string, should_remove: boolean): Promise<void> => {
      if (is_drafts_view || is_scheduled_view) return;
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;
      const tag_data = tags_lookup.get(tag_token);
      const tag_name = tag_data?.name || "label";
      const all_ids = selected.flatMap((e) =>
        e.grouped_email_ids && e.grouped_email_ids.length > 1
          ? e.grouped_email_ids
          : [e.id],
      );
      const previous_states = selected.map((e) => ({
        id: e.id,
        tags: e.tags || [],
      }));

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
      const result = should_remove
        ? await bulk_remove_tag(all_ids, tag_token)
        : await bulk_add_tag(all_ids, tag_token);

      if (result.error) {
        for (const prev of previous_states) {
          update_email(prev.id, { tags: prev.tags });
        }

        return;
      }
      for (const email of selected) {
        emit_mail_item_updated({
          id: email.id,
          tags: should_remove
            ? (email.tags || []).filter((t) => t.id !== tag_token)
            : [
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
      show_action_toast({
        message: should_remove
          ? t("common.conversations_removed_label", {
              count: selected.length,
              label: tag_name,
            })
          : t("common.conversations_added_label", {
              count: selected.length,
              label: tag_name,
            }),
        action_type: "folder",
        email_ids: all_ids,
        on_undo: async () => {
          if (should_remove) {
            await bulk_add_tag(all_ids, tag_token);
          } else {
            await bulk_remove_tag(all_ids, tag_token);
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
    ],
  );

  return {
    handle_toolbar_toggle_folder,
    handle_toolbar_toggle_tag,
  };
}
