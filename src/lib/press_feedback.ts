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
export const PRESS_WAVE_ATTRIBUTE = "data-aster-press-wave";
export const PRESS_MIN_HOLD_MS = 225;
export const PRESS_RELEASE_MS = 375;
export const PRESS_TOUCH_DELAY_MS = 150;
export const PRESS_SLOP_PX = 8;
export const RIPPLE_SOLID_SHARE = 0.65;
export const RIPPLE_START_SHARE = 0.1;

const RIPPLE_PROPERTIES = [
  "--aster-ripple-from-x",
  "--aster-ripple-from-y",
  "--aster-ripple-from-r",
  "--aster-ripple-to-x",
  "--aster-ripple-to-y",
  "--aster-ripple-to-r",
] as const;

const OVERLAY_CLASS = "aster_press_overlay";

const INTERACTIVE_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="treeitem"]',
  '[role="link"]',
  "summary",
  "a[href]",
  "[data-pressable]",
].join(",");

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

const DISABLED_SELECTOR =
  ':disabled, [aria-disabled="true"], [data-disabled], [data-no-press]';

const SELECTABLE_SELECTOR = "[data-selectable], .select-text";

const SKIP_SELECTOR = "[data-press-skip]";

const CLOSING_SURFACE_SELECTOR = [
  '[role="dialog"][data-state="closed"]',
  '[role="alertdialog"][data-state="closed"]',
  '[role="menu"][data-state="closed"]',
  '[role="listbox"][data-state="closed"]',
].join(",");

const OWNER_DRIFT_PX = 2;
const OWNER_MIN_SCALE = 0.5;
const OWNER_FADE_TOLERANCE = 0.05;

const MAX_HIDDEN_CHECK_DEPTH = 6;

const MAX_POINTER_FALLBACK_DEPTH = 8;
const MAX_FALLBACK_VIEWPORT_SHARE = 0.25;

type PressMode = "tint" | "shade" | "filter";

function is_inline_text(el: Element): boolean {
  return getComputedStyle(el).display === "inline";
}

function is_visually_hidden(el: Element): boolean {
  let node: Element | null = el;
  let depth = 0;

  while (node && depth < MAX_HIDDEN_CHECK_DEPTH) {
    const style = getComputedStyle(node);

    if (style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
      return true;
    }
    node = node.parentElement;
    depth += 1;
  }

  return false;
}

function ancestor_opacity(el: Element): number {
  let node: Element | null = el.parentElement;
  let opacity = 1;

  while (node && node !== document.documentElement) {
    opacity *= parseFloat(getComputedStyle(node).opacity) || 0;
    if (opacity === 0) return 0;
    node = node.parentElement;
  }

  return opacity;
}

