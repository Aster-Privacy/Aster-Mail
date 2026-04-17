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
import type { ShortcutActionId } from "@/constants/keyboard_shortcuts";

import { useCallback, useEffect, useRef } from "react";

export type KeyboardShortcutHandler = () => void;

export type KeyboardShortcutHandlers = {
  [K in `on_${ShortcutActionId}`]?: KeyboardShortcutHandler;
};

export interface UseKeyboardShortcutsConfig {
  is_any_modal_open: boolean;
  has_focused_email: boolean;
  has_viewed_email: boolean;
  handlers: KeyboardShortcutHandlers;
  enabled?: boolean;
  disable_on_touch?: boolean;
  navigation_throttle_ms?: number;
}

const EDITABLE_INPUT_TYPES = new Set([
  "text",
  "password",
  "email",
  "number",
  "search",
  "tel",
  "url",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

const EDITABLE_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "spinbutton",
]);

function get_active_element(
  root: Document | ShadowRoot = document,
): Element | null {
  const active = root.activeElement;

  if (active?.shadowRoot) {
    return get_active_element(active.shadowRoot) ?? active;
  }

  return active;
}

function is_typing(): boolean {
  const active = get_active_element();

  if (!active) return false;

  const tag_name = active.tagName.toUpperCase();

  if (tag_name === "TEXTAREA") return true;

  if (tag_name === "INPUT") {
    const input = active as HTMLInputElement;
    const input_type = (input.type || "text").toLowerCase();

    return EDITABLE_INPUT_TYPES.has(input_type);
  }

  if (tag_name === "SELECT") return true;

  if (active.getAttribute("contenteditable") === "true") return true;
  if (active.closest("[contenteditable='true']")) return true;

  const role = active.getAttribute("role");

  if (role && EDITABLE_ROLES.has(role)) return true;

  if (active instanceof HTMLElement && active.isContentEditable) return true;

  return false;
}

function is_touch_device(): boolean {
  if (typeof window === "undefined") return false;

  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  );
}

const DEFAULT_NAVIGATION_THROTTLE_MS = 50;

export function use_keyboard_shortcuts(
  config: UseKeyboardShortcutsConfig,
): void {
  const {
    is_any_modal_open,
    has_focused_email,
    has_viewed_email,
    handlers,
    enabled = true,
    disable_on_touch = false,
    navigation_throttle_ms = DEFAULT_NAVIGATION_THROTTLE_MS,
  } = config;

  const handlers_ref = useRef(handlers);

  handlers_ref.current = handlers;

  const last_navigation_time_ref = useRef(0);

  const state_ref = useRef({
    is_any_modal_open,
    has_focused_email,
    has_viewed_email,
    enabled,
    disable_on_touch,
    navigation_throttle_ms,
  });

  state_ref.current = {
    is_any_modal_open,
    has_focused_email,
    has_viewed_email,
    enabled,
    disable_on_touch,
    navigation_throttle_ms,
  };

  const handle_keydown = useCallback((e: KeyboardEvent) => {
    const {
      is_any_modal_open,
      has_focused_email,
      has_viewed_email,
      enabled,
      disable_on_touch,
      navigation_throttle_ms,
    } = state_ref.current;
    const h = handlers_ref.current;

    if (!enabled) return;
    if (disable_on_touch && is_touch_device()) return;

    const key = e.key.toLowerCase();
    const code = e.code;
    const has_cmd = e.metaKey || e.ctrlKey;
    const has_shift = e.shiftKey;
    const has_alt = e.altKey;

    if (has_alt) return;

    const handle = (handler?: () => void, allow_repeat = false) => {
      if (!handler) return false;
      if (e.repeat && !allow_repeat) return false;

      e.preventDefault();
      e.stopPropagation();
      handler();

      return true;
    };

    const handle_throttled = (handler?: () => void) => {
      if (!handler) return false;

      const now = Date.now();
      const elapsed = now - last_navigation_time_ref.current;

      if (elapsed < navigation_throttle_ms) return false;

      last_navigation_time_ref.current = now;
      e.preventDefault();
      e.stopPropagation();
      handler();

      return true;
    };

    if (has_cmd && key === "k" && !has_shift) {
      handle(h.on_search);

      return;
    }

    if (has_cmd && has_shift && key === "p") {
      handle(h.on_command_palette);

      return;
    }

    if (key === "escape") {
      if (is_any_modal_open) return;

      handle(h.on_close_viewer);

      return;
    }

    if (is_typing()) return;

    if (key === "c" && !has_cmd && !has_shift) {
      handle(h.on_compose);

      return;
    }

    if (is_any_modal_open) return;

    if (key === "j" && !has_cmd && !has_shift) {
      handle_throttled(h.on_next_email);

      return;
    }

    if (key === "k" && !has_cmd && !has_shift) {
      handle_throttled(h.on_prev_email);

      return;
    }

    if ((key === "enter" || key === "o") && !has_cmd && !has_shift) {
      if (has_focused_email) {
        handle(h.on_open_email);
      }

      return;
    }

    if (key === "u" && !has_cmd && !has_shift) {
      handle(h.on_close_viewer);

      return;
    }

    const is_question_mark =
      key === "?" ||
      (key === "/" && has_shift) ||
      (code === "Slash" && has_shift);

    if (is_question_mark) {
      handle(h.on_show_shortcuts);

      return;
    }

    if ((key === "/" || code === "Slash") && !has_cmd && !has_shift) {
      handle(h.on_search);

      return;
    }

    const has_email = has_focused_email || has_viewed_email;

    if (!has_email) return;

    if (key === "e" && !has_cmd && !has_shift) {
      handle(h.on_archive);

      return;
    }

    const is_hash =
      key === "#" ||
      (key === "3" && has_shift) ||
      (code === "Digit3" && has_shift);

    if (is_hash) {
      handle(h.on_delete);

      return;
    }

    const is_exclamation =
      key === "!" ||
      (key === "1" && has_shift) ||
      (code === "Digit1" && has_shift);

    if (is_exclamation) {
      handle(h.on_spam);

      return;
    }

    if (key === "s" && !has_cmd && !has_shift) {
      handle(h.on_toggle_star);

      return;
    }

    if (key === "i" && has_shift && !has_cmd) {
      handle(h.on_mark_read);

      return;
    }

    if (key === "u" && has_shift && !has_cmd) {
      handle(h.on_mark_unread);

      return;
    }

    if (key === "r" && !has_cmd && !has_shift) {
      if (has_viewed_email) {
        handle(h.on_reply);
      }

      return;
    }

    if (key === "a" && !has_cmd && !has_shift) {
      if (has_viewed_email) {
        handle(h.on_reply_all);
      }

      return;
    }

    if (key === "f" && !has_cmd && !has_shift) {
      if (has_viewed_email) {
        handle(h.on_forward);
      }

      return;
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handle_keydown, { capture: true });

    return () => {
      document.removeEventListener("keydown", handle_keydown, {
        capture: true,
      });
    };
  }, [handle_keydown]);
}

export { is_typing, is_touch_device, get_active_element };

export function are_shortcuts_available(): boolean {
  return !is_typing() && !is_touch_device();
}
