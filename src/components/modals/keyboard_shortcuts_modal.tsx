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
import type { TranslationKey } from "@/lib/i18n/types";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import {
  get_unique_shortcuts_by_category,
  get_all_shortcuts_for_action,
  type ShortcutDefinition,
  type ShortcutModifier,
  type ShortcutActionId,
} from "@/constants/keyboard_shortcuts";
import { is_mac_platform } from "@/lib/utils";
import { use_preferences } from "@/contexts/preferences_context";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface KeyboardShortcutsModalProps {
  is_open: boolean;
  on_close: () => void;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutDefinition[];
}

function ShortcutToggle({
  enabled,
  on_toggle,
}: {
  enabled: boolean;
  on_toggle: () => void;
}) {
  return <Switch checked={enabled} size="sm" onCheckedChange={on_toggle} />;
}

export function KeyboardShortcutsModal({
  is_open,
  on_close,
}: KeyboardShortcutsModalProps) {
  const { t } = use_i18n();

  const shortcut_description_keys: Record<ShortcutActionId, TranslationKey> = {
    next_email: "mail.shortcut_next_email",
    prev_email: "mail.shortcut_previous_email",
    open_email: "mail.shortcut_open_email",
    close_viewer: "mail.shortcut_close_back",
    archive: "mail.archive",
    delete: "mail.shortcut_delete_trash",
    spam: "mail.mark_as_spam",
    toggle_star: "mail.shortcut_star_unstar",
    mark_read: "mail.mark_as_read",
    mark_unread: "mail.mark_as_unread",
    compose: "mail.shortcut_compose_new",
    reply: "mail.reply",
    reply_all: "mail.reply_all",
    forward: "mail.forward",
    search: "mail.shortcut_search",
    command_palette: "mail.shortcut_command_palette",
    show_shortcuts: "mail.shortcut_show_shortcuts",
  };

  const reduce_motion = use_should_reduce_motion();
  const [is_mac, set_is_mac] = useState(false);
  const modal_ref = useRef<HTMLDivElement>(null);
  const close_button_ref = useRef<HTMLButtonElement>(null);
  const previous_active_element = useRef<Element | null>(null);
  const { preferences, update_preference } = use_preferences();

  useEffect(() => {
    set_is_mac(is_mac_platform());
  }, []);

  useEffect(() => {
    if (is_open) {
      previous_active_element.current = document.activeElement;
      close_button_ref.current?.focus();
    } else if (previous_active_element.current instanceof HTMLElement) {
      previous_active_element.current.focus();
    }
  }, [is_open]);

  const handle_keydown = useCallback(
    (e: KeyboardEvent) => {
      if (!is_open) return;

      if (e["key"] === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();

        return;
      }

      if (e["key"] === "Tab" && modal_ref.current) {
        const focusable = modal_ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [is_open, on_close],
  );

  useEffect(() => {
    if (is_open) {
      document.addEventListener("keydown", handle_keydown, { capture: true });

      return () => {
        document.removeEventListener("keydown", handle_keydown, {
          capture: true,
        });
      };
    }
  }, [is_open, handle_keydown]);

  const shortcut_sections: ShortcutSection[] = useMemo(
    () => [
      {
        title: t("common.navigation"),
        shortcuts: get_unique_shortcuts_by_category("navigation"),
      },
      {
        title: t("common.actions"),
        shortcuts: get_unique_shortcuts_by_category("actions"),
      },
      {
        title: t("settings.compose"),
        shortcuts: get_unique_shortcuts_by_category("compose"),
      },
      {
        title: t("common.global"),
        shortcuts: get_unique_shortcuts_by_category("global"),
      },
    ],
    [t],
  );

  const format_key = (key: string, modifier?: ShortcutModifier): string[] => {
    const keys: string[] = [];

    if (modifier === "cmd+shift" || modifier === "ctrl+shift") {
      keys.push(is_mac ? "⌘" : "Ctrl");
      keys.push(is_mac ? "⇧" : "Shift");
    } else if (modifier === "cmd" || modifier === "ctrl") {
      keys.push(is_mac ? "⌘" : "Ctrl");
    } else if (modifier === "shift") {
      keys.push(is_mac ? "⇧" : "Shift");
    } else if (modifier === "alt") {
      keys.push(is_mac ? "⌥" : "Alt");
    }

    if (key === "Enter") {
      keys.push("↵");
    } else if (key === "Escape") {
      keys.push("Esc");
    } else {
      keys.push(key.toUpperCase());
    }

    return keys;
  };

  const get_alternative_shortcuts = (
    action_id: string,
  ): ShortcutDefinition[] => {
    const all_shortcuts = get_all_shortcuts_for_action(action_id);

    return all_shortcuts.slice(1);
  };

  const handle_toggle_shortcuts = () => {
    update_preference(
      "keyboard_shortcuts_enabled",
      !preferences.keyboard_shortcuts_enabled,
      true,
    );
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          aria-labelledby="keyboard-shortcuts-title"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          role="dialog"
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={on_close}
          />
          <motion.div
            ref={modal_ref}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-4xl max-h-[85vh] rounded-xl border overflow-hidden"
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid var(--border-secondary)" }}
            >
              <h2
                className="text-[16px] font-semibold"
                id="keyboard-shortcuts-title"
                style={{ color: "var(--text-primary)" }}
              >
                {t("common.keyboard_shortcuts")}
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("common.enable_shortcuts")}
                  </span>
                  <ShortcutToggle
                    enabled={preferences.keyboard_shortcuts_enabled}
                    on_toggle={handle_toggle_shortcuts}
                  />
                </div>
                <button
                  ref={close_button_ref}
                  aria-label={t("common.close")}
                  className="p-1.5 rounded-[14px] transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                  style={{ color: "var(--text-muted)" }}
                  onClick={on_close}
                >
                  <XMarkIcon aria-hidden="true" className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div
              className="relative overflow-y-auto px-6 py-5"
              style={{
                maxHeight: "calc(85vh - 130px)",
                scrollbarWidth: "thin",
              }}
            >
              {!preferences.keyboard_shortcuts_enabled && (
                <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm rounded-b-xl">
                  <span
                    className="text-[13px] font-medium px-4 py-2 rounded-lg"
                    style={{
                      color: "var(--text-secondary)",
                      backgroundColor: "var(--bg-tertiary)",
                      border: "1px solid var(--border-secondary)",
                    }}
                  >
                    {t("common.shortcuts_disabled_message")}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                {shortcut_sections.map((section) => (
                  <div key={section.title}>
                    <h3
                      className="text-[11px] font-semibold uppercase tracking-wider mb-3 pb-2"
                      style={{
                        color: "var(--text-muted)",
                        borderBottom: "1px solid var(--border-secondary)",
                      }}
                    >
                      {section.title}
                    </h3>
                    <div className="space-y-1">
                      {section.shortcuts.map((shortcut) => {
                        const keys = format_key(
                          shortcut.key,
                          shortcut.modifier,
                        );
                        const alternatives = get_alternative_shortcuts(
                          shortcut.action_id,
                        );

                        return (
                          <div
                            key={shortcut.action_id}
                            className="flex items-center justify-between py-1.5"
                          >
                            <span
                              className="text-[13px]"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {t(shortcut_description_keys[shortcut.action_id])}
                            </span>
                            <div className="flex items-center gap-2 ml-4">
                              <div className="flex items-center gap-0.5">
                                {keys.map((key, kidx) => (
                                  <kbd
                                    key={kidx}
                                    className="min-w-[22px] h-[22px] px-1.5 rounded flex items-center justify-center text-[11px] font-medium"
                                    style={{
                                      backgroundColor: "var(--bg-tertiary)",
                                      color: "var(--text-secondary)",
                                      border:
                                        "1px solid var(--border-secondary)",
                                      boxShadow:
                                        "0 1px 0 var(--border-secondary)",
                                    }}
                                  >
                                    {key}
                                  </kbd>
                                ))}
                              </div>
                              {alternatives.length > 0 && (
                                <>
                                  <span
                                    className="text-[10px] px-1"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    {t("common.or_conjunction")}
                                  </span>
                                  {alternatives.map((alt) => {
                                    const alt_keys = format_key(
                                      alt.key,
                                      alt.modifier,
                                    );

                                    return (
                                      <div
                                        key={`${alt.action_id}-${alt.key}`}
                                        className="flex items-center gap-0.5"
                                      >
                                        {alt_keys.map((key, kidx) => (
                                          <kbd
                                            key={kidx}
                                            className="min-w-[22px] h-[22px] px-1.5 rounded flex items-center justify-center text-[11px] font-medium"
                                            style={{
                                              backgroundColor:
                                                "var(--bg-tertiary)",
                                              color: "var(--text-secondary)",
                                              border:
                                                "1px solid var(--border-secondary)",
                                              boxShadow:
                                                "0 1px 0 var(--border-secondary)",
                                            }}
                                          >
                                            {key}
                                          </kbd>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="px-6 py-3 flex items-center justify-between text-[12px]"
              style={{
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border-secondary)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2">
                  {t("common.press_label")}
                  <kbd
                    className="min-w-[20px] h-[18px] px-1.5 rounded flex items-center justify-center text-[10px] font-medium"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-secondary)",
                    }}
                  >
                    ?
                  </kbd>
                  {t("common.anywhere_to_open_shortcuts")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{t("common.showing_shortcuts_for")}</span>
                <span
                  className="px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  {is_mac ? t("settings.macos") : t("settings.windows_linux")}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
