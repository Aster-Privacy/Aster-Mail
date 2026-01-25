import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon, CommandLineIcon } from "@heroicons/react/24/outline";

import {
  get_unique_shortcuts_by_category,
  get_all_shortcuts_for_action,
  type ShortcutDefinition,
  type ShortcutModifier,
} from "@/constants/keyboard_shortcuts";
import { is_mac_platform } from "@/lib/utils";
import { use_preferences } from "@/contexts/preferences_context";

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
  return (
    <button
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
      style={{
        backgroundColor: enabled
          ? "var(--accent-color)"
          : "var(--border-secondary)",
      }}
      type="button"
      onClick={on_toggle}
    >
      <span
        className={
          "inline-block h-3.5 w-3.5 rounded-full transition-transform duration-200 " +
          (enabled ? "translate-x-[18px]" : "translate-x-1")
        }
        style={{
          backgroundColor: enabled ? "#ffffff" : "var(--bg-card)",
        }}
      />
    </button>
  );
}

export function KeyboardShortcutsModal({
  is_open,
  on_close,
}: KeyboardShortcutsModalProps) {
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

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();

        return;
      }

      if (e.key === "Tab" && modal_ref.current) {
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
        title: "Navigation",
        shortcuts: get_unique_shortcuts_by_category("navigation"),
      },
      {
        title: "Actions",
        shortcuts: get_unique_shortcuts_by_category("actions"),
      },
      {
        title: "Compose",
        shortcuts: get_unique_shortcuts_by_category("compose"),
      },
      {
        title: "Global",
        shortcuts: get_unique_shortcuts_by_category("global"),
      },
    ],
    [],
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="dialog"
          transition={{ duration: 0.15 }}
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
            initial={{ opacity: 0, scale: 0.96, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid var(--border-secondary)" }}
            >
              <div className="flex items-center gap-3">
                <CommandLineIcon
                  aria-hidden="true"
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
                <div>
                  <h2
                    className="text-[16px] font-semibold"
                    id="keyboard-shortcuts-title"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Keyboard Shortcuts
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Enable shortcuts
                  </span>
                  <ShortcutToggle
                    enabled={preferences.keyboard_shortcuts_enabled}
                    on_toggle={handle_toggle_shortcuts}
                  />
                </div>
                <button
                  ref={close_button_ref}
                  aria-label="Close keyboard shortcuts"
                  className="p-1.5 rounded-lg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                  style={{ color: "var(--text-muted)" }}
                  onClick={on_close}
                >
                  <XMarkIcon aria-hidden="true" className="w-5 h-5" />
                </button>
              </div>
            </div>

            {!preferences.keyboard_shortcuts_enabled && (
              <div
                className="px-6 py-3 flex items-center gap-2"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  borderBottom: "1px solid var(--border-secondary)",
                }}
              >
                <span
                  className="text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Keyboard shortcuts are currently disabled. Enable them above
                  to use these shortcuts.
                </span>
              </div>
            )}

            <div
              className="overflow-y-auto px-6 py-5"
              style={{
                maxHeight: preferences.keyboard_shortcuts_enabled
                  ? "calc(85vh - 130px)"
                  : "calc(85vh - 180px)",
                scrollbarWidth: "thin",
                opacity: preferences.keyboard_shortcuts_enabled ? 1 : 0.5,
              }}
            >
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
                              {shortcut.description}
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
                                    or
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
                  Press
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
                  anywhere to open this modal
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>Showing shortcuts for</span>
                <span
                  className="px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  {is_mac ? "macOS" : "Windows/Linux"}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
