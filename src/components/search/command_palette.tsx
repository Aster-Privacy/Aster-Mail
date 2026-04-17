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
import type { MailItemMetadata } from "@/types/email";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  StarIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  MoonIcon,
  SunIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  ClockIcon,
  ArrowPathIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  list_mail_items,
  list_encrypted_mail_items,
  empty_trash,
  type MailItem,
} from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { has_protected_folder_label } from "@/hooks/use_folders";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  decrypt_mail_metadata,
  bulk_update_items_metadata,
  create_default_metadata,
} from "@/services/crypto/mail_metadata";

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  shortcut?: string;
  category: "navigation" | "actions" | "mail" | "settings" | "view";
  keywords?: string[];
  action: () => void | Promise<void>;
  disabled?: boolean;
}

const FOCUS_DELAY_MS = 50;

interface CommandPaletteProps {
  is_open: boolean;
  on_close: () => void;
  on_compose?: () => void;
  on_settings?: () => void;
  on_shortcuts?: () => void;
}

export function CommandPalette({
  is_open,
  on_close,
  on_compose,
  on_settings,
  on_shortcuts,
}: CommandPaletteProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const { theme_preference, set_theme_preference } = useTheme();
  const { logout } = use_auth();
  const { update_preference } = use_preferences();
  const [query, set_query] = useState("");
  const [selected_index, set_selected_index] = useState(0);
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);
  const list_ref = useRef<HTMLDivElement>(null);

  const decrypt_items_metadata = useCallback(
    async (items: MailItem[]): Promise<Map<string, MailItemMetadata>> => {
      const results = new Map<string, MailItemMetadata>();
      let used_defaults = 0;
      let decrypted_ok = 0;
      let decrypt_failures = 0;
      let decrypt_nulls = 0;

      for (const item of items) {
        if (!item.encrypted_metadata || !item.metadata_nonce) {
          const is_sent_type =
            item.item_type === "sent" ||
            item.item_type === "draft" ||
            item.item_type === "scheduled";
          const defaults = create_default_metadata(item.item_type);

          defaults.is_read = is_sent_type;
          if (item.message_ts) defaults.message_ts = item.message_ts;
          results.set(item.id, defaults);
          used_defaults++;
          continue;
        }
        try {
          const meta = await decrypt_mail_metadata(
            item.encrypted_metadata,
            item.metadata_nonce,
            item.metadata_version,
          );

          if (meta) {
            results.set(item.id, meta);
            decrypted_ok++;
          } else {
            const defaults = create_default_metadata(item.item_type);

            results.set(item.id, defaults);
            decrypt_nulls++;
          }
        } catch (err) {
          const defaults = create_default_metadata(item.item_type);

          results.set(item.id, defaults);
          decrypt_failures++;
        }
      }

      return results;
    },
    [],
  );

  const fetch_and_filter = useCallback(
    async (
      source: "inbox" | "all",
      filter_fn: (
        meta: MailItemMetadata,
        item: { message_ts?: string; created_at: string },
      ) => boolean,
    ): Promise<{
      items: MailItem[];
      metadata_map: Map<string, MailItemMetadata>;
    } | null> => {
      let items: MailItem[] = [];
      let cursor: string | undefined;

      do {
        const response =
          source === "all"
            ? await list_encrypted_mail_items({ cursor })
            : await list_mail_items({ item_type: "received", cursor });

        if (!response.data?.items) break;
        items.push(...response.data.items);
        cursor = response.data.next_cursor;
      } while (cursor);

      const safe_items = items.filter(
        (item) => !has_protected_folder_label(item.labels),
      );

      const metadata_map = await decrypt_items_metadata(safe_items);

      const matching = safe_items.filter((item) => {
        const meta = metadata_map.get(item.id);

        if (!meta) return false;

        const passes = filter_fn(meta, {
          message_ts: item.message_ts,
          created_at: item.created_at,
        });

        return passes;
      });

      return { items: matching, metadata_map };
    },
    [decrypt_items_metadata],
  );

  const execute_metadata_action = useCallback(
    async (
      action_id: string,
      source: "inbox" | "all",
      filter_fn: (
        meta: MailItemMetadata,
        item: { message_ts?: string; created_at: string },
      ) => boolean,
      updates: Partial<MailItemMetadata>,
      undo_updates: Partial<MailItemMetadata>,
      success_message: (count: number) => string,
      action_type: "trash" | "read" | "unread" | "star" | "unstar",
    ) => {
      set_loading_action(action_id);
      try {
        const result = await fetch_and_filter(source, filter_fn);

        if (!result) {
          show_action_toast({
            message: t("common.failed_to_load_emails"),
            action_type: "read",
            email_ids: [],
          });

          return;
        }

        if (result.items.length === 0) {
          show_action_toast({
            message: t("common.no_emails_match_criteria"),
            action_type,
            email_ids: [],
          });

          return;
        }

        const update_items = result.items.map((item) => ({
          id: item.id,
          encrypted_metadata: item.encrypted_metadata,
          metadata_nonce: item.metadata_nonce,
          metadata_version: item.metadata_version,
        }));

        const api_result = await bulk_update_items_metadata(
          update_items,
          updates,
        );

        const count =
          api_result.updated_count > 0
            ? api_result.updated_count
            : result.items.length - api_result.failed_ids.length;

        if (count > 0) {
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          show_action_toast({
            message: success_message(count),
            action_type,
            email_ids: result.items.map((i) => i.id),
            on_undo: async () => {
              await bulk_update_items_metadata(update_items, undo_updates);
              window.dispatchEvent(
                new CustomEvent("astermail:mail-soft-refresh"),
              );
            },
          });
          on_close();
        } else {
          show_action_toast({
            message: t("common.failed_to_update_emails"),
            action_type,
            email_ids: [],
          });
        }
      } catch {
        show_action_toast({
          message: t("common.something_went_wrong"),
          action_type,
          email_ids: [],
        });
      } finally {
        set_loading_action(null);
      }
    },
    [t, on_close, fetch_and_filter],
  );

  const execute_archive_action = useCallback(
    async (
      action_id: string,
      filter_fn: (
        meta: MailItemMetadata,
        item: { message_ts?: string; created_at: string },
      ) => boolean,
      success_message: (count: number) => string,
    ) => {
      set_loading_action(action_id);
      try {
        const result = await fetch_and_filter("inbox", filter_fn);

        if (!result) {
          show_action_toast({
            message: t("common.failed_to_load_emails"),
            action_type: "archive",
            email_ids: [],
          });

          return;
        }

        if (result.items.length === 0) {
          show_action_toast({
            message: t("common.no_emails_match_criteria"),
            action_type: "archive",
            email_ids: [],
          });

          return;
        }

        const ids = result.items.map((i) => i.id);
        const archive_result = await batch_archive({ ids, tier: "hot" });

        if (archive_result.error) {
          show_action_toast({
            message: t("common.failed_to_archive_emails"),
            action_type: "archive",
            email_ids: [],
          });

          return;
        }

        const count = archive_result.data?.archived_count ?? ids.length;

        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        show_action_toast({
          message: success_message(count),
          action_type: "archive",
          email_ids: ids,
          on_undo: async () => {
            await batch_unarchive({ ids });
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
        on_close();
      } catch {
        show_action_toast({
          message: t("common.something_went_wrong"),
          action_type: "archive",
          email_ids: [],
        });
      } finally {
        set_loading_action(null);
      }
    },
    [t, on_close, fetch_and_filter],
  );

  const commands: CommandAction[] = useMemo(
    () => [
      {
        id: "compose",
        label: t("common.compose_new_email"),
        description: t("mail.start_new_message"),
        icon: PlusIcon,
        shortcut: "C",
        category: "mail",
        keywords: ["new", "write", "create", "message"],
        action: () => {
          on_compose?.();
          on_close();
        },
      },
      {
        id: "inbox",
        label: t("mail.go_to_inbox"),
        description: t("mail.view_inbox"),
        icon: EnvelopeIcon,
        shortcut: "G I",
        category: "navigation",
        keywords: ["home", "main"],
        action: () => {
          navigate("/");
          on_close();
        },
      },
      {
        id: "sent",
        label: t("mail.go_to_sent"),
        description: t("mail.view_sent"),
        icon: PaperAirplaneIcon,
        category: "navigation",
        keywords: ["outbox"],
        action: () => {
          navigate("/sent");
          on_close();
        },
      },
      {
        id: "drafts",
        label: t("mail.go_to_drafts"),
        description: t("mail.view_drafts"),
        icon: DocumentTextIcon,
        category: "navigation",
        action: () => {
          navigate("/drafts");
          on_close();
        },
      },
      {
        id: "starred",
        label: t("mail.go_to_starred"),
        description: t("mail.view_starred"),
        icon: StarIcon,
        shortcut: "G S",
        category: "navigation",
        keywords: ["important", "flagged"],
        action: () => {
          navigate("/starred");
          on_close();
        },
      },
      {
        id: "archive",
        label: t("mail.go_to_archive"),
        description: t("mail.view_archived"),
        icon: ArchiveBoxIcon,
        category: "navigation",
        action: () => {
          navigate("/archive");
          on_close();
        },
      },
      {
        id: "trash",
        label: t("mail.go_to_trash"),
        description: t("mail.view_deleted"),
        icon: TrashIcon,
        category: "navigation",
        action: () => {
          navigate("/trash");
          on_close();
        },
      },
      {
        id: "spam",
        label: t("mail.go_to_spam"),
        description: t("mail.view_spam"),
        icon: ExclamationTriangleIcon,
        category: "navigation",
        action: () => {
          navigate("/spam");
          on_close();
        },
      },
      {
        id: "scheduled",
        label: t("mail.go_to_scheduled"),
        description: t("mail.view_scheduled"),
        icon: ClockIcon,
        category: "navigation",
        action: () => {
          navigate("/scheduled");
          on_close();
        },
      },
      {
        id: "mark_all_read",
        label: t("mail.mark_all_read"),
        description: t("mail.mark_all_unread_as_read"),
        icon: EyeIcon,
        category: "actions",
        keywords: ["unread", "clear"],
        action: () =>
          execute_metadata_action(
            "mark_all_read",
            "inbox",
            (meta) => !meta.is_read && !meta.is_trashed,
            { is_read: true },
            { is_read: false },
            (n) => t("common.emails_marked_as_read", { count: String(n) }),
            "read",
          ),
      },
      {
        id: "archive_all_read",
        label: t("mail.archive_all_read_emails"),
        description: t("mail.move_read_to_archive"),
        icon: ArchiveBoxIcon,
        category: "actions",
        keywords: ["cleanup", "clean"],
        action: () =>
          execute_archive_action(
            "archive_all_read",
            (meta) => meta.is_read && !meta.is_archived && !meta.is_trashed,
            (n) => t("common.emails_archived", { count: String(n) }),
          ),
      },
      {
        id: "delete_old",
        label: t("mail.delete_emails_older_than_30_days"),
        description: t("mail.move_old_to_trash"),
        icon: TrashIcon,
        category: "actions",
        keywords: ["cleanup", "old", "remove"],
        action: () => {
          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
          execute_metadata_action(
            "delete_old",
            "inbox",
            (meta, item) =>
              new Date(item.message_ts ?? item.created_at) < thirty_days_ago &&
              !meta.is_trashed,
            { is_trashed: true },
            { is_trashed: false },
            (n) => t("common.emails_moved_to_trash", { count: String(n) }),
            "trash",
          );
        },
      },
      {
        id: "star_unread",
        label: t("mail.star_all_unread"),
        description: t("mail.add_star_unread"),
        icon: StarIcon,
        category: "actions",
        keywords: ["important", "flag"],
        action: () =>
          execute_metadata_action(
            "star_unread",
            "inbox",
            (meta) => !meta.is_read && !meta.is_starred && !meta.is_trashed,
            { is_starred: true },
            { is_starred: false },
            (n) => t("common.emails_starred", { count: String(n) }),
            "star",
          ),
      },
      {
        id: "unstar_all",
        label: t("mail.remove_all_stars"),
        description: t("mail.unstar_all"),
        icon: StarIcon,
        category: "actions",
        keywords: ["clear", "unflag"],
        action: () =>
          execute_metadata_action(
            "unstar_all",
            "inbox",
            (meta) => meta.is_starred && !meta.is_trashed,
            { is_starred: false },
            { is_starred: true },
            (n) => t("common.emails_unstarred", { count: String(n) }),
            "unstar",
          ),
      },
      {
        id: "empty_trash",
        label: t("mail.empty_trash"),
        description: t("mail.permanently_delete_trash"),
        icon: TrashIcon,
        category: "actions",
        keywords: ["delete", "permanent", "clear"],
        action: async () => {
          set_loading_action("empty_trash");
          try {
            const result = await empty_trash();

            if (result.data) {
              const count = result.data.deleted_count;

              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              show_action_toast({
                message:
                  count > 0
                    ? t("common.emails_permanently_deleted", {
                        count: String(count),
                      })
                    : t("common.trash_already_empty"),
                action_type: "trash",
                email_ids: [],
              });
            } else {
              window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              show_toast(t("common.trash_empty_failed"), "error");
            }
            on_close();
          } catch {
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_toast(t("common.trash_empty_failed"), "error");
            on_close();
          } finally {
            set_loading_action(null);
          }
        },
      },
      {
        id: "empty_spam",
        label: t("mail.empty_spam"),
        description: t("mail.move_spam_to_trash"),
        icon: ExclamationTriangleIcon,
        category: "actions",
        keywords: ["spam", "delete", "permanent", "clear", "junk"],
        action: () =>
          execute_metadata_action(
            "empty_spam",
            "all",
            (meta) => meta.is_spam && !meta.is_trashed,
            { is_trashed: true, is_spam: false },
            { is_trashed: false, is_spam: true },
            (n) => t("common.spam_emails_moved_to_trash", { count: String(n) }),
            "trash",
          ),
      },
      {
        id: "refresh",
        label: t("common.refresh_inbox"),
        description: t("mail.check_new_emails"),
        icon: ArrowPathIcon,
        shortcut: "R",
        category: "actions",
        keywords: ["sync", "update", "fetch"],
        action: () => {
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          on_close();
        },
      },
      {
        id: "toggle_theme",
        label:
          theme_preference === "dark"
            ? t("mail.switch_to_light")
            : t("mail.switch_to_dark"),
        description: t("mail.toggle_theme"),
        icon: theme_preference === "dark" ? SunIcon : MoonIcon,
        category: "settings",
        keywords: ["dark", "light", "appearance"],
        action: () => {
          const new_theme = theme_preference === "dark" ? "light" : "dark";

          set_theme_preference(new_theme);
          update_preference("theme", new_theme, true);
          on_close();
        },
      },
      {
        id: "settings",
        label: t("mail.open_settings"),
        description: t("mail.configure_preferences"),
        icon: Cog6ToothIcon,
        shortcut: ",",
        category: "settings",
        keywords: ["preferences", "options", "config"],
        action: () => {
          on_settings?.();
          on_close();
        },
      },
      {
        id: "shortcuts",
        label: t("common.keyboard_shortcuts"),
        description: t("mail.view_keyboard_shortcuts"),
        icon: CommandLineIcon,
        shortcut: "?",
        category: "settings",
        keywords: ["keys", "hotkeys", "help"],
        action: () => {
          on_shortcuts?.();
          on_close();
        },
      },
      {
        id: "logout",
        label: t("mail.log_out_label"),
        description: t("mail.log_out_account"),
        icon: ArrowRightOnRectangleIcon,
        category: "settings",
        keywords: ["exit", "leave"],
        action: async () => {
          await logout();
          navigate("/sign-in");
          on_close();
        },
      },
    ],
    [
      t,
      navigate,
      on_close,
      on_compose,
      on_settings,
      on_shortcuts,
      theme_preference,
      set_theme_preference,
      update_preference,
      logout,
      execute_metadata_action,
      execute_archive_action,
    ],
  );

  const filtered_commands = useMemo(() => {
    if (!query.trim()) return commands;
    const search = query.toLowerCase();

    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(search) ||
        cmd.description?.toLowerCase().includes(search) ||
        cmd.keywords?.some((k) => k.includes(search)),
    );
  }, [commands, query]);

  const grouped_commands = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {
      navigation: [],
      mail: [],
      actions: [],
      settings: [],
      view: [],
    };

    filtered_commands.forEach((cmd) => {
      groups[cmd.category].push(cmd);
    });

    return groups;
  }, [filtered_commands]);

  const flat_commands = useMemo(
    () =>
      Object.values(grouped_commands)
        .flat()
        .filter((g) => g),
    [grouped_commands],
  );

  useEffect(() => {
    if (is_open) {
      set_query("");
      set_selected_index(0);
      setTimeout(() => input_ref.current?.focus(), FOCUS_DELAY_MS);
    }
  }, [is_open]);

  useEffect(() => {
    set_selected_index(0);
  }, [query]);

  useEffect(() => {
    if (list_ref.current && flat_commands.length > 0) {
      const selected_el = list_ref.current.querySelector(
        `[data-index="${selected_index}"]`,
      );

      selected_el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected_index, flat_commands.length]);

  const handle_keydown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          set_selected_index((i) => Math.min(i + 1, flat_commands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          set_selected_index((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flat_commands[selected_index] && !loading_action) {
            flat_commands[selected_index].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          on_close();
          break;
      }
    },
    [flat_commands, selected_index, loading_action, on_close],
  );

  const category_labels: Record<string, string> = {
    navigation: t("mail.category_navigation"),
    mail: t("mail.category_mail"),
    actions: t("mail.quick_actions"),
    settings: t("settings.title"),
    view: t("mail.category_view"),
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-xl rounded-xl overflow-hidden shadow-2xl bg-surf-primary border border-edge-secondary"
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            initial={
              reduce_motion ? false : { opacity: 0, scale: 0.95, y: -20 }
            }
            transition={{ duration: reduce_motion ? 0 : 0.2, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-edge-secondary">
              <CommandLineIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />
              <Input
                ref={input_ref}
                className="flex-1 bg-transparent border-none"
                placeholder={t("common.type_command_or_search")}
                type="text"
                value={query}
                onChange={(e) => set_query(e.target.value)}
                onKeyDown={handle_keydown}
              />
              <kbd className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-surf-tertiary text-txt-muted border border-edge-secondary">
                ESC
              </kbd>
            </div>

            <div
              ref={list_ref}
              className="max-h-[400px] overflow-y-auto py-2"
              style={{ scrollbarWidth: "thin" }}
            >
              {flat_commands.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[13px] text-txt-muted">
                    {t("common.no_commands_found")}
                  </p>
                </div>
              ) : (
                Object.entries(grouped_commands).map(([category, cmds]) => {
                  if (cmds.length === 0) return null;
                  const start_index = flat_commands.findIndex(
                    (c) => c.id === cmds[0].id,
                  );

                  return (
                    <div key={category} className="mb-2">
                      <div className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                        {category_labels[category]}
                      </div>
                      {cmds.map((cmd, idx) => {
                        const global_index = start_index + idx;
                        const is_selected = selected_index === global_index;
                        const is_this_loading = loading_action === cmd.id;
                        const Icon = cmd.icon;

                        return (
                          <button
                            key={cmd.id}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${is_selected ? "bg-surf-secondary" : "bg-transparent"}`}
                            data-index={global_index}
                            disabled={!!loading_action}
                            onClick={() => !loading_action && cmd.action()}
                            onMouseEnter={() =>
                              set_selected_index(global_index)
                            }
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-surf-tertiary">
                              {is_this_loading ? (
                                <Spinner
                                  className="text-txt-secondary"
                                  size="sm"
                                />
                              ) : (
                                <Icon className="w-4 h-4 text-txt-secondary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium truncate text-txt-primary">
                                {cmd.label}
                              </p>
                              {cmd.description && (
                                <p className="text-[11px] truncate text-txt-muted">
                                  {cmd.description}
                                </p>
                              )}
                            </div>
                            {cmd.shortcut && (
                              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-surf-tertiary text-txt-muted border border-edge-secondary">
                                {cmd.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2 text-[11px] border-t border-edge-secondary text-txt-muted">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-surf-tertiary">↑↓</kbd>
                  {t("common.navigate")}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-surf-tertiary">↵</kbd>
                  {t("mail.select")}
                </span>
              </div>
              <span>
                {t("common.commands_count", {
                  count: String(flat_commands.length),
                })}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
