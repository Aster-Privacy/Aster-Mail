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
import {
  list_mail_items,
  bulk_patch_metadata,
  type MailItem,
} from "@/services/api/mail";
import {
  encrypt_mail_metadata,
  decrypt_mail_metadata,
  create_default_metadata,
} from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";
import {
  show_action_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  emit_mail_items_removed,
  emit_mail_item_updated,
} from "@/hooks/mail_events";
import { use_folders, has_protected_folder_label } from "@/hooks/use_folders";
import {
  decrypt_mail_envelope,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { use_i18n } from "@/lib/i18n/context";

interface DecryptedEnvelope {
  from: { name: string; email: string };
  body_html?: string;
  body_text?: string;
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
}

async function decrypt_envelope_for_action(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();
  const vault = get_vault_from_memory();

  try {
    const result = await decrypt_mail_envelope<Record<string, unknown>>(
      encrypted,
      nonce,
      passphrase,
      vault?.identity_key ?? null,
    );

    if (!result) return null;
    const from = normalize_envelope_from(result.from);

    if (!from) return null;

    return {
      from,
      body_html: (result.body_html ?? result.html_body) as string | undefined,
      body_text: (result.body_text ?? result.text_body) as string | undefined,
      list_unsubscribe: result.list_unsubscribe as string | undefined,
      list_unsubscribe_post: result.list_unsubscribe_post as string | undefined,
    };
  } finally {
    if (passphrase) zero_uint8_array(passphrase);
  }
}

async function decrypt_items_metadata_for_action(
  items: MailItem[],
): Promise<void> {
  for (const item of items) {
    if (item.metadata) continue;
    if (!item.encrypted_metadata || !item.metadata_nonce) {
      const is_sent =
        item.item_type === "sent" ||
        item.item_type === "draft" ||
        item.item_type === "scheduled";
      const defaults = create_default_metadata(item.item_type);

      defaults.is_read = is_sent;
      if (item.message_ts) defaults.message_ts = item.message_ts;
      item.metadata = defaults;
      continue;
    }
    try {
      const meta = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );

      item.metadata = meta ?? create_default_metadata(item.item_type);
    } catch {
      item.metadata = create_default_metadata(item.item_type);
    }
  }
}

interface HeaderToolbarProps {
  on_settings_click: () => void;
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
  on_settings_click,
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
            className="hidden md:flex h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
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
                className="hidden md:flex h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
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

      <Tooltip tip={t("settings.title")}>
        <Button
          className="hidden lg:flex h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          data-onboarding="settings-button"
          size="icon"
          variant="ghost"
          onClick={on_settings_click}
        >
          <Cog6ToothIcon className="w-4 h-4" />
        </Button>
      </Tooltip>
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="md:hidden h-8 w-8" size="icon" variant="ghost">
          <EllipsisVerticalIcon className="w-4 h-4 text-[var(--text-secondary)]" />
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
}

