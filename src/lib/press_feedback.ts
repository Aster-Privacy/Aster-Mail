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
export const PRESS_ATTRIBUTE = "data-aster-press";
export const PRESS_MODE_ATTRIBUTE = "data-aster-press-mode";
export const PRESS_MIN_HOLD_MS = 100;
export const PRESS_RELEASE_MS = 160;
export const PRESS_TOUCH_DELAY_MS = 60;

const INTERACTIVE_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  "summary",
  "a[href]",
  "[data-pressable]",
].join(",");

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

const DISABLED_SELECTOR =
  ':disabled, [aria-disabled="true"], [data-disabled], [data-no-press]';

const MAX_POINTER_FALLBACK_DEPTH = 8;
const MAX_FALLBACK_VIEWPORT_SHARE = 0.25;

type PressMode = "tint" | "shade" | "filter";

function is_inline_text(el: Element): boolean {
  return getComputedStyle(el).display === "inline";
}

function find_pointer_cursor_host(start: Element): HTMLElement | null {
  let node: Element | null = start;
  let depth = 0;

  while (node && depth < MAX_POINTER_FALLBACK_DEPTH) {
    if (!(node instanceof HTMLElement)) return null;
    if (node === document.body || node === document.documentElement) {
      return null;
    }
    const cursor = getComputedStyle(node).cursor;

    if (cursor !== "pointer") return null;
    const parent = node.parentElement;
    const parent_cursor = parent ? getComputedStyle(parent).cursor : "auto";

    if (parent_cursor !== "pointer") {
      const rect = node.getBoundingClientRect();
      const viewport = window.innerWidth * window.innerHeight;

      if (
        viewport > 0 &&
        rect.width * rect.height > viewport * MAX_FALLBACK_VIEWPORT_SHARE
      ) {
        return null;
      }

      return node;
    }
    node = parent;
    depth += 1;
  }

  return null;
}

export function find_press_target(
  start: EventTarget | null,
): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  if (start.closest(EDITABLE_SELECTOR)) return null;
  const matched = start.closest(INTERACTIVE_SELECTOR);
  const target =
    matched instanceof HTMLElement ? matched : find_pointer_cursor_host(start);

  if (!target) return null;
  if (target.closest(DISABLED_SELECTOR)) return null;
  if (target.matches("a[href]") && is_inline_text(target)) return null;

  return target;
}

function parse_alpha(color: string): number {
  if (color === "transparent") return 0;
  const match = color.match(/rgba?\(([^)]+)\)/);

  if (!match) return 1;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);

  if (parts.length < 4) return 1;
  const alpha = parts[3];

  return alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
}

function parse_luminance(color: string): number | null {
  const match = color.match(/rgba?\(([^)]+)\)/);

  if (!match) return null;
  const parts = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(parseFloat);

  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;

  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
}

export function pick_press_mode(el: HTMLElement): PressMode {
  const style = getComputedStyle(el);

  if (style.backgroundImage && style.backgroundImage !== "none") {
    return "filter";
  }
  if (parse_alpha(style.backgroundColor) < 0.5) return "tint";
  const text = parse_luminance(style.color);
  const background = parse_luminance(style.backgroundColor);

  if (text !== null && background !== null && text > background) {
    return "shade";
  }

  return "tint";
}

export function start_press_feedback(): () => void {
  if (typeof document === "undefined") return () => {};

  let current: HTMLElement | null = null;
  let down_at = 0;
  let is_down = false;
  let hold_timer: ReturnType<typeof setTimeout> | null = null;
  let release_timer: ReturnType<typeof setTimeout> | null = null;
  let touch_timer: ReturnType<typeof setTimeout> | null = null;
  let pending_touch: HTMLElement | null = null;

  const clear_timers = () => {
    if (hold_timer) clearTimeout(hold_timer);
    if (release_timer) clearTimeout(release_timer);
    if (touch_timer) clearTimeout(touch_timer);
    hold_timer = null;
    release_timer = null;
    touch_timer = null;
  };

  const clear_element = (el: HTMLElement) => {
    el.removeAttribute(PRESS_ATTRIBUTE);
    el.removeAttribute(PRESS_MODE_ATTRIBUTE);
  };

  const press = (el: HTMLElement) => {
    clear_timers();
    pending_touch = null;
    if (current && current !== el) clear_element(current);
    clear_element(el);
    el.setAttribute(PRESS_MODE_ATTRIBUTE, pick_press_mode(el));
    el.setAttribute(PRESS_ATTRIBUTE, "down");
    current = el;
    down_at = performance.now();
    is_down = true;
  };

  const release = () => {
    if (!current || !is_down) return;
    is_down = false;
    const el = current;
    const wait = Math.max(0, PRESS_MIN_HOLD_MS - (performance.now() - down_at));

    hold_timer = setTimeout(() => {
      hold_timer = null;
      el.setAttribute(PRESS_ATTRIBUTE, "release");
      release_timer = setTimeout(() => {
        release_timer = null;
        if (el.getAttribute(PRESS_ATTRIBUTE) === "release") clear_element(el);
        if (current === el) current = null;
      }, PRESS_RELEASE_MS);
    }, wait);
  };

  const cancel = () => {
    clear_timers();
    pending_touch = null;
    is_down = false;
    if (current) clear_element(current);
    current = null;
  };

  const handle_pointer_down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = find_press_target(e.target);

    if (!target) return;
    if (e.pointerType === "touch") {
      if (touch_timer) clearTimeout(touch_timer);
      pending_touch = target;
      touch_timer = setTimeout(() => {
        touch_timer = null;
        if (pending_touch === target) press(target);
      }, PRESS_TOUCH_DELAY_MS);

      return;
    }
    press(target);
  };

  const handle_pointer_up = () => {
    if (pending_touch) {
      const el = pending_touch;

      press(el);
    }
    release();
  };

  const handle_key_down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = find_press_target(document.activeElement);

    if (!target || target !== document.activeElement) return;
    press(target);
  };

  const handle_key_up = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    release();
  };

  const handle_mouse_down = (e: MouseEvent) => {
    if (e.detail < 2) return;
    if (!find_press_target(e.target)) return;
    e.preventDefault();
  };

  const handle_select_start = (e: Event) => {
    if (!is_down || !current) return;
    if (!(e.target instanceof Node)) return;
    const origin =
      e.target instanceof Element ? e.target : e.target.parentElement;

    if (origin && origin.closest(EDITABLE_SELECTOR)) return;
    if (current.contains(e.target)) e.preventDefault();
  };

  const options = { capture: true, passive: true } as const;

  document.addEventListener("pointerdown", handle_pointer_down, options);
  document.addEventListener("pointerup", handle_pointer_up, options);
  document.addEventListener("pointercancel", cancel, options);
  document.addEventListener("dragstart", cancel, options);
  document.addEventListener("keydown", handle_key_down, options);
  document.addEventListener("keyup", handle_key_up, options);
  document.addEventListener("mousedown", handle_mouse_down, true);
  document.addEventListener("selectstart", handle_select_start, true);
  window.addEventListener("blur", cancel);

  return () => {
    cancel();
    document.removeEventListener("pointerdown", handle_pointer_down, options);
    document.removeEventListener("pointerup", handle_pointer_up, options);
    document.removeEventListener("pointercancel", cancel, options);
    document.removeEventListener("dragstart", cancel, options);
    document.removeEventListener("keydown", handle_key_down, options);
    document.removeEventListener("keyup", handle_key_up, options);
    document.removeEventListener("mousedown", handle_mouse_down, true);
    document.removeEventListener("selectstart", handle_select_start, true);
    window.removeEventListener("blur", cancel);
  };
}
