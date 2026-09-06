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

function scroll_to_element(el: HTMLElement) {
  const container = find_scroll_container(el);

  if (!container) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });

    return;
  }

  const target =
    container.scrollTop +
    (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
    24;
  const max_top = container.scrollHeight - container.clientHeight;
  const clamped = Math.max(0, Math.min(target, max_top));

  container.scrollTo({ top: clamped, behavior: "smooth" });
}

export function scroll_to_settings_anchor(id: string, wait_for_mount = false) {
  const deadline = Date.now() + ANCHOR_WAIT_MS;

  const run = () => {
    const el = document.getElementById(id);

    if (el) {
      scroll_to_element(el);

      return;
    }

    if (!wait_for_mount || Date.now() > deadline) return;

    requestAnimationFrame(run);
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}