export function ToolbarModals({
  is_sender_modal_open,
  set_is_sender_modal_open,
  sender_modal_action,
  is_unsubscribe_modal_open,
  set_is_unsubscribe_modal_open,
  is_snooze_modal_open,
  set_is_snooze_modal_open,
}: ToolbarModalsProps) {
  const { state: folders_state } = use_folders();

  return (
    <>
      <SenderActionModal
        action_type={sender_modal_action}
        folders={folders_state.folders.map((f) => ({
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
  const [is_refreshing, set_is_refreshing] = useState(false);

  const handle_refresh = useCallback(() => {
    if (is_refreshing) return;
    set_is_refreshing(true);
    show_action_toast({
      message: t("common.loading"),
      action_type: "refresh",
      email_ids: [],
    });
    window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    invalidate_mail_stats();
    setTimeout(() => {
      set_is_refreshing(false);
      hide_action_toast();
    }, REFRESH_STATE_MS);
  }, [is_refreshing, t]);

  const handle_batch_action = useCallback(
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
        const response = await list_mail_items({
          item_type: "received",
          limit: 100,
        });

        if (response.data?.items) {
          await decrypt_items_metadata_for_action(response.data.items);

          const read_items = response.data.items.filter(
            (item) =>
              item.metadata?.is_read &&
              !item.metadata?.is_archived &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (read_items.length > 0) {
            const read_ids = read_items.map((item) => item.id);

            const metadata_updates = await Promise.all(
              read_items.map(async (item) => {
                const updated_metadata = {
                  ...item.metadata!,
                  is_archived: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            if (valid_updates.length > 0) {
              await bulk_patch_metadata({ items: valid_updates });
            }

            invalidate_mail_cache();
            await batch_archive({ ids: read_ids, tier: "hot" });
            emit_mail_items_removed({ ids: read_ids });
            invalidate_mail_stats();
            show_action_toast({
              message: t("common.emails_archived", {
                count: String(read_ids.length),
              }),
              action_type: "archive",
              email_ids: read_ids,
              on_undo: async () => {
                const undo_updates = await Promise.all(
                  read_items.map(async (item) => {
                    const updated_metadata = {
                      ...item.metadata!,
                      is_archived: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted ? { id: item.id, ...encrypted } : null;
                  }),
                );

                const valid_undo = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo.length > 0) {
                  await bulk_patch_metadata({ items: valid_undo });
                }

                await batch_unarchive({ ids: read_ids });
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }
        }
      } else if (action === "mark_all_read") {
        const response = await list_mail_items({
          item_type: "received",
          limit: 100,
        });

        if (response.data?.items) {
          await decrypt_items_metadata_for_action(response.data.items);

          const unread_items = response.data.items.filter(
            (item) =>
              !item.metadata?.is_read &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (unread_items.length > 0) {
            adjust_unread_count(-unread_items.length);

            const metadata_updates = await Promise.all(
              unread_items.map(async (item) => {
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

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            if (valid_updates.length > 0) {
              await bulk_patch_metadata({ items: valid_updates });
            }

            for (const item of unread_items) {
              emit_mail_item_updated({ id: item.id, is_read: true });
            }
            invalidate_mail_stats();

            show_action_toast({
              message: t("common.emails_marked_as_read", {
                count: String(unread_items.length),
              }),
              action_type: "read",
              email_ids: unread_items.map((item) => item.id),
              on_undo: async () => {
                adjust_unread_count(unread_items.length);

                const undo_updates = await Promise.all(
                  unread_items.map(async (item) => {
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

                    return encrypted ? { id: item.id, ...encrypted } : null;
                  }),
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo_updates.length > 0) {
                  await bulk_patch_metadata({ items: valid_undo_updates });
                }

                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }
        }
      } else if (action === "delete_old") {
        const response = await list_mail_items({
          item_type: "received",
          limit: 100,
        });

        if (response.data?.items) {
          await decrypt_items_metadata_for_action(response.data.items);

          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);

          const old_items = response.data.items.filter((item) => {
            if (has_protected_folder_label(item.labels)) return false;
            const item_date = new Date(item.message_ts ?? item.created_at);

            return item_date < thirty_days_ago && !item.metadata?.is_trashed;
          });

          if (old_items.length > 0) {
            const metadata_updates = await Promise.all(
              old_items.map(async (item) => {
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

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            emit_mail_items_removed({ ids: old_items.map((item) => item.id) });

            if (valid_updates.length > 0) {
              await bulk_patch_metadata({ items: valid_updates });
            }

            invalidate_mail_stats();

            show_action_toast({
              message: t("common.emails_moved_to_trash", {
                count: String(old_items.length),
              }),
              action_type: "trash",
              email_ids: old_items.map((item) => item.id),
              on_undo: async () => {
                const undo_updates = await Promise.all(
                  old_items.map(async (item) => {
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

                    return encrypted ? { id: item.id, ...encrypted } : null;
                  }),
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo_updates.length > 0) {
                  await bulk_patch_metadata({ items: valid_undo_updates });
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
        let all_items: MailItem[] = [];
        let cursor: string | undefined;

        do {
          const response = await list_mail_items({
            item_type: "received",
            cursor,
          });

          if (!response.data?.items) break;
          all_items.push(...response.data.items);
          cursor = response.data.next_cursor;
        } while (cursor);

        if (all_items.length > 0) {
          await decrypt_items_metadata_for_action(all_items);
          const newsletter_items: MailItem[] = [];

          for (const item of all_items) {
            if (item.metadata?.is_trashed || item.metadata?.is_archived)
              continue;
            if (has_protected_folder_label(item.labels)) continue;

            try {
              const envelope = await decrypt_envelope_for_action(
                item.encrypted_envelope,
                item.envelope_nonce,
              );

              if (!envelope?.from?.email) continue;

              const unsub_info = detect_unsubscribe_info(
                envelope.body_html || "",
                envelope.body_text || "",
                {
                  list_unsubscribe: envelope.list_unsubscribe,
                  list_unsubscribe_post: envelope.list_unsubscribe_post,
                },
              );

              if (unsub_info.has_unsubscribe) {
                newsletter_items.push(item);
              }
            } catch (error) {
              if (import.meta.env.DEV) console.error(error);
              continue;
            }
          }

          if (newsletter_items.length > 0) {
            const newsletter_ids = newsletter_items.map((item) => item.id);

            const metadata_updates = await Promise.all(
              newsletter_items.map(async (item) => {
                const updated_metadata = {
                  ...item.metadata!,
                  is_archived: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            if (valid_updates.length > 0) {
              await bulk_patch_metadata({ items: valid_updates });
            }

            invalidate_mail_cache();
            await batch_archive({ ids: newsletter_ids, tier: "hot" });
            emit_mail_items_removed({ ids: newsletter_ids });
            invalidate_mail_stats();
            show_action_toast({
              message: t("common.newsletters_archived", {
                count: String(newsletter_ids.length),
              }),
              action_type: "archive",
              email_ids: newsletter_ids,
              on_undo: async () => {
                const undo_updates = await Promise.all(
                  newsletter_items.map(async (item) => {
                    const updated_metadata = {
                      ...item.metadata!,
                      is_archived: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted ? { id: item.id, ...encrypted } : null;
                  }),
                );

                const valid_undo = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo.length > 0) {
                  await bulk_patch_metadata({ items: valid_undo });
                }

                await batch_unarchive({ ids: newsletter_ids });
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          } else {
            show_action_toast({
              message: t("common.no_newsletters_found"),
              action_type: "archive",
              email_ids: [],
            });
          }
        }
      }
    },
    [t],
  );

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
  };
}
