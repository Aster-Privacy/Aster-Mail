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
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { Spinner } from "@/components/ui/spinner";
import { SearchIcon, SnoozeIcon } from "@/components/common/icons";
import { SearchModal } from "@/components/search/search_modal";
import { CommandPalette } from "@/components/search/command_palette";
import { KeyboardShortcutsModal } from "@/components/modals/keyboard_shortcuts_modal";
import { SenderActionModal } from "@/components/modals/sender_action_modal";
import { MassUnsubscribeModal } from "@/components/modals/mass_unsubscribe_modal";
import {
  list_mail_items,
  bulk_update_mail_items,
  type MailItem,
} from "@/services/api/mail";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { use_folders, has_protected_folder_label } from "@/hooks/use_folders";
import { is_mac_platform } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

function ChevronDownIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

function BatchIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 2v11h3v9l7-12h-4l4-8z" />
    </svg>
  );
}

interface InboxHeaderProps {
  on_settings_click: () => void;
  view_title: string;
  email_count: number;
  on_compose?: () => void;
}

export function InboxHeader({
  on_settings_click,
  view_title,
  email_count,
  on_compose,
}: InboxHeaderProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const {
    state: { folders },
  } = use_folders();
  const [is_search_open, set_is_search_open] = useState(false);
  const search_anchor_ref = useRef<HTMLDivElement>(null);
  const [is_command_palette_open, set_is_command_palette_open] =
    useState(false);
  const [is_shortcuts_open, set_is_shortcuts_open] = useState(false);
  const [sender_action_modal, set_sender_action_modal] = useState<{
    is_open: boolean;
    action_type: "archive" | "delete" | "move";
  }>({ is_open: false, action_type: "archive" });
  const [is_unsubscribe_open, set_is_unsubscribe_open] = useState(false);
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const is_mac = is_mac_platform();

  const handle_batch_action = useCallback(
    async (action: string) => {
      if (action === "archive_from_sender") {
        set_sender_action_modal({ is_open: true, action_type: "archive" });

        return;
      }
      if (action === "delete_from_sender") {
        set_sender_action_modal({ is_open: true, action_type: "delete" });

        return;
      }
      if (action === "move_from_sender") {
        set_sender_action_modal({ is_open: true, action_type: "move" });

        return;
      }
      if (action === "unsubscribe_bulk") {
        set_is_unsubscribe_open(true);

        return;
      }

      set_loading_action(action);
      try {
        if (action === "archive_all_read") {
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
            const read_ids = all_items
              .filter(
                (item) =>
                  item.metadata?.is_read &&
                  !item.metadata?.is_archived &&
                  !item.metadata?.is_trashed &&
                  !has_protected_folder_label(item.labels),
              )
              .map((item) => item.id);

            if (read_ids.length > 0) {
              await bulk_update_mail_items({ ids: read_ids });
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              show_action_toast({
                message: t("common.emails_archived", {
                  count: String(read_ids.length),
                }),
                action_type: "archive",
                email_ids: read_ids,
                on_undo: async () => {
                  await bulk_update_mail_items({
                    ids: read_ids,
                  });
                  window.dispatchEvent(
                    new CustomEvent("astermail:mail-soft-refresh"),
                  );
                },
              });
            } else {
              show_action_toast({
                message: t("common.no_read_emails_to_archive"),
                action_type: "read",
                email_ids: [],
              });
            }
          }
        } else if (action === "mark_all_read") {
          let cancelled = false;

          show_action_toast({
            message: t("common.scanning_mailbox"),
            action_type: "progress",
            email_ids: [],
            progress: { completed: 0, total: 1 },
            on_cancel: () => {
              cancelled = true;
            },
          });

          let all_items: MailItem[] = [];
          let cursor: string | undefined;
          let page_count = 0;

          do {
            if (cancelled) break;
            const response = await list_mail_items({
              item_type: "received",
              cursor,
            });

            if (!response.data?.items) break;
            all_items.push(...response.data.items);
            cursor = response.data.next_cursor;
            page_count++;
            update_progress_toast(page_count, cursor ? page_count + 1 : page_count, t);
          } while (cursor);

          if (!cancelled) {
            const unread_ids = all_items
              .filter(
                (item) =>
                  !item.metadata?.is_read &&
                  !item.metadata?.is_trashed &&
                  !has_protected_folder_label(item.labels),
              )
              .map((item) => item.id);

            if (unread_ids.length > 0) {
              const batch_size = 200;
              const total_batches = Math.ceil(unread_ids.length / batch_size);

              for (let i = 0; i < total_batches; i++) {
                if (cancelled) break;
                const batch = unread_ids.slice(i * batch_size, (i + 1) * batch_size);

                show_action_toast({
                  message: t("common.marking_as_read_count", {
                    completed: String(Math.min((i + 1) * batch_size, unread_ids.length)),
                    total: String(unread_ids.length),
                  }),
                  action_type: "progress",
                  email_ids: [],
                  progress: {
                    completed: (i + 1) * batch_size,
                    total: unread_ids.length,
                  },
                  on_cancel: () => {
                    cancelled = true;
                  },
                });

                await bulk_update_mail_items({ ids: batch });
              }

              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));

              if (!cancelled) {
                show_action_toast({
                  message: t("common.emails_marked_as_read", {
                    count: String(unread_ids.length),
                  }),
                  action_type: "read",
                  email_ids: unread_ids,
                  on_undo: async () => {
                    await bulk_update_mail_items({
                      ids: unread_ids,
                    });
                    window.dispatchEvent(
                      new CustomEvent("astermail:mail-soft-refresh"),
                    );
                  },
                });
              } else {
                hide_action_toast();
              }
            } else {
              show_action_toast({
                message: t("common.no_unread_emails"),
                action_type: "read",
                email_ids: [],
              });
            }
          } else {
            hide_action_toast();
          }
        } else if (action === "delete_old") {
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

          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
          const old_ids = all_items
            .filter(
              (item) =>
                new Date(item.message_ts ?? item.created_at) <
                  thirty_days_ago &&
                !item.metadata?.is_trashed &&
                !has_protected_folder_label(item.labels),
            )
            .map((item) => item.id);

          if (old_ids.length > 0) {
            await bulk_update_mail_items({ ids: old_ids });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: t("common.emails_moved_to_trash", {
                count: String(old_ids.length),
              }),
              action_type: "trash",
              email_ids: old_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: old_ids,
                });
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          } else {
            show_action_toast({
              message: t("common.no_emails_older_than_30_days"),
              action_type: "read",
              email_ids: [],
            });
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

          const newsletter_ids = all_items
            .filter(
              (item) =>
                !item.metadata?.is_archived &&
                !item.metadata?.is_trashed &&
                !has_protected_folder_label(item.labels),
            )
            .map((item) => item.id);

          if (newsletter_ids.length > 0) {
            await bulk_update_mail_items({
              ids: newsletter_ids,
            });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: t("common.emails_archived", {
                count: String(newsletter_ids.length),
              }),
              action_type: "archive",
              email_ids: newsletter_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: newsletter_ids,
                });
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }
        } else if (action === "snooze_similar") {
          set_is_unsubscribe_open(true);
        }
      } finally {
        set_loading_action(null);
      }
    },
    [t],
  );

  const handle_view_change = (key: string) => {
    const routes: Record<string, string> = {
      inbox: "/",
      starred: "/starred",
      sent: "/sent",
      drafts: "/drafts",
      scheduled: "/scheduled",
      archive: "/archive",
      spam: "/spam",
      trash: "/trash",
    };

    const route = routes[key];

    if (route) {
      navigate(route);
    }
  };

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const is_input =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e["key"] === "k") {
        e.preventDefault();
        set_is_search_open(true);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e["key"] === "p") {
        e.preventDefault();
        set_is_command_palette_open(true);
      } else if (e["key"] === "?" && !is_input) {
        e.preventDefault();
        set_is_shortcuts_open(true);
      }
    };

    document.addEventListener("keydown", handle_keydown);

    return () => document.removeEventListener("keydown", handle_keydown);
  }, []);

  return (
    <>
      <div
        className="flex items-center justify-between px-6 py-3 border-b transition-colors duration-200"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className="no_scale flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer select-none transition-colors focus:outline-none focus-visible:outline-none"
                  role="button"
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    lineHeight: "1.5",
                    color: "var(--text-primary)",
                  }}
                  tabIndex={0}
                >
                  <span>{view_title}</span>
                  <ChevronDownIcon />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{t("mail.views")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("inbox")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">
                      {t("mail.inbox")}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      340
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("starred")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">
                      {t("mail.starred")}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      3
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("sent")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">
                      {t("mail.sent")}
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("drafts")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">
                      {t("mail.drafts")}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      8
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handle_view_change("scheduled")}
                >
                  <span className="text-sm font-normal">
                    {t("mail.scheduled")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("common.folders")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("archive")}>
                  <span className="text-sm font-normal">
                    {t("mail.archive")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("spam")}>
                  <span className="text-sm font-normal">{t("mail.spam")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("trash")}>
                  <span className="text-sm font-normal">{t("mail.trash")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm text-muted-foreground">{email_count}</span>
          </div>

          <div
            ref={search_anchor_ref}
            className="relative group"
            data-onboarding="search-bar"
          >
            <SearchIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              size={16}
              style={{ color: "var(--text-muted)" }}
            />
            <Input
              readOnly
              className="pl-9 pr-14 w-80 cursor-pointer"
              placeholder={t("common.search_anything")}
              size="md"
              type="text"
              onClick={() => set_is_search_open(true)}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs font-medium rounded cursor-pointer z-10 transition-colors"
              style={{
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
              }}
              onClick={() => set_is_search_open(true)}
            >
              {is_mac ? "⌘ K" : "Ctrl+K"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="no_scale p-2 rounded-lg flex items-center justify-center w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex-shrink-0 transition-colors focus:outline-none"
                style={{
                  width: "40px",
                  height: "40px",
                  minWidth: "40px",
                  minHeight: "40px",
                  maxWidth: "40px",
                  maxHeight: "40px",
                  transform: "none",
                  color: "var(--text-secondary)",
                }}
              >
                <BatchIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuLabel>{t("mail.quick_actions")}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("mark_all_read")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "mark_all_read" && <Spinner size="xs" />}
                  {t("mail.mark_all_read")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("archive_all_read")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "archive_all_read" && (
                    <Spinner size="xs" />
                  )}
                  {t("mail.archive_all_read_emails")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("delete_old")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "delete_old" && <Spinner size="xs" />}
                  {t("mail.delete_emails_older_than_30_days")}
                </span>
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
                <span className="flex items-center gap-2">
                  <SnoozeIcon size={14} />
                  {t("mail.snooze_similar_emails")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("unsubscribe_bulk")}
              >
                <span className="flex items-center gap-2">
                  <SnoozeIcon size={14} />
                  {t("mail.bulk_unsubscribe")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("archive_newsletters")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "archive_newsletters" && (
                    <Spinner size="xs" />
                  )}
                  {t("mail.archive_all_newsletters")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="no_scale p-2 rounded-lg flex items-center justify-center w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex-shrink-0 transition-colors focus:outline-none"
                style={{
                  width: "40px",
                  height: "40px",
                  minWidth: "40px",
                  minHeight: "40px",
                  maxWidth: "40px",
                  maxHeight: "40px",
                  transform: "none",
                  color: "var(--text-secondary)",
                }}
              >
                <FilterIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("mail.filter")}</DropdownMenuLabel>
              <DropdownMenuItem>{t("mail.all_emails")}</DropdownMenuItem>
              <DropdownMenuItem>{t("mail.unread_only")}</DropdownMenuItem>
              <DropdownMenuItem>{t("mail.starred")}</DropdownMenuItem>
              <DropdownMenuItem>{t("mail.with_attachments")}</DropdownMenuItem>
              <DropdownMenuItem>{t("mail.important")}</DropdownMenuItem>
              <DropdownMenuItem>{t("mail.sent_by_me")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className="p-2 rounded-lg transition-colors hover_bg focus:outline-none"
            data-onboarding="settings-button"
            style={{ color: "var(--text-secondary)" }}
            onClick={on_settings_click}
          >
            <CogIcon />
          </button>
        </div>
      </div>
      <SearchModal
        anchor_ref={search_anchor_ref}
        is_open={is_search_open}
        on_close={() => set_is_search_open(false)}
        on_compose={on_compose}
      />
      <CommandPalette
        is_open={is_command_palette_open}
        on_close={() => set_is_command_palette_open(false)}
        on_compose={on_compose}
        on_settings={on_settings_click}
        on_shortcuts={() => set_is_shortcuts_open(true)}
      />
      <KeyboardShortcutsModal
        is_open={is_shortcuts_open}
        on_close={() => set_is_shortcuts_open(false)}
      />
      <SenderActionModal
        action_type={sender_action_modal.action_type}
        folders={folders.map(
          (f: { folder_token: string; name: string; color?: string }) => ({
            token: f.folder_token,
            name: f.name,
            color: f.color,
          }),
        )}
        is_open={sender_action_modal.is_open}
        on_close={() =>
          set_sender_action_modal({ ...sender_action_modal, is_open: false })
        }
      />
      <MassUnsubscribeModal
        is_open={is_unsubscribe_open}
        on_close={() => set_is_unsubscribe_open(false)}
      />
    </>
  );
}
