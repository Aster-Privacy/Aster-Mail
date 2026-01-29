import type { InboxFilterType, EmailCategory } from "@/types/email";

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  ArrowPathIcon,
  FunnelIcon,
  CheckIcon,
  InboxIcon,
  UserGroupIcon,
  TagIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

import { REFRESH_STATE_MS } from "@/constants/timings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SearchModal } from "@/components/search_modal";
import { SenderActionModal } from "@/components/sender_action_modal";
import { MassUnsubscribeModal } from "@/components/mass_unsubscribe_modal";
import { SnoozeSimilarModal } from "@/components/snooze_similar_modal";
import { list_mail_items, bulk_update_mail_items } from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/action_toast";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { use_folders } from "@/hooks/use_folders";
import { decrypt_mail_envelope } from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";

interface DecryptedEnvelope {
  from_address?: string;
  from_name?: string;
}

async function decrypt_envelope_for_action(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();
  const vault = get_vault_from_memory();

  try {
    return await decrypt_mail_envelope<DecryptedEnvelope>(
      encrypted,
      nonce,
      passphrase,
      vault?.identity_key ?? null,
    );
  } finally {
    if (passphrase) zero_uint8_array(passphrase);
  }
}

function is_newsletter_email(email: string, name: string): boolean {
  const newsletter_patterns = [
    "newsletter",
    "noreply",
    "no-reply",
    "notifications",
    "notification",
    "updates",
    "update",
    "digest",
    "promo",
    "marketing",
    "deals",
    "offers",
    "news",
    "info",
    "subscribe",
    "weekly",
    "monthly",
    "daily",
  ];

  return newsletter_patterns.some(
    (pattern) => email.includes(pattern) || name.includes(pattern),
  );
}

interface CategoryConfig {
  id: EmailCategory | "all";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  { id: "all", label: "All", icon: InboxIcon },
  { id: "primary", label: "Primary", icon: InboxIcon },
  { id: "social", label: "Social", icon: UserGroupIcon },
  { id: "promotions", label: "Promos", icon: TagIcon },
  { id: "updates", label: "Updates", icon: BellIcon },
];

interface InboxHeaderProps {
  on_settings_click: () => void;
  view_title: string;
  on_compose?: () => void;
  active_filter?: InboxFilterType;
  on_filter_change?: (filter: InboxFilterType) => void;
  on_search_click?: () => void;
  active_category?: EmailCategory | "all";
  on_category_change?: (category: EmailCategory | "all") => void;
  show_categories?: boolean;
  all_selected?: boolean;
  some_selected?: boolean;
  on_toggle_select_all?: () => void;
  filtered_count?: number;
  total_messages?: number;
  current_page?: number;
  page_size?: number;
  on_page_change?: (page: number) => void;
}

