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
  InboxIcon,
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
  InboxStackIcon,
  MagnifyingGlassIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

import { ButtonSpinner } from "@/components/ui/spinner";
import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { build_theme_mode_update } from "@/lib/theme_sync";
import { empty_trash, type MailItem } from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { has_protected_folder_label } from "@/hooks/use_folders";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  decrypt_mail_metadata,
  bulk_update_items_metadata,
  bulk_update_metadata_by_ids,
  create_default_metadata,
} from "@/services/crypto/mail_metadata";
import {
  scan_received_items,
  scan_encrypted_items,
  DECRYPT_YIELD_CHUNK,
} from "@/services/bulk_mail_scan";
import { yield_to_browser } from "@/lib/scheduling";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { emit_mail_changed, emit_refresh_requested } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { REFRESH_STATE_MS } from "@/constants/timings";

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
  on_navigate?: (route: string) => void;
}

export function CommandPalette({
  is_open,
  on_close,
  on_compose,
  on_settings,
  on_shortcuts,
  on_navigate,
}: CommandPaletteProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const { theme, set_theme_preference } = useTheme();
  const { logout } = use_auth();
  const { preferences, update_preferences } = use_preferences();
  const [query, set_query] = useState("");
  const [selected_index, set_selected_index] = useState(0);
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const [confirm_empty_trash_open, set_confirm_empty_trash_open] =
    useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const list_ref = useRef<HTMLDivElement>(null);
  const running_ref = useRef(false);
  const on_close_ref = useRef(on_close);

  on_close_ref.current = on_close;

  const close_palette = useCallback(() => on_close_ref.current(), []);

  const go_to = useCallback(
    (route: string) => {
      if (on_navigate) {
        on_navigate(route);
      } else {
        navigate(route);
      }
      close_palette();
    },
    [on_navigate, navigate, close_palette],
  );

  const decrypt_items_metadata = useCallback(
    async (items: MailItem[]): Promise<Map<string, MailItemMetadata>> => {
      const results = new Map<string, MailItemMetadata>();

      let processed = 0;

      for (const item of items) {
        processed += 1;
        if (processed % DECRYPT_YIELD_CHUNK === 0) await yield_to_browser();

        if (!item.encrypted_metadata || !item.metadata_nonce) {
          const is_sent_type =
            item.item_type === "sent" ||
            item.item_type === "draft" ||
            item.item_type === "scheduled";
          const defaults = create_default_metadata(item.item_type);

          defaults.is_read = is_sent_type;
          if (item.message_ts) defaults.message_ts = item.message_ts;
          results.set(item.id, defaults);
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
          } else {
            const defaults = create_default_metadata(item.item_type);

            results.set(item.id, defaults);
          }
        } catch {
          const defaults = create_default_metadata(item.item_type);

          results.set(item.id, defaults);
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
      let pages_scanned = 0;
      const track_progress = (page_count: number) => {
        pages_scanned = page_count;
      };

      const { items } =
        source === "all"
          ? await scan_encrypted_items(undefined, track_progress)
          : await scan_received_items(undefined, track_progress);

      if (pages_scanned === 0) return null;

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
          emit_mail_changed();
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
          close_palette();
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
    [t, close_palette, fetch_and_filter],
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

        stale_all_view_caches();
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

        const metadata_result = await bulk_update_metadata_by_ids(ids, {
          is_archived: true,
        });

        emit_mail_changed();
        if (!metadata_result.success) {
          show_action_toast({
            message: t("common.failed_to_archive_emails"),
            action_type: "archive",
            email_ids: [],
          });
          close_palette();

          return;
        }
        show_action_toast({
          message: success_message(count),
          action_type: "archive",
          email_ids: ids,
          on_undo: async () => {
            await batch_unarchive({ ids });
            await bulk_update_metadata_by_ids(ids, { is_archived: false });
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
        close_palette();
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
    [t, close_palette, fetch_and_filter],
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
          close_palette();
        },
      },
      {
        id: "inbox",
        label: t("mail.go_to_inbox"),
        description: t("mail.view_inbox"),
        icon: InboxIcon,
        shortcut: "G I",
        category: "navigation",
        keywords: ["home", "main"],
        action: () => {
          go_to("/");
        },
      },
      {
        id: "sent",
        label: t("mail.go_to_sent"),
        description: t("mail.view_sent"),
        icon: PaperAirplaneIcon,
        shortcut: "G T",
        category: "navigation",
        keywords: ["outbox"],
        action: () => {
          go_to("/sent");
        },
      },
      {
        id: "drafts",
        label: t("mail.go_to_drafts"),
        description: t("mail.view_drafts"),
        icon: DocumentTextIcon,
        shortcut: "G D",
        category: "navigation",
        action: () => {
          go_to("/drafts");
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
          go_to("/starred");
        },
      },
      {
        id: "all_mail",
        label: t("mail.go_to_all_mail"),
        description: t("mail.view_all_mail"),
        icon: InboxStackIcon,
        shortcut: "G A",
        category: "navigation",
        keywords: ["everything"],
        action: () => {
          go_to("/all");
        },
      },
      {
        id: "archive",
        label: t("mail.go_to_archive"),
        description: t("mail.view_archived"),
        icon: ArchiveBoxIcon,
        category: "navigation",
        action: () => {
          go_to("/archive");
        },
      },
      {
        id: "trash",
        label: t("mail.go_to_trash"),
        description: t("mail.view_deleted"),
        icon: TrashIcon,
        category: "navigation",
        action: () => {
          go_to("/trash");
        },
      },
      {
        id: "spam",
        label: t("mail.go_to_spam"),
        description: t("mail.view_spam"),
        icon: ExclamationTriangleIcon,
        category: "navigation",
        action: () => {
          go_to("/spam");
        },
      },
      {
        id: "scheduled",
        label: t("mail.go_to_scheduled"),
        description: t("mail.view_scheduled"),
        icon: ClockIcon,
        category: "navigation",
        action: () => {
          go_to("/scheduled");
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
            (n) => t("common.emails_marked_as_read", { count: n }),
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
            (n) => t("common.emails_archived", { count: n }),
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
            (n) => t("common.emails_moved_to_trash", { count: n }),
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
            (n) => t("common.emails_starred", { count: n }),
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
            (n) => t("common.emails_unstarred", { count: n }),
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
        action: () => {
          set_confirm_empty_trash_open(true);
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
            (n) => t("common.spam_emails_moved_to_trash", { count: n }),
            "trash",
          ),
      },
      {
        id: "refresh",
        label: t("common.refresh_inbox"),
        description: t("mail.check_new_emails"),
        icon: ArrowPathIcon,
        category: "actions",
        keywords: ["sync", "update", "fetch", "reload"],
        action: () => {
          emit_refresh_requested();
          invalidate_mail_stats();
          show_action_toast({
            message: t("common.inbox_refreshed"),
            action_type: "refresh",
            email_ids: [],
            duration_ms: REFRESH_STATE_MS,
          });
          close_palette();
        },
      },
      {
        id: "toggle_theme",
        label:
          theme === "dark"
            ? t("mail.switch_to_light")
            : t("mail.switch_to_dark"),
        description: t("mail.toggle_theme"),
        icon: theme === "dark" ? SunIcon : MoonIcon,
        category: "settings",
        keywords: ["dark", "light", "appearance"],
        action: () => {
          const new_theme = theme === "dark" ? "light" : "dark";

          set_theme_preference(new_theme);
          update_preferences(
            build_theme_mode_update(preferences, new_theme),
            true,
          );
          close_palette();
        },
      },
      {
        id: "settings",
        label: t("mail.open_settings"),
        description: t("mail.configure_preferences"),
        icon: Cog6ToothIcon,
        category: "settings",
        keywords: ["preferences", "options", "config"],
        action: () => {
          on_settings?.();
          close_palette();
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
          close_palette();
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
          close_palette();
          await logout();
          navigate("/sign-in");
        },
      },
    ],
    [
      t,
      navigate,
      go_to,
      close_palette,
      on_compose,
      on_settings,
      on_shortcuts,
      theme,
      set_theme_preference,
      preferences,
      update_preferences,
      logout,
      execute_metadata_action,
      execute_archive_action,
    ],
  );

  const filtered_commands = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return commands;

    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(search) ||
        cmd.description?.toLowerCase().includes(search) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(search)),
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
    () => Object.values(grouped_commands).flat(),
    [grouped_commands],
  );

  const run_command = useCallback(
    (cmd: CommandAction | undefined) => {
      if (!cmd || cmd.disabled || loading_action || running_ref.current) {
        return;
      }
      running_ref.current = true;
      let result: void | Promise<void>;

      try {
        result = cmd.action();
      } catch {
        running_ref.current = false;
        show_toast(t("common.something_went_wrong"), "error");

        return;
      }
      Promise.resolve(result)
        .catch(() => {
          show_toast(t("common.something_went_wrong"), "error");
        })
        .finally(() => {
          running_ref.current = false;
        });
    },
    [loading_action, t],
  );

  useEffect(() => {
    if (is_open) {
      set_query("");
      set_selected_index(0);

      const focus_timer = setTimeout(
        () => input_ref.current?.focus(),
        FOCUS_DELAY_MS,
      );

      return () => clearTimeout(focus_timer);
    }

    return undefined;
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

  use_escape_layer(is_open, on_close, "command_palette");

  const handle_keydown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;
      const count = flat_commands.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (count > 0) set_selected_index((i) => (i + 1) % count);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (count > 0) set_selected_index((i) => (i - 1 + count) % count);
          break;
        case "Enter":
          e.preventDefault();
          if (e.repeat) break;
          run_command(flat_commands[selected_index]);
          break;
        case "Escape":
          e.preventDefault();
          close_palette();
          break;
      }
    },
    [flat_commands, selected_index, run_command, close_palette],
  );

  const category_labels: Record<string, string> = {
    navigation: t("mail.category_navigation"),
    mail: t("mail.category_mail"),
    actions: t("mail.quick_actions"),
    settings: t("settings.title"),
    view: t("mail.category_view"),
  };

  const run_empty_trash = async () => {
    set_confirm_empty_trash_open(false);
    set_loading_action("empty_trash");
    try {
      const result = await empty_trash();

      if (result.data) {
        const count = result.data.deleted_count;

        emit_mail_changed();
        show_action_toast({
          message:
            count > 0
              ? t("common.emails_permanently_deleted", { count: count })
              : t("common.trash_already_empty"),
          action_type: "trash",
          email_ids: [],
        });
      } else {
        emit_mail_changed();
        show_toast(t("common.trash_empty_failed"), "error");
      }
      close_palette();
    } catch {
      emit_mail_changed();
      show_toast(t("common.trash_empty_failed"), "error");
      close_palette();
    } finally {
      set_loading_action(null);
    }
  };

  return (
    <>
      <ConfirmationModal
        confirm_text={t("mail.empty_trash")}
        is_open={confirm_empty_trash_open}
        message={t("mail.empty_trash_confirmation")}
        on_cancel={() => set_confirm_empty_trash_open(false)}
        on_confirm={run_empty_trash}
        title={t("mail.empty_trash_question")}
        variant="danger"
      />
      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[15vh]"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <motion.div
              className="absolute inset-0 aster_scrim"
              onClick={on_close}
            />
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="relative w-full max-w-[620px]"
              exit={{ opacity: 0, y: -4 }}
              initial={reduce_motion ? false : { opacity: 0, y: -4 }}
              transition={{
                duration: reduce_motion ? 0 : 0.14,
                ease: "easeOut",
              }}
            >
              <div className="flex items-center gap-2 h-10 ps-4 pe-3 aster_search_open rounded-t-[22px]">
                <MagnifyingGlassIcon className="w-5 h-5 flex-shrink-0 text-[var(--text-secondary)]" />
                <input
                  ref={input_ref}
                  className="flex-1 min-w-0 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  placeholder={t("common.type_command_or_search")}
                  type="text"
                  value={query}
                  onChange={(e) => set_query(e.target.value)}
                  onKeyDown={handle_keydown}
                />
                <kbd className="flex-shrink-0 font-sans text-[11px] text-[var(--text-muted)]">
                  ESC
                </kbd>
              </div>

              <div className="overflow-hidden aster_search_open aster_search_open_panel rounded-b-[22px]">
                <div
                  ref={list_ref}
                  className="max-h-[420px] overflow-y-auto border-t border-[var(--aster-floating-divider,var(--border-secondary))] p-1.5"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {flat_commands.length === 0 ? (
                    <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                      <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                      <p className="text-sm text-[var(--text-muted)]">
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
                        <div key={category} className="pb-1">
                          <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-[var(--text-muted)]">
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
                                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-start ${is_selected ? "bg-[var(--aster-floating-hover,var(--bg-hover))]" : "bg-transparent"}`}
                                data-index={global_index}
                                disabled={!!loading_action}
                                type="button"
                                onClick={() => run_command(cmd)}
                                onMouseMove={() => {
                                  if (selected_index !== global_index) {
                                    set_selected_index(global_index);
                                  }
                                }}
                              >
                                <Icon
                                  className="w-4 h-4 flex-shrink-0"
                                  style={{
                                    color: is_selected
                                      ? "var(--text-primary)"
                                      : "var(--icon-secondary)",
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] truncate text-[var(--text-primary)]">
                                    {cmd.label}
                                  </p>
                                  {cmd.description && (
                                    <p className="text-[12px] truncate text-[var(--text-muted)]">
                                      {cmd.description}
                                    </p>
                                  )}
                                </div>
                                {cmd.shortcut && !is_this_loading && (
                                  <kbd className="flex-shrink-0 font-sans text-[11px] tracking-[0.08em] text-[var(--text-muted)]">
                                    {cmd.shortcut}
                                  </kbd>
                                )}
                                {is_this_loading && (
                                  <ButtonSpinner
                                    className="text-[var(--icon-secondary)]"
                                    size="xs"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center gap-4 px-4 py-2.5 text-[11px] border-t border-[var(--aster-floating-divider,var(--border-secondary))] text-[var(--text-muted)]">
                  <span>↑↓ {t("common.navigate")}</span>
                  <span>↵ {t("mail.select")}</span>
                  <span className="ms-auto">
                    {t("common.commands_count", {
                      count: flat_commands.length,
                    })}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
