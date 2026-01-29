import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SearchIcon, SnoozeIcon } from "@/components/icons";
import { SearchModal } from "@/components/search_modal";
import { CommandPalette } from "@/components/command_palette";
import { KeyboardShortcutsModal } from "@/components/keyboard_shortcuts_modal";
import { SenderActionModal } from "@/components/sender_action_modal";
import { MassUnsubscribeModal } from "@/components/mass_unsubscribe_modal";
import { list_mail_items, bulk_update_mail_items } from "@/services/api/mail";
import { show_action_toast } from "@/components/action_toast";
import { use_folders } from "@/hooks/use_folders";

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
  const navigate = useNavigate();
  const {
    state: { folders },
  } = use_folders();
  const [is_search_open, set_is_search_open] = useState(false);
  const [is_command_palette_open, set_is_command_palette_open] =
    useState(false);
  const [is_shortcuts_open, set_is_shortcuts_open] = useState(false);
  const [sender_action_modal, set_sender_action_modal] = useState<{
    is_open: boolean;
    action_type: "archive" | "delete" | "move";
  }>({ is_open: false, action_type: "archive" });
  const [is_unsubscribe_open, set_is_unsubscribe_open] = useState(false);
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const is_mac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const handle_batch_action = useCallback(async (action: string) => {
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
        const response = await list_mail_items({
          item_type: "received",
          limit: 500,
        });

        if (response.data?.items) {
          const read_ids = response.data.items
            .filter(
              (item) => item.metadata?.is_read && !item.metadata?.is_archived && !item.metadata?.is_trashed,
            )
            .map((item) => item.id);

          if (read_ids.length > 0) {
            await bulk_update_mail_items({ ids: read_ids });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: `${read_ids.length} email${read_ids.length > 1 ? "s" : ""} archived`,
              action_type: "archive",
              email_ids: read_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: read_ids,
                });
                window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              },
            });
          } else {
            show_action_toast({
              message: "No read emails to archive",
              action_type: "read",
              email_ids: [],
            });
          }
        }
      } else if (action === "mark_all_read") {
        const response = await list_mail_items({
          item_type: "received",
          limit: 500,
        });

        if (response.data?.items) {
          const unread_ids = response.data.items
            .filter((item) => !item.metadata?.is_read && !item.metadata?.is_trashed)
            .map((item) => item.id);

          if (unread_ids.length > 0) {
            await bulk_update_mail_items({ ids: unread_ids });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: `${unread_ids.length} email${unread_ids.length > 1 ? "s" : ""} marked as read`,
              action_type: "read",
              email_ids: unread_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: unread_ids,
                });
                window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              },
            });
          } else {
            show_action_toast({
              message: "No unread emails",
              action_type: "read",
              email_ids: [],
            });
          }
        }
      } else if (action === "delete_old") {
        const response = await list_mail_items({
          item_type: "received",
          limit: 500,
        });

        if (response.data?.items) {
          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
          const old_ids = response.data.items
            .filter(
              (item) =>
                new Date(item.message_ts ?? item.created_at) <
                  thirty_days_ago && !item.metadata?.is_trashed,
            )
            .map((item) => item.id);

          if (old_ids.length > 0) {
            await bulk_update_mail_items({ ids: old_ids });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: `${old_ids.length} email${old_ids.length > 1 ? "s" : ""} moved to trash`,
              action_type: "trash",
              email_ids: old_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: old_ids,
                });
                window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              },
            });
          } else {
            show_action_toast({
              message: "No emails older than 30 days",
              action_type: "read",
              email_ids: [],
            });
          }
        }
      } else if (action === "archive_newsletters") {
        const response = await list_mail_items({
          item_type: "received",
          limit: 500,
        });

        if (response.data?.items) {
          const newsletter_ids = response.data.items
            .filter((item) => !item.metadata?.is_archived && !item.metadata?.is_trashed)
            .map((item) => item.id);

          if (newsletter_ids.length > 0) {
            await bulk_update_mail_items({
              ids: newsletter_ids,
            });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: `${newsletter_ids.length} email${newsletter_ids.length > 1 ? "s" : ""} archived`,
              action_type: "archive",
              email_ids: newsletter_ids,
              on_undo: async () => {
                await bulk_update_mail_items({
                  ids: newsletter_ids,
                });
                window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              },
            });
          }
        }
      } else if (action === "snooze_similar") {
        set_is_unsubscribe_open(true);
      }
    } finally {
      set_loading_action(null);
    }
  }, []);

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

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        set_is_search_open(true);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        e.preventDefault();
        set_is_command_palette_open(true);
      } else if (e.key === "?" && !is_input) {
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
                  className="no_scale flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer select-none transition-colors"
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
                <DropdownMenuLabel>Views</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("inbox")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">Inbox</span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      340
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("starred")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">Starred</span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      3
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("sent")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">Sent</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("drafts")}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-normal">Drafts</span>
                    <span className="text-xs font-normal text-muted-foreground inbox_view_count">
                      8
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handle_view_change("scheduled")}
                >
                  <span className="text-sm font-normal">Scheduled</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Folders</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("archive")}>
                  <span className="text-sm font-normal">Archive</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("spam")}>
                  <span className="text-sm font-normal">Spam</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("trash")}>
                  <span className="text-sm font-normal">Trash</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm text-muted-foreground">{email_count}</span>
          </div>

          <div className="relative group" data-onboarding="search-bar">
            <SearchIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              size={16}
              style={{ color: "var(--text-muted)" }}
            />
            <input
              readOnly
              className="pl-9 pr-14 py-1.5 text-sm rounded-lg focus:outline-none w-80 cursor-pointer transition-colors"
              placeholder="Search anything"
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: "var(--input-border)",
                border: "1px solid var(--input-border)",
                color: "var(--text-primary)",
              }}
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
                className="no_scale p-2 rounded-lg flex items-center justify-center w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex-shrink-0 transition-colors"
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
              <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("mark_all_read")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "mark_all_read" && (
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                  )}
                  Mark all as read
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("archive_all_read")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "archive_all_read" && (
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                  )}
                  Archive all read emails
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("delete_old")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "delete_old" && (
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                  )}
                  Delete emails older than 30 days
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sender Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handle_batch_action("archive_from_sender")}
              >
                Archive all from sender...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("delete_from_sender")}
              >
                Delete all from sender...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("move_from_sender")}
              >
                Move all from sender to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Smart Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handle_batch_action("snooze_similar")}
              >
                <span className="flex items-center gap-2">
                  <SnoozeIcon size={14} />
                  Snooze similar emails
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("unsubscribe_bulk")}
              >
                <span className="flex items-center gap-2">
                  <SnoozeIcon size={14} />
                  Bulk unsubscribe
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!loading_action}
                onClick={() => handle_batch_action("archive_newsletters")}
              >
                <span className="flex items-center gap-2">
                  {loading_action === "archive_newsletters" && (
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                  )}
                  Archive all newsletters
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="no_scale p-2 rounded-lg flex items-center justify-center w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex-shrink-0 transition-colors"
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
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              <DropdownMenuItem>All emails</DropdownMenuItem>
              <DropdownMenuItem>Unread only</DropdownMenuItem>
              <DropdownMenuItem>Starred</DropdownMenuItem>
              <DropdownMenuItem>With attachments</DropdownMenuItem>
              <DropdownMenuItem>Important</DropdownMenuItem>
              <DropdownMenuItem>Sent by me</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className="p-2 rounded-lg transition-colors"
            data-onboarding="settings-button"
            style={{ color: "var(--text-secondary)" }}
            onClick={on_settings_click}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <CogIcon />
          </button>
        </div>
      </div>
      <SearchModal
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
        folders={folders.map((f: { folder_token: string; name: string }) => ({
          token: f.folder_token,
          name: f.name,
        }))}
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
