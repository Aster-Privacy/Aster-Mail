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
import type { InboxFilterType, MailItemMetadata } from "@/types/email";

import { useState, useCallback } from "react";
import {
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { REFRESH_STATE_MS } from "@/constants/timings";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { SenderActionModal } from "@/components/modals/sender_action_modal";
import { MassUnsubscribeModal } from "@/components/modals/mass_unsubscribe_modal";
import { SnoozeSimilarModal } from "@/components/modals/snooze_similar_modal";
import { ArchiveNewslettersModal } from "@/components/modals/archive_newsletters_modal";
import { batched_bulk_patch_metadata } from "@/services/api/mail";
import {
  encrypt_mail_metadata,
  metadata_flag_patch,
} from "@/services/crypto/mail_metadata";
import { batched_archive, batched_unarchive } from "@/services/api/archive";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  emit_mail_items_removed,
  emit_mail_item_updated,
} from "@/hooks/mail_events";
import { use_folders, has_protected_folder_label } from "@/hooks/use_folders";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  decrypt_items_metadata_for_action,
  scan_received_items,
} from "@/services/bulk_mail_scan";
import { map_in_chunks } from "@/lib/scheduling";

const QUICK_ACTION_CONFIRM_KEYS: Record<
  string,
  { title: string; message: string }
> = {
  mark_all_read: {
    title: "mail.mark_all_read_confirm_title",
    message: "mail.mark_all_read_confirm_message",
  },
  archive_all_read: {
    title: "mail.archive_all_read_confirm_title",
    message: "mail.archive_all_read_confirm_message",
  },
  delete_old: {
    title: "mail.delete_old_confirm_title",
    message: "mail.delete_old_confirm_message",
  },
};

interface HeaderToolbarProps {
  on_settings_click: () => void;
  on_quick_settings_click?: () => void;
  is_trash_view: boolean;
  on_empty_trash?: () => void;
  trash_count: number;
  is_spam_view: boolean;
  on_empty_spam?: () => void;
  spam_count: number;
  handle_refresh: () => void;
  is_refreshing: boolean;
  handle_batch_action: (action: string) => Promise<void>;
  filter_slot?: React.ReactNode;
  leading_slot?: React.ReactNode;
  hide_refresh?: boolean;
  hide_quick_actions?: boolean;
}

