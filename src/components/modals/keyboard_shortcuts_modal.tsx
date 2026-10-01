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
  label,
  on_toggle,
}: {
  enabled: boolean;
  label: string;
  on_toggle: () => void;
}) {
  return (
    <Switch
      aria-label={label}
      checked={enabled}
      size="sm"
      onCheckedChange={on_toggle}
    />
  );
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
    archive: "mail.archive_action",
    delete: "mail.shortcut_delete_trash",
    spam: "mail.mark_as_spam",
    toggle_star: "mail.shortcut_star_unstar",
    mark_read: "mail.mark_as_read",
    mark_unread: "mail.mark_as_unread",
    snooze: "mail.snooze",
    select_email: "mail.select",
    go_inbox: "mail.inbox",
    go_starred: "mail.starred",
    go_sent: "mail.sent",
    go_drafts: "mail.drafts",
    go_all: "mail.all_mail",
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
    } else if (key.includes(" ")) {
      for (const part of key.split(" ")) {
        keys.push(part.toUpperCase());
      }
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

  const render_keys = (keys: string[]) => (
    <span className="flex items-center gap-1">
      {keys.map((key, kidx) => (
        <kbd
          key={kidx}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-[7px] bg-[var(--aster-dialog-bg,var(--modal-bg))] px-1.5 font-sans text-[12px] font-semibold text-txt-primary shadow-[inset_0_-1px_0_var(--aster-floating-divider),0_0_0_1px_var(--aster-floating-divider)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );

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
          <div
            aria-hidden="true"
            className="aster_scrim absolute inset-0"
            onClick={on_close}
          />
          <motion.div
            ref={modal_ref}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-dialog-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)]"
            exit={{ opacity: 0, scale: 0.97 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97 }}
            transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-5">
              <h2
                className="text-[17px] font-semibold text-txt-primary"
                id="keyboard-shortcuts-title"
              >
                {t("common.keyboard_shortcuts")}
              </h2>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-txt-secondary">
                  {t("common.enable_shortcuts")}
                  <ShortcutToggle
                    enabled={preferences.keyboard_shortcuts_enabled}
                    label={t("common.enable_shortcuts")}
                    on_toggle={handle_toggle_shortcuts}
                  />
                </label>
                <button
                  ref={close_button_ref}
                  aria-label={t("common.close")}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
                  type="button"
                  onClick={on_close}
                >
                  <XMarkIcon aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-2"
              style={{ scrollbarWidth: "thin" }}
            >
              {!preferences.keyboard_shortcuts_enabled && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--aster-dialog-bg,var(--modal-bg))]/90">
                  <span className="rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] px-4 py-2 text-[13px] font-medium text-txt-secondary">
                    {t("common.shortcuts_disabled_message")}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                {shortcut_sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-txt-muted">
                      {section.title}
                    </h3>
                    <div className="overflow-hidden rounded-[var(--aster-radius-control,16px)] bg-[var(--aster-field-bg)]">
                      {section.shortcuts.map((shortcut, sidx) => {
                        const alternatives = get_alternative_shortcuts(
                          shortcut.action_id,
                        );

                        return (
                          <div
                            key={shortcut.action_id}
                            className={`flex h-11 items-center justify-between gap-4 px-4 ${sidx > 0 ? "border-t border-[var(--aster-floating-divider)]" : ""}`}
                          >
                            <span className="truncate text-[14px] text-txt-primary">
                              {t(shortcut_description_keys[shortcut.action_id])}
                            </span>
                            <span className="flex flex-shrink-0 items-center gap-2">
                              {render_keys(
                                format_key(shortcut.key, shortcut.modifier),
                              )}
                              {alternatives.map((alt) => (
                                <span
                                  key={`${alt.action_id}-${alt.key}`}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-[12px] text-txt-muted">
                                    {t("common.or_conjunction")}
                                  </span>
                                  {render_keys(
                                    format_key(alt.key, alt.modifier),
                                  )}
                                </span>
                              ))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-6 py-4 text-[13px] text-txt-muted">
              <span className="flex items-center gap-2">
                {t("common.press_label")}
                {render_keys(["?"])}
                {t("common.anywhere_to_open_shortcuts")}
              </span>
              <span className="flex items-center gap-2">
                {t("common.showing_shortcuts_for")}
                <span className="rounded-full bg-[var(--aster-field-bg)] px-2.5 py-1 font-medium text-txt-secondary">
                  {is_mac ? t("settings.macos") : t("settings.windows_linux")}
                </span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