export function InboxHeader({
  on_settings_click,
  view_title,
  on_compose,
  active_filter = "all",
  on_filter_change,
  on_search_click,
  active_category = "all",
  on_category_change,
  show_categories = false,
  all_selected = false,
  some_selected = false,
  on_toggle_select_all,
  filtered_count = 0,
  total_messages = 0,
  current_page = 0,
  page_size = 50,
  on_page_change,
}: InboxHeaderProps) {
  const navigate = useNavigate();
  const { state: folders_state } = use_folders();
  const [is_search_open, set_is_search_open] = useState(false);

  const handle_search_open = useCallback(() => {
    if (on_search_click) {
      on_search_click();
    } else {
      set_is_search_open(true);
    }
  }, [on_search_click]);

  const [is_sender_modal_open, set_is_sender_modal_open] = useState(false);
  const [sender_modal_action, set_sender_modal_action] = useState<
    "archive" | "delete" | "move"
  >("archive");
  const [is_unsubscribe_modal_open, set_is_unsubscribe_modal_open] =
    useState(false);
  const [is_snooze_modal_open, set_is_snooze_modal_open] = useState(false);
  const [is_refreshing, set_is_refreshing] = useState(false);
  const is_mac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const handle_refresh = () => {
    if (is_refreshing) return;
    set_is_refreshing(true);
    window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
    setTimeout(() => set_is_refreshing(false), REFRESH_STATE_MS);
  };

  const handle_batch_action = useCallback(async (action: string) => {
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
        const read_ids = response.data.items
          .filter(
            (item) => item.is_read && !item.is_archived && !item.is_trashed,
          )
          .map((item) => item.id);

        if (read_ids.length > 0) {
          await batch_archive({ ids: read_ids, tier: "hot" });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          show_action_toast({
            message: `${read_ids.length} email${read_ids.length > 1 ? "s" : ""} archived`,
            action_type: "archive",
            email_ids: read_ids,
            on_undo: async () => {
              await batch_unarchive({ ids: read_ids });
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
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
        const unread_ids = response.data.items
          .filter((item) => !item.is_read && !item.is_trashed)
          .map((item) => item.id);

        if (unread_ids.length > 0) {
          adjust_unread_count(-unread_ids.length);
          await bulk_update_mail_items({ ids: unread_ids, is_read: true });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          show_action_toast({
            message: `${unread_ids.length} email${unread_ids.length > 1 ? "s" : ""} marked as read`,
            action_type: "read",
            email_ids: unread_ids,
            on_undo: async () => {
              adjust_unread_count(unread_ids.length);
              await bulk_update_mail_items({ ids: unread_ids, is_read: false });
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
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
        const thirty_days_ago = new Date();

        thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
        const old_ids = response.data.items
          .filter((item) => {
            const item_date = new Date(item.message_ts ?? item.created_at);

            return item_date < thirty_days_ago && !item.is_trashed;
          })
          .map((item) => item.id);

        if (old_ids.length > 0) {
          await bulk_update_mail_items({ ids: old_ids, is_trashed: true });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          show_action_toast({
            message: `${old_ids.length} email${old_ids.length > 1 ? "s" : ""} moved to trash`,
            action_type: "trash",
            email_ids: old_ids,
            on_undo: async () => {
              await bulk_update_mail_items({ ids: old_ids, is_trashed: false });
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            },
          });
        }
      }
    } else if (action === "archive_newsletters") {
      const response = await list_mail_items({
        item_type: "received",
        limit: 500,
      });

      if (response.data?.items) {
        const newsletter_ids: string[] = [];

        for (const item of response.data.items) {
          if (item.is_trashed || item.is_archived) continue;

          try {
            const envelope = await decrypt_envelope_for_action(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope?.from_address) continue;

            const email = envelope.from_address.toLowerCase();
            const name = (envelope.from_name || "").toLowerCase();

            if (is_newsletter_email(email, name)) {
              newsletter_ids.push(item.id);
            }
          } catch {
            continue;
          }
        }

        if (newsletter_ids.length > 0) {
          await batch_archive({ ids: newsletter_ids, tier: "hot" });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          show_action_toast({
            message: `${newsletter_ids.length} newsletter${newsletter_ids.length > 1 ? "s" : ""} archived`,
            action_type: "archive",
            email_ids: newsletter_ids,
            on_undo: async () => {
              await batch_unarchive({ ids: newsletter_ids });
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            },
          });
        } else {
          show_action_toast({
            message: "No newsletters found to archive",
            action_type: "archive",
            email_ids: [],
          });
        }
      }
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

    if (route) navigate(route);
  };

  return (
    <>
      <div
        className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 sm:py-2.5 border-b overflow-hidden"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
          {on_toggle_select_all && (
            <Checkbox
              checked={all_selected ? true : some_selected ? "indeterminate" : false}
              className="flex-shrink-0"
              onCheckedChange={on_toggle_select_all}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[80px] sm:max-w-[120px]">
                  {view_title}
                </span>
                <ChevronDownIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Views</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handle_view_change("inbox")}>
                Inbox
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("starred")}>
                Starred
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("sent")}>
                Sent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("drafts")}>
                Drafts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("scheduled")}>
                Scheduled
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Folders</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handle_view_change("archive")}>
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("spam")}>
                Spam
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handle_view_change("trash")}>
                Trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <Button
            className="h-8 w-8 lg:hidden flex-shrink-0"
            size="icon"
            variant="ghost"
            onClick={handle_search_open}
          >
            <MagnifyingGlassIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
          </Button>

          <button
            className="hidden lg:flex items-center gap-2 flex-1 min-w-[120px] max-w-[240px] h-8 px-2.5 rounded-md border cursor-pointer transition-colors hover:border-[var(--text-muted)]"
            data-onboarding="search-bar"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-secondary)",
            }}
            onClick={handle_search_open}
          >
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-xs text-[var(--text-muted)] flex-1 text-left truncate">
              Search...
            </span>
            <kbd className="hidden xl:inline-flex h-4 items-center gap-0.5 rounded border px-1 font-mono text-[9px] font-medium text-[var(--text-muted)] bg-[var(--bg-tertiary)] border-[var(--border-secondary)]">
              {is_mac ? "⌘" : "Ctrl"}K
            </kbd>
          </button>

          {show_categories && on_category_change && (
            <div className="hidden xl:flex items-center gap-0.5">
              {CATEGORY_CONFIGS.map((config) => {
                const is_active = active_category === config.id;
                const IconComponent = config.icon;

                return (
                  <button
                    key={config.id}
                    className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors duration-150 whitespace-nowrap border ${
                      is_active
                        ? "text-[var(--text-primary)] bg-[var(--indicator-bg)] border-[var(--border-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-transparent"
                    }`}
                    onClick={() => on_category_change(config.id)}
                  >
                    <IconComponent className="w-3 h-3" />
                    <span className="hidden 2xl:inline">{config.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            className="hidden md:flex h-8 w-8"
            size="icon"
            variant="ghost"
            onClick={handle_refresh}
          >
            <ArrowPathIcon
              className={`w-4 h-4 text-[var(--text-secondary)] ${is_refreshing ? "animate-spin" : ""}`}
            />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="hidden md:flex h-8 w-8"
                size="icon"
                variant="ghost"
              >
                <FunnelIcon
                  className={`w-4 h-4 ${active_filter !== "all" ? "text-blue-500" : "text-[var(--text-secondary)]"}`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => on_filter_change?.("all")}>
                <span className="w-4 mr-2">
                  {active_filter === "all" && <CheckIcon className="w-4 h-4" />}
                </span>
                All emails
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => on_filter_change?.("unread")}>
                <span className="w-4 mr-2">
                  {active_filter === "unread" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                Unread only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => on_filter_change?.("read")}>
                <span className="w-4 mr-2">
                  {active_filter === "read" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                Read only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => on_filter_change?.("attachments")}
              >
                <span className="w-4 mr-2">
                  {active_filter === "attachments" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                With attachments
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handle_batch_action("mark_all_read")}
              >
                Mark all as read
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("archive_all_read")}
              >
                Archive all read emails
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("delete_old")}
              >
                Delete emails older than 30 days
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
                Snooze similar emails
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("unsubscribe_bulk")}
              >
                Bulk unsubscribe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("archive_newsletters")}
              >
                Archive all newsletters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="hidden lg:flex h-8 w-8"
            data-onboarding="settings-button"
            size="icon"
            variant="ghost"
            onClick={on_settings_click}
          >
            <Cog6ToothIcon className="w-4 h-4 text-[var(--text-secondary)]" />
          </Button>

          {on_page_change && (
            <div className="hidden xl:flex items-center gap-0.5 text-xs text-[var(--text-muted)] ml-1">
              <span className="tabular-nums text-[11px]">
                {filtered_count > 0
                  ? `${current_page * page_size + 1}-${Math.min((current_page + 1) * page_size, filtered_count)}`
                  : "0"}
                {total_messages > 0 && (
                  <span className="hidden 2xl:inline"> of {total_messages}</span>
                )}
              </span>
              <Button
                className="h-6 w-6"
                disabled={current_page === 0}
                size="icon"
                variant="ghost"
                onClick={() => on_page_change(current_page - 1)}
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </Button>
              <Button
                className="h-6 w-6"
                disabled={current_page >= Math.ceil(filtered_count / page_size) - 1}
                size="icon"
                variant="ghost"
                onClick={() => on_page_change(current_page + 1)}
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="lg:hidden h-8 w-8" size="icon" variant="ghost">
                <EllipsisVerticalIcon className="w-4 h-4 text-[var(--text-secondary)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handle_refresh}>
                <ArrowPathIcon className="w-4 h-4 mr-2" />
                Refresh
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => on_filter_change?.("all")}>
                <span className="w-4 mr-2">
                  {active_filter === "all" && <CheckIcon className="w-4 h-4" />}
                </span>
                All emails
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => on_filter_change?.("unread")}>
                <span className="w-4 mr-2">
                  {active_filter === "unread" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                Unread only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => on_filter_change?.("read")}>
                <span className="w-4 mr-2">
                  {active_filter === "read" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                Read only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => on_filter_change?.("attachments")}
              >
                <span className="w-4 mr-2">
                  {active_filter === "attachments" && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </span>
                With attachments
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handle_batch_action("mark_all_read")}
              >
                Mark all as read
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("archive_all_read")}
              >
                Archive all read emails
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handle_batch_action("delete_old")}
              >
                Delete emails older than 30 days
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={on_settings_click}>
                <Cog6ToothIcon className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!on_search_click && (
        <SearchModal
          is_open={is_search_open}
          on_close={() => set_is_search_open(false)}
          on_compose={on_compose}
        />
      )}

      <SenderActionModal
        action_type={sender_modal_action}
        folders={folders_state.folders.map((f) => ({
          token: f.folder_token,
          name: f.name,
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