export function HeaderToolbar({
  on_settings_click: _on_settings_click,
  on_quick_settings_click: _on_quick_settings_click,
  is_trash_view,
  on_empty_trash,
  trash_count,
  is_spam_view,
  on_empty_spam,
  spam_count,
  handle_refresh,
  is_refreshing,
  handle_batch_action,
  filter_slot,
  leading_slot,
  hide_refresh = false,
  hide_quick_actions = false,
}: HeaderToolbarProps) {
  const { t } = use_i18n();

  return (
    <>
      {is_trash_view && on_empty_trash && trash_count > 0 && (
        <Button
          className="hidden md:flex h-8 px-3 gap-1.5 text-xs font-medium text-red-400/80 hover:text-red-500 hover:bg-red-500/10"
          size="md"
          variant="ghost"
          onClick={on_empty_trash}
        >
          {t("mail.empty_trash_button")}
        </Button>
      )}

      {is_spam_view && on_empty_spam && spam_count > 0 && (
        <Button
          className="hidden md:flex h-8 px-3 gap-1.5 text-xs font-medium text-red-400/80 hover:text-red-500 hover:bg-red-500/10"
          size="md"
          variant="ghost"
          onClick={on_empty_spam}
        >
          {t("mail.empty_spam_button")}
        </Button>
      )}

      {leading_slot}

      {!hide_refresh && (
        <Tooltip tip={t("common.refresh")}>
          <Button
            className="hidden md:flex h-8 w-8 text-[var(--icon-muted)] hover:text-[var(--icon-active)] hover:bg-[var(--bg-hover)]"
            size="icon"
            variant="ghost"
            onClick={handle_refresh}
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${is_refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </Tooltip>
      )}

      {filter_slot}

      {!hide_quick_actions && (
        <DropdownMenu>
          <Tooltip tip={t("mail.quick_actions")}>
            <DropdownMenuTrigger asChild>
              <Button
                className="hidden md:flex h-8 w-8 text-[var(--icon-muted)] hover:text-[var(--icon-active)] hover:bg-[var(--bg-hover)]"
                size="icon"
                variant="ghost"
              >
                <BoltIcon className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("mail.quick_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("mark_all_read")}
            >
              {t("mail.mark_all_read")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_all_read")}
            >
              {t("mail.archive_all_read_emails")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handle_batch_action("delete_old")}>
              {t("mail.delete_emails_older_than_30_days")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("mail.sender_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_from_sender")}
            >
              {t("mail.archive_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("delete_from_sender")}
            >
              {t("mail.delete_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("move_from_sender")}
            >
              {t("mail.move_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("mail.smart_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("snooze_similar")}
            >
              {t("mail.snooze_similar_emails")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("unsubscribe_bulk")}
            >
              {t("mail.bulk_unsubscribe")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_newsletters")}
            >
              {t("mail.archive_all_newsletters")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

interface MobileOverflowMenuProps {
  handle_refresh: () => void;
  active_filter: InboxFilterType;
  on_filter_change?: (filter: InboxFilterType) => void;
  handle_batch_action: (action: string) => Promise<void>;
  on_settings_click: () => void;
}

export function MobileOverflowMenu({
  handle_refresh,
  active_filter,
  on_filter_change,
  handle_batch_action,
  on_settings_click,
}: MobileOverflowMenuProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const sort_order = preferences.inbox_sort_order ?? "newest_first";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="md:hidden h-8 w-8" size="icon" variant="ghost">
          <EllipsisVerticalIcon className="w-4 h-4 text-[var(--icon-muted)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handle_refresh}>
          <ArrowPathIcon className="w-4 h-4 mr-2" />
          {t("common.refresh")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mail.filter")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => on_filter_change?.("all")}>
          <span className="w-4 mr-2">
            {active_filter === "all" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.all_emails")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("unread")}>
          <span className="w-4 mr-2">
            {active_filter === "unread" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.unread_only")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("read")}>
          <span className="w-4 mr-2">
            {active_filter === "read" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.read_only")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("attachments")}>
          <span className="w-4 mr-2">
            {active_filter === "attachments" && (
              <CheckIcon className="w-4 h-4" />
            )}
          </span>
          {t("mail.with_attachments")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mail.sort_by")}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() =>
            update_preference("inbox_sort_order", "newest_first", true)
          }
        >
          <span className="w-4 mr-2">
            {sort_order === "newest_first" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.newest_first")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            update_preference("inbox_sort_order", "oldest_first", true)
          }
        >
          <span className="w-4 mr-2">
            {sort_order === "oldest_first" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.oldest_first")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mail.quick_actions")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handle_batch_action("mark_all_read")}>
          {t("mail.mark_all_read")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handle_batch_action("archive_all_read")}
        >
          {t("mail.archive_all_read_emails")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle_batch_action("delete_old")}>
          {t("mail.delete_emails_older_than_30_days")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mail.sender_actions")}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => handle_batch_action("archive_from_sender")}
        >
          {t("mail.archive_all_from_sender")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handle_batch_action("delete_from_sender")}
        >
          {t("mail.delete_all_from_sender")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handle_batch_action("move_from_sender")}
        >
          {t("mail.move_all_from_sender")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mail.smart_actions")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handle_batch_action("snooze_similar")}>
          {t("mail.snooze_similar_emails")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handle_batch_action("unsubscribe_bulk")}
        >
          {t("mail.bulk_unsubscribe")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handle_batch_action("archive_newsletters")}
        >
          {t("mail.archive_all_newsletters")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={on_settings_click}>
          <Cog6ToothIcon className="w-4 h-4 mr-2" />
          {t("settings.title")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ToolbarModalsProps {
  is_sender_modal_open: boolean;
  set_is_sender_modal_open: (open: boolean) => void;
  sender_modal_action: "archive" | "delete" | "move";
  is_unsubscribe_modal_open: boolean;
  set_is_unsubscribe_modal_open: (open: boolean) => void;
  is_snooze_modal_open: boolean;
  set_is_snooze_modal_open: (open: boolean) => void;
  is_archive_newsletters_modal_open: boolean;
  set_is_archive_newsletters_modal_open: (open: boolean) => void;
  pending_quick_action: string | null;
  handle_quick_action_confirm: () => void;
  handle_quick_action_cancel: () => void;
  handle_quick_action_dont_ask_again: () => void | Promise<void>;
}

export function ToolbarModals({
  is_sender_modal_open,
  set_is_sender_modal_open,
  sender_modal_action,
  is_unsubscribe_modal_open,
  set_is_unsubscribe_modal_open,
  is_snooze_modal_open,
  set_is_snooze_modal_open,
  is_archive_newsletters_modal_open,
  set_is_archive_newsletters_modal_open,
  pending_quick_action,
  handle_quick_action_confirm,
  handle_quick_action_cancel,
  handle_quick_action_dont_ask_again,
}: ToolbarModalsProps) {
  const { state: folders_state } = use_folders();
  const { t } = use_i18n();
  const quick_action_copy = pending_quick_action
    ? QUICK_ACTION_CONFIRM_KEYS[pending_quick_action]
    : null;

  return (
    <>
      <SenderActionModal
        action_type={sender_modal_action}
        folders={folders_state.folders
          .filter((f) => !f.is_system)
          .map((f) => ({
            token: f.folder_token,
            name: f.name,
            color: f.color,
          }))}
        is_open={is_sender_modal_open}
        on_close={() => set_is_sender_modal_open(false)}
      />

      <MassUnsubscribeModal
        is_open={is_unsubscribe_modal_open}
        on_close={() => set_is_unsubscribe_modal_open(false)}
      />

      <SnoozeSimilarModal
        is_open={is_snooze_modal_open}
        on_close={() => set_is_snooze_modal_open(false)}
      />

      <ArchiveNewslettersModal
        is_open={is_archive_newsletters_modal_open}
        on_close={() => set_is_archive_newsletters_modal_open(false)}
      />

      <ConfirmationModal
        show_dont_ask_again
        is_open={quick_action_copy !== null}
        message={
          quick_action_copy
            ? t(quick_action_copy.message as Parameters<typeof t>[0])
            : ""
        }
        title={
          quick_action_copy
            ? t(quick_action_copy.title as Parameters<typeof t>[0])
            : ""
        }
        variant="info"
        on_cancel={handle_quick_action_cancel}
        on_confirm={handle_quick_action_confirm}
        on_dont_ask_again={handle_quick_action_dont_ask_again}
      />
    </>
  );
}

export function use_batch_actions(t: ReturnType<typeof use_i18n>["t"]) {
  const [is_sender_modal_open, set_is_sender_modal_open] = useState(false);
  const [sender_modal_action, set_sender_modal_action] = useState<
    "archive" | "delete" | "move"
  >("archive");
  const [is_unsubscribe_modal_open, set_is_unsubscribe_modal_open] =
    useState(false);
  const [is_snooze_modal_open, set_is_snooze_modal_open] = useState(false);
  const [
    is_archive_newsletters_modal_open,
    set_is_archive_newsletters_modal_open,
  ] = useState(false);
  const [is_refreshing, set_is_refreshing] = useState(false);
  const [pending_quick_action, set_pending_quick_action] = useState<
    string | null
  >(null);
  const { preferences, update_preference } = use_preferences();

  const handle_refresh = useCallback(() => {
    if (is_refreshing) return;
    set_is_refreshing(true);
    window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    invalidate_mail_stats();
    show_action_toast({
      message: t("common.inbox_refreshed"),
      action_type: "refresh",
      email_ids: [],
    });
    setTimeout(() => {
      set_is_refreshing(false);
    }, REFRESH_STATE_MS);
  }, [is_refreshing, t]);

  const execute_batch_action = useCallback(
    async (action: string) => {
      if (action === "archive_from_sender") {
        set_sender_modal_action("archive");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "delete_from_sender") {
        set_sender_modal_action("delete");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "move_from_sender") {
        set_sender_modal_action("move");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "unsubscribe_bulk") {
        set_is_unsubscribe_modal_open(true);

        return;
      } else if (action === "snooze_similar") {
        set_is_snooze_modal_open(true);

        return;
      } else if (action === "archive_all_read") {
        const all_items = (await scan_received_items()).items;

        {
          await decrypt_items_metadata_for_action(all_items);

          const read_items = all_items.filter(
            (item) =>
              item.metadata?.is_read &&
              !item.metadata?.is_archived &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (read_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              read_items,
              async (item) => {
                const updated_metadata = {
                  ...item.metadata!,
                  is_archived: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let metadata_ok_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const patch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              metadata_ok_ids = patch_result.succeeded_ids;
              hide_action_toast();
            }

            let archived_ids: string[] = [];

            if (metadata_ok_ids.length > 0) {
              stale_all_view_caches();

              const archive_result = await batched_archive(metadata_ok_ids);

              archived_ids = archive_result.succeeded_ids;
            }

            const archived_set = new Set(archived_ids);
            const archived_items = read_items.filter((item) =>
              archived_set.has(item.id),
            );

            if (archived_ids.length > 0) {
              emit_mail_items_removed({ ids: archived_ids });
              invalidate_mail_stats();
            }

            show_action_toast({
              message: t("common.emails_archived", {
                count: String(archived_ids.length),
              }),
              action_type: "archive",
              email_ids: archived_ids,
              on_undo: async () => {
                const undo_updates = await map_in_chunks(
                  archived_items,
                  async (item) => {
                    const updated_metadata = {
                      ...item.metadata!,
                      is_archived: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo.length > 0) {
                  await batched_bulk_patch_metadata(valid_undo);
                }

                await batched_unarchive(archived_ids);
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }
        }
      } else if (action === "mark_all_read") {
        const all_items = (await scan_received_items()).items;

        {
          await decrypt_items_metadata_for_action(all_items);

          const unread_items = all_items.filter(
            (item) =>
              !item.metadata?.is_read &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (unread_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              unread_items,
              async (item) => {
                const current_metadata: MailItemMetadata = item.metadata ?? {
                  is_read: false,
                  is_starred: false,
                  is_pinned: false,
                  is_trashed: false,
                  is_archived: false,
                  is_spam: false,
                  size_bytes: 0,
                  has_attachments: false,
                  attachment_count: 0,
                  message_ts: item.message_ts ?? item.created_at,
                  item_type: item.item_type,
                };
                const updated_metadata = { ...current_metadata, is_read: true };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let succeeded_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const batch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              succeeded_ids = batch_result.succeeded_ids;
              hide_action_toast();
            }

            const succeeded_set = new Set(succeeded_ids);
            const succeeded_items = unread_items.filter((item) =>
              succeeded_set.has(item.id),
            );

            if (succeeded_items.length > 0) {
              adjust_unread_count(-succeeded_items.length);

              for (const item of succeeded_items) {
                emit_mail_item_updated({ id: item.id, is_read: true });
              }
              invalidate_mail_stats();
            }

            show_action_toast({
              message: t("common.emails_marked_as_read", {
                count: String(succeeded_items.length),
              }),
              action_type: "read",
              email_ids: succeeded_items.map((item) => item.id),
              on_undo: async () => {
                adjust_unread_count(succeeded_items.length);

                const undo_updates = await map_in_chunks(
                  succeeded_items,
                  async (item) => {
                    const current_metadata: MailItemMetadata =
                      item.metadata ?? {
                        is_read: false,
                        is_starred: false,
                        is_pinned: false,
                        is_trashed: false,
                        is_archived: false,
                        is_spam: false,
                        size_bytes: 0,
                        has_attachments: false,
                        attachment_count: 0,
                        message_ts: item.message_ts ?? item.created_at,
                        item_type: item.item_type,
                      };
                    const updated_metadata = {
                      ...current_metadata,
                      is_read: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo_updates.length > 0) {
                  await batched_bulk_patch_metadata(valid_undo_updates);
                }

                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }
        }
      } else if (action === "delete_old") {
        const all_items = (await scan_received_items()).items;

        {
          await decrypt_items_metadata_for_action(all_items);

          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);

          const old_items = all_items.filter((item) => {
            if (has_protected_folder_label(item.labels)) return false;
            const item_date = new Date(item.message_ts ?? item.created_at);

            return item_date < thirty_days_ago && !item.metadata?.is_trashed;
          });

          if (old_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              old_items,
              async (item) => {
                const current_metadata: MailItemMetadata = item.metadata ?? {
                  is_read: false,
                  is_starred: false,
                  is_pinned: false,
                  is_trashed: false,
                  is_archived: false,
                  is_spam: false,
                  size_bytes: 0,
                  has_attachments: false,
                  attachment_count: 0,
                  message_ts: item.message_ts ?? item.created_at,
                  item_type: item.item_type,
                };
                const updated_metadata = {
                  ...current_metadata,
                  is_trashed: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let succeeded_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const patch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              succeeded_ids = patch_result.succeeded_ids;
              hide_action_toast();
            }

            const succeeded_set = new Set(succeeded_ids);
            const succeeded_items = old_items.filter((item) =>
              succeeded_set.has(item.id),
            );

            if (succeeded_ids.length > 0) {
              emit_mail_items_removed({ ids: succeeded_ids });
              invalidate_mail_stats();
            }

            show_action_toast({
              message: t("common.emails_moved_to_trash", {
                count: String(succeeded_ids.length),
              }),
              action_type: "trash",
              email_ids: succeeded_ids,
              on_undo: async () => {
                const undo_updates = await map_in_chunks(
                  succeeded_items,
                  async (item) => {
                    const current_metadata: MailItemMetadata =
                      item.metadata ?? {
                        is_read: false,
                        is_starred: false,
                        is_pinned: false,
                        is_trashed: false,
                        is_archived: false,
                        is_spam: false,
                        size_bytes: 0,
                        has_attachments: false,
                        attachment_count: 0,
                        message_ts: item.message_ts ?? item.created_at,
                        item_type: item.item_type,
                      };
                    const updated_metadata = {
                      ...current_metadata,
                      is_trashed: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo_updates.length > 0) {
                  await batched_bulk_patch_metadata(valid_undo_updates);
                }

                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          } else {
            show_action_toast({
              message: t("common.no_emails_older_than_30_days"),
              action_type: "archive",
              email_ids: [],
            });
          }
        }
      } else if (action === "archive_newsletters") {
        set_is_archive_newsletters_modal_open(true);

        return;
      }
    },
    [t],
  );

  const handle_batch_action = useCallback(
    async (action: string) => {
      if (
        action in QUICK_ACTION_CONFIRM_KEYS &&
        preferences.confirm_before_quick_actions
      ) {
        set_pending_quick_action(action);

        return;
      }

      await execute_batch_action(action);
    },
    [execute_batch_action, preferences.confirm_before_quick_actions],
  );

  const handle_quick_action_confirm = useCallback(() => {
    const action = pending_quick_action;

    set_pending_quick_action(null);
    if (action) void execute_batch_action(action);
  }, [pending_quick_action, execute_batch_action]);

  const handle_quick_action_cancel = useCallback(() => {
    set_pending_quick_action(null);
  }, []);

  const handle_quick_action_dont_ask_again = useCallback(() => {
    update_preference("confirm_before_quick_actions", false, true);
  }, [update_preference]);

  return {
    is_refreshing,
    handle_refresh,
    handle_batch_action,
    is_sender_modal_open,
    set_is_sender_modal_open,
    sender_modal_action,
    is_unsubscribe_modal_open,
    set_is_unsubscribe_modal_open,
    is_snooze_modal_open,
    set_is_snooze_modal_open,
    is_archive_newsletters_modal_open,
    set_is_archive_newsletters_modal_open,
    pending_quick_action,
    handle_quick_action_confirm,
    handle_quick_action_cancel,
    handle_quick_action_dont_ask_again,
  };
}
