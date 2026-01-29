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

import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { list_mail_items, bulk_update_mail_items } from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/action_toast";

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
  const navigate = useNavigate();
  const { theme_preference, set_theme_preference } = useTheme();
  const { logout } = use_auth();
  const { update_preference } = use_preferences();
  const [query, set_query] = useState("");
  const [selected_index, set_selected_index] = useState(0);
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);
  const list_ref = useRef<HTMLDivElement>(null);

  const execute_batch_action = useCallback(
    async (
      action_id: string,
      filter_fn: (
        items: Array<{
          id: string;
          is_read?: boolean;
          is_archived?: boolean;
          is_trashed?: boolean;
          is_starred?: boolean;
          message_ts?: string;
          created_at: string;
        }>,
      ) => string[],
      update_data: {
        is_read?: boolean;
        is_archived?: boolean;
        is_trashed?: boolean;
        is_starred?: boolean;
      },
      success_message: (count: number) => string,
      action_type: "archive" | "trash" | "read" | "unread" | "star" | "unstar",
      undo_data: {
        is_read?: boolean;
        is_archived?: boolean;
        is_trashed?: boolean;
        is_starred?: boolean;
      },
    ) => {
      set_loading_action(action_id);
      try {
        const response = await list_mail_items({
          item_type: "received",
          limit: 500,
        });

        if (response.data?.items) {
          const ids = filter_fn(response.data.items);

          if (ids.length > 0) {
            if (action_type === "archive") {
              await batch_archive({ ids, tier: "hot" });
            } else {
              await bulk_update_mail_items({ ids, ...update_data });
            }
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
            show_action_toast({
              message: success_message(ids.length),
              action_type,
              email_ids: ids,
              on_undo: async () => {
                if (action_type === "archive") {
                  await batch_unarchive({ ids });
                } else {
                  await bulk_update_mail_items({ ids, ...undo_data });
                }
                window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
              },
            });
            on_close();
          } else {
            show_action_toast({
              message: "No emails match this criteria",
              action_type: "read",
              email_ids: [],
            });
          }
        }
      } finally {
        set_loading_action(null);
      }
    },
    [on_close],
  );

  const commands: CommandAction[] = useMemo(
    () => [
      {
        id: "compose",
        label: "Compose new email",
        description: "Start writing a new message",
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
        label: "Go to Inbox",
        description: "View your inbox",
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
        label: "Go to Sent",
        description: "View sent emails",
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
        label: "Go to Drafts",
        description: "View draft emails",
        icon: DocumentTextIcon,
        category: "navigation",
        action: () => {
          navigate("/drafts");
          on_close();
        },
      },
      {
        id: "starred",
        label: "Go to Starred",
        description: "View starred emails",
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
        label: "Go to Archive",
        description: "View archived emails",
        icon: ArchiveBoxIcon,
        category: "navigation",
        action: () => {
          navigate("/archive");
          on_close();
        },
      },
      {
        id: "trash",
        label: "Go to Trash",
        description: "View deleted emails",
        icon: TrashIcon,
        category: "navigation",
        action: () => {
          navigate("/trash");
          on_close();
        },
      },
      {
        id: "spam",
        label: "Go to Spam",
        description: "View spam emails",
        icon: ExclamationTriangleIcon,
        category: "navigation",
        action: () => {
          navigate("/spam");
          on_close();
        },
      },
      {
        id: "scheduled",
        label: "Go to Scheduled",
        description: "View scheduled emails",
        icon: ClockIcon,
        category: "navigation",
        action: () => {
          navigate("/scheduled");
          on_close();
        },
      },
      {
        id: "mark_all_read",
        label: "Mark all as read",
        description: "Mark all unread emails as read",
        icon: EyeIcon,
        category: "actions",
        keywords: ["unread", "clear"],
        action: () =>
          execute_batch_action(
            "mark_all_read",
            (items) =>
              items.filter((i) => !i.is_read && !i.is_trashed).map((i) => i.id),
            { is_read: true },
            (n) => `${n} email${n > 1 ? "s" : ""} marked as read`,
            "read",
            { is_read: false },
          ),
      },
      {
        id: "archive_all_read",
        label: "Archive all read emails",
        description: "Move all read emails to archive",
        icon: ArchiveBoxIcon,
        category: "actions",
        keywords: ["cleanup", "clean"],
        action: () =>
          execute_batch_action(
            "archive_all_read",
            (items) =>
              items
                .filter((i) => i.is_read && !i.is_archived && !i.is_trashed)
                .map((i) => i.id),
            { is_archived: true },
            (n) => `${n} email${n > 1 ? "s" : ""} archived`,
            "archive",
            { is_archived: false },
          ),
      },
      {
        id: "delete_old",
        label: "Delete emails older than 30 days",
        description: "Move old emails to trash",
        icon: TrashIcon,
        category: "actions",
        keywords: ["cleanup", "old", "remove"],
        action: () => {
          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
          execute_batch_action(
            "delete_old",
            (items) =>
              items
                .filter(
                  (i) =>
                    new Date(i.message_ts ?? i.created_at) < thirty_days_ago &&
                    !i.is_trashed,
                )
                .map((i) => i.id),
            { is_trashed: true },
            (n) => `${n} email${n > 1 ? "s" : ""} moved to trash`,
            "trash",
            { is_trashed: false },
          );
        },
      },
      {
        id: "star_unread",
        label: "Star all unread emails",
        description: "Add star to all unread messages",
        icon: StarIcon,
        category: "actions",
        keywords: ["important", "flag"],
        action: () =>
          execute_batch_action(
            "star_unread",
            (items) =>
              items
                .filter((i) => !i.is_read && !i.is_starred && !i.is_trashed)
                .map((i) => i.id),
            { is_starred: true },
            (n) => `${n} email${n > 1 ? "s" : ""} starred`,
            "star",
            { is_starred: false },
          ),
      },
      {
        id: "unstar_all",
        label: "Remove all stars",
        description: "Unstar all starred emails",
        icon: StarIcon,
        category: "actions",
        keywords: ["clear", "unflag"],
        action: () =>
          execute_batch_action(
            "unstar_all",
            (items) =>
              items
                .filter((i) => i.is_starred && !i.is_trashed)
                .map((i) => i.id),
            { is_starred: false },
            (n) => `${n} email${n > 1 ? "s" : ""} unstarred`,
            "unstar",
            { is_starred: true },
          ),
      },
      {
        id: "empty_trash",
        label: "Empty trash",
        description: "Items in trash are automatically deleted after 30 days",
        icon: TrashIcon,
        category: "actions",
        keywords: ["delete", "permanent", "clear"],
        action: () => {
          show_action_toast({
            message: "Items in trash are automatically deleted after 30 days",
            action_type: "read",
            email_ids: [],
          });
          on_close();
        },
      },
      {
        id: "empty_spam",
        label: "Empty spam",
        description:
          "Spam is automatically deleted based on your retention settings",
        icon: ExclamationTriangleIcon,
        category: "actions",
        keywords: ["spam", "delete", "permanent", "clear", "junk"],
        action: () => {
          show_action_toast({
            message:
              "Spam is automatically deleted based on your retention settings",
            action_type: "read",
            email_ids: [],
          });
          on_close();
        },
      },
      {
        id: "refresh",
        label: "Refresh inbox",
        description: "Check for new emails",
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
            ? "Switch to light mode"
            : "Switch to dark mode",
        description: "Toggle between light and dark theme",
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
        label: "Open settings",
        description: "Configure your preferences",
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
        label: "Keyboard shortcuts",
        description: "View all keyboard shortcuts",
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
        label: "Log out",
        description: "Log out of your account",
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
      navigate,
      on_close,
      on_compose,
      on_settings,
      on_shortcuts,
      theme_preference,
      set_theme_preference,
      update_preference,
      logout,
      execute_batch_action,
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
    navigation: "Navigation",
    mail: "Mail",
    actions: "Quick Actions",
    settings: "Settings",
    view: "View",
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-xl rounded-xl overflow-hidden shadow-2xl"
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-secondary)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-secondary)" }}
            >
              <CommandLineIcon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={input_ref}
                className="flex-1 bg-transparent text-[15px] focus:outline-none"
                placeholder="Type a command or search..."
                style={{ color: "var(--text-primary)" }}
                type="text"
                value={query}
                onChange={(e) => set_query(e.target.value)}
                onKeyDown={handle_keydown}
              />
              <kbd
                className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-secondary)",
                }}
              >
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
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No commands found
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
                      <div
                        className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
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
                            className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                            data-index={global_index}
                            disabled={!!loading_action}
                            style={{
                              backgroundColor: is_selected
                                ? "var(--bg-secondary)"
                                : "transparent",
                            }}
                            onClick={() => !loading_action && cmd.action()}
                            onMouseEnter={() =>
                              set_selected_index(global_index)
                            }
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-tertiary)" }}
                            >
                              {is_this_loading ? (
                                <ArrowPathIcon
                                  className="w-4 h-4 animate-spin"
                                  style={{ color: "var(--text-secondary)" }}
                                />
                              ) : (
                                <Icon
                                  className="w-4 h-4"
                                  style={{ color: "var(--text-secondary)" }}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[13px] font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {cmd.label}
                              </p>
                              {cmd.description && (
                                <p
                                  className="text-[11px] truncate"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {cmd.description}
                                </p>
                              )}
                            </div>
                            {cmd.shortcut && (
                              <kbd
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                                style={{
                                  backgroundColor: "var(--bg-tertiary)",
                                  color: "var(--text-muted)",
                                  border: "1px solid var(--border-secondary)",
                                }}
                              >
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

            <div
              className="flex items-center justify-between px-4 py-2 text-[11px]"
              style={{
                borderTop: "1px solid var(--border-secondary)",
                color: "var(--text-muted)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd
                    className="px-1 py-0.5 rounded"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    ↑↓
                  </kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd
                    className="px-1 py-0.5 rounded"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    ↵
                  </kbd>
                  Select
                </span>
              </div>
              <span>{flat_commands.length} commands</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