export function is_point_inside(
  rect: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
    const parent: HTMLElement | null = node.parentElement;
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
  if (target.matches(SKIP_SELECTOR)) return null;
  if (target.closest(DISABLED_SELECTOR)) return null;
  if (is_visually_hidden(target)) return null;
  if (target.matches('a[href], [role="link"]') && is_inline_text(target)) {
    return null;
  }

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

export interface RippleGeometry {
  from_x: number;
  from_y: number;
  from_r: number;
  to_x: number;
  to_y: number;
  to_r: number;
}

export function ripple_geometry(
  width: number,
  height: number,
  press_x: number | null,
  press_y: number | null,
): RippleGeometry {
  const to_x = width / 2;
  const to_y = height / 2;
  const half_diagonal = Math.sqrt(width * width + height * height) / 2;
  const from_x =
    press_x === null ? to_x : Math.min(Math.max(press_x, 0), width);
  const from_y =
    press_y === null ? to_y : Math.min(Math.max(press_y, 0), height);

  return {
    from_x,
    from_y,
    from_r: Math.max(width, height) * RIPPLE_START_SHARE,
    to_x,
    to_y,
    to_r: half_diagonal / RIPPLE_SOLID_SHARE,
  };
}

function apply_ripple(el: HTMLElement, geometry: RippleGeometry): void {
  const values = [
    geometry.from_x,
    geometry.from_y,
    geometry.from_r,
    geometry.to_x,
    geometry.to_y,
    geometry.to_r,
  ];

  RIPPLE_PROPERTIES.forEach((name, index) => {
    el.style.setProperty(name, `${Math.round(values[index] * 10) / 10}px`);
  });
}

function clear_ripple(el: HTMLElement): void {
  RIPPLE_PROPERTIES.forEach((name) => el.style.removeProperty(name));
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
  let tracked_pointer: number | null = null;
  let origin_x = 0;
  let origin_y = 0;
  let wave = 0;
  let tracked_type = "";
  let overlay: HTMLElement | null = null;
  let overlay_owner: HTMLElement | null = null;
  let overlay_rect: DOMRect | null = null;
  let overlay_opacity = 1;
  let watch_frame: number | null = null;

  const get_overlay = (): HTMLElement => {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    return overlay;
  };

  const stop_watch = () => {
    if (watch_frame !== null) cancelAnimationFrame(watch_frame);
    watch_frame = null;
  };

  const hide_overlay = () => {
    stop_watch();
    overlay_rect = null;
    if (!overlay) return;
    overlay.removeAttribute(PRESS_ATTRIBUTE);
    overlay.removeAttribute(PRESS_MODE_ATTRIBUTE);
    overlay.removeAttribute(PRESS_WAVE_ATTRIBUTE);
    overlay_owner = null;
  };

  const clear_timers = () => {
    if (hold_timer) clearTimeout(hold_timer);
    if (release_timer) clearTimeout(release_timer);
    if (touch_timer) clearTimeout(touch_timer);
    hold_timer = null;
    release_timer = null;
    touch_timer = null;
  };

  const is_owner_gone = (owner: HTMLElement): boolean => {
    if (!owner.isConnected) return true;
    if (owner.closest(CLOSING_SURFACE_SELECTOR)) return true;
    const rect = owner.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return true;
    if (overlay_rect) {
      const center_dx =
        rect.left +
        rect.width / 2 -
        (overlay_rect.left + overlay_rect.width / 2);
      const center_dy =
        rect.top +
        rect.height / 2 -
        (overlay_rect.top + overlay_rect.height / 2);

      if (
        Math.abs(center_dx) > OWNER_DRIFT_PX ||
        Math.abs(center_dy) > OWNER_DRIFT_PX ||
        rect.width < overlay_rect.width * OWNER_MIN_SCALE ||
        rect.height < overlay_rect.height * OWNER_MIN_SCALE
      ) {
        return true;
      }
    }

    return ancestor_opacity(owner) < overlay_opacity - OWNER_FADE_TOLERANCE;
  };

  const follow_owner = (owner: HTMLElement) => {
    if (!overlay) return;
    const rect = owner.getBoundingClientRect();

    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };

  const guard_overlay = (): boolean => {
    if (!overlay_owner) return false;
    if (!is_owner_gone(overlay_owner)) return false;
    hide_overlay();

    return true;
  };

  const watch_overlay = () => {
    watch_frame = null;
    if (!overlay_owner || guard_overlay()) return;
    follow_owner(overlay_owner);
    watch_frame = requestAnimationFrame(watch_overlay);
  };

  const clear_element = (el: HTMLElement) => {
    el.removeAttribute(PRESS_ATTRIBUTE);
    el.removeAttribute(PRESS_MODE_ATTRIBUTE);
    el.removeAttribute(PRESS_WAVE_ATTRIBUTE);
    clear_ripple(el);
    if (overlay_owner === el) hide_overlay();
  };

  const set_state = (el: HTMLElement, state: "down" | "release") => {
    el.setAttribute(PRESS_ATTRIBUTE, state);
    if (overlay_owner === el && overlay) {
      overlay.setAttribute(PRESS_ATTRIBUTE, state);
    }
  };

  const press = (el: HTMLElement, point: { x: number; y: number } | null) => {
    clear_timers();
    pending_touch = null;
    if (current && current !== el) clear_element(current);
    clear_element(el);
    const mode = pick_press_mode(el);
    const rect = el.getBoundingClientRect();
    const geometry = ripple_geometry(
      rect.width,
      rect.height,
      point ? point.x - rect.left : null,
      point ? point.y - rect.top : null,
    );

    wave = wave === 0 ? 1 : 0;
    const wave_name = wave === 0 ? "a" : "b";

    if (mode === "filter") {
      const layer = get_overlay();
      const style = getComputedStyle(el);

      layer.style.left = `${rect.left}px`;
      layer.style.top = `${rect.top}px`;
      layer.style.width = `${rect.width}px`;
      layer.style.height = `${rect.height}px`;
      layer.style.borderRadius = style.borderRadius;
      layer.style.color = style.color;
      apply_ripple(layer, geometry);
      layer.setAttribute(PRESS_MODE_ATTRIBUTE, "tint");
      layer.setAttribute(PRESS_WAVE_ATTRIBUTE, wave_name);
      overlay_owner = el;
      overlay_rect = rect;
      overlay_opacity = ancestor_opacity(el);
      stop_watch();
      watch_frame = requestAnimationFrame(watch_overlay);
    } else {
      apply_ripple(el, geometry);
    }
    el.setAttribute(PRESS_MODE_ATTRIBUTE, mode);
    el.setAttribute(PRESS_WAVE_ATTRIBUTE, wave_name);
    set_state(el, "down");
    current = el;
    down_at = performance.now();
    is_down = true;
  };

  const release = () => {
    if (!current || !is_down) return;
    is_down = false;
    const el = current;
    const wait = Math.max(0, PRESS_MIN_HOLD_MS - (performance.now() - down_at));

    guard_overlay();
    hold_timer = setTimeout(() => {
      hold_timer = null;
      guard_overlay();
      set_state(el, "release");
      release_timer = setTimeout(() => {
        release_timer = null;
        guard_overlay();
        if (el.getAttribute(PRESS_ATTRIBUTE) === "release") clear_element(el);
        if (current === el) current = null;
      }, PRESS_RELEASE_MS);
    }, wait);
  };

  const cancel = () => {
    clear_timers();
    pending_touch = null;
    tracked_pointer = null;
    is_down = false;
    if (current) clear_element(current);
    current = null;
  };

  const handle_pointer_down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = find_press_target(e.target);

    if (!target) return;
    tracked_pointer = e.pointerId;
    tracked_type = e.pointerType;
    origin_x = e.clientX;
    origin_y = e.clientY;
    const point = { x: e.clientX, y: e.clientY };

    if (e.pointerType === "touch") {
      if (touch_timer) clearTimeout(touch_timer);
      pending_touch = target;
      touch_timer = setTimeout(() => {
        touch_timer = null;
        if (pending_touch === target) press(target, point);
      }, PRESS_TOUCH_DELAY_MS);

      return;
    }
    press(target, point);
  };

  const handle_pointer_move = (e: PointerEvent) => {
    if (tracked_pointer === null || e.pointerId !== tracked_pointer) return;
    if (!is_down && !pending_touch) return;
    if (tracked_type === "touch") {
      const dx = e.clientX - origin_x;
      const dy = e.clientY - origin_y;

      if (dx * dx + dy * dy > PRESS_SLOP_PX * PRESS_SLOP_PX) cancel();

      return;
    }
    if (!current) return;
    const rect = current.getBoundingClientRect();

    if (!is_point_inside(rect, e.clientX, e.clientY)) cancel();
  };

  const handle_scroll = () => {
    if (is_down || pending_touch) cancel();
  };

  const handle_pointer_up = () => {
    tracked_pointer = null;
    if (pending_touch) {
      const el = pending_touch;

      press(el, { x: origin_x, y: origin_y });
    }
    release();
  };

  const handle_key_down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = find_press_target(document.activeElement);

    if (!target || target !== document.activeElement) return;
    press(target, null);
  };

  const handle_key_up = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    release();
  };

  const handle_mouse_down = (e: MouseEvent) => {
    if (e.detail < 2) return;
    if (e.target instanceof Element && e.target.closest(SELECTABLE_SELECTOR)) {
      return;
    }
    const target = find_press_target(e.target);

    if (!target || !target.matches(INTERACTIVE_SELECTOR)) return;
    e.preventDefault();
  };

  const handle_select_start = (e: Event) => {
    if (!is_down || !current) return;
    if (!current.matches(INTERACTIVE_SELECTOR)) return;
    if (!(e.target instanceof Node)) return;
    const origin =
      e.target instanceof Element ? e.target : e.target.parentElement;

    if (
      origin &&
      origin.closest(`${EDITABLE_SELECTOR}, ${SELECTABLE_SELECTOR}`)
    ) {
      return;
    }
    if (current.contains(e.target)) e.preventDefault();
  };

  const options = { capture: true, passive: true } as const;

  document.addEventListener("pointerdown", handle_pointer_down, options);
  document.addEventListener("pointerup", handle_pointer_up, options);
  document.addEventListener("pointermove", handle_pointer_move, options);
  document.addEventListener("scroll", handle_scroll, options);
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
    document.removeEventListener("pointermove", handle_pointer_move, options);
    document.removeEventListener("scroll", handle_scroll, options);
    document.removeEventListener("pointercancel", cancel, options);
    document.removeEventListener("dragstart", cancel, options);
    document.removeEventListener("keydown", handle_key_down, options);
    document.removeEventListener("keyup", handle_key_up, options);
    document.removeEventListener("mousedown", handle_mouse_down, true);
    document.removeEventListener("selectstart", handle_select_start, true);
    window.removeEventListener("blur", cancel);
    if (overlay) overlay.remove();
    overlay = null;
  };
}
