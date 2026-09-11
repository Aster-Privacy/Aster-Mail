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
const PENDING_ANCHOR_KEY = "aster_settings_anchor";
const ANCHOR_WAIT_MS = 3000;
const ANCHOR_SETTLE_MS = 2500;
const ANCHOR_OFFSET_PX = 24;
const DRIFT_TOLERANCE_PX = 4;
const USER_SCROLL_EVENTS = [
  "wheel",
  "touchstart",
  "pointerdown",
  "keydown",
] as const;

let active_seek = 0;

export function set_pending_settings_anchor(anchor: string) {
  try {
    sessionStorage.setItem(PENDING_ANCHOR_KEY, anchor);
  } catch {
    return;
  }
}

export function consume_pending_settings_anchor(): string | null {
  try {
    const anchor = sessionStorage.getItem(PENDING_ANCHOR_KEY);

    if (anchor) sessionStorage.removeItem(PENDING_ANCHOR_KEY);

    return anchor;
  } catch {
    return null;
  }
}

function find_scroll_container(el: HTMLElement): HTMLElement | null {
  let container: HTMLElement | null = el.parentElement;

  while (container && container !== document.body) {
    const { overflowY } = window.getComputedStyle(container);

    if (overflowY === "auto" || overflowY === "scroll") {
      return container;
    }

    container = container.parentElement;
  }

  return null;
}

function container_target_top(el: HTMLElement, container: HTMLElement) {
  const target =
    container.scrollTop +
    (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
    ANCHOR_OFFSET_PX;
  const max_top = container.scrollHeight - container.clientHeight;

  return Math.max(0, Math.min(target, max_top));
}

function window_target_top(el: HTMLElement) {
  return Math.max(
    0,
    window.scrollY + el.getBoundingClientRect().top - ANCHOR_OFFSET_PX,
  );
}

function scroll_to_element(el: HTMLElement): number {
  const container = find_scroll_container(el);

  if (!container) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });

    return window_target_top(el);
  }

  const top = container_target_top(el, container);

  container.scrollTo({ top, behavior: "smooth" });

  return top;
}

function hold_position(el: HTMLElement, seek: number, first_top: number) {
  const deadline = Date.now() + ANCHOR_SETTLE_MS;
  let last_top = first_top;
  let stopped = false;

  const stop = () => {
    stopped = true;
    for (const name of USER_SCROLL_EVENTS) {
      window.removeEventListener(name, stop, true);
    }
  };

  for (const name of USER_SCROLL_EVENTS) {
    window.addEventListener(name, stop, { capture: true, passive: true });
  }

  const check = () => {
    if (stopped) return;
    if (seek !== active_seek || !el.isConnected || Date.now() > deadline) {
      stop();

      return;
    }

    const container = find_scroll_container(el);
    const top = container
      ? container_target_top(el, container)
      : window_target_top(el);

    if (Math.abs(top - last_top) > DRIFT_TOLERANCE_PX) {
      last_top = scroll_to_element(el);
    }

    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
}

export function scroll_to_settings_anchor(id: string, wait_for_mount = false) {
  const deadline = Date.now() + ANCHOR_WAIT_MS;
  const seek = ++active_seek;

  const run = () => {
    if (seek !== active_seek) return;

    const el = document.getElementById(id);

    if (el) {
      hold_position(el, seek, scroll_to_element(el));

      return;
    }

    if (!wait_for_mount || Date.now() > deadline) return;

    requestAnimationFrame(run);
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}
