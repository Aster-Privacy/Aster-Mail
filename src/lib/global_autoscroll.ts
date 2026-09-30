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
import {
  find_scrollable_target,
  is_autoscrolling,
  start_autoscroll_session,
} from "@/lib/autoscroll";

const INTERACTIVE_SELECTOR =
  "a[href], input, textarea, select, [contenteditable=''], [contenteditable='true']";

const should_ignore = (node: Element | null): boolean => {
  if (!node) return true;

  return !!node.closest(INTERACTIVE_SELECTOR);
};

export const install_global_autoscroll = (): (() => void) => {
  const on_mouse_down = (event: MouseEvent) => {
    if (event.button !== 1) return;
    if (is_autoscrolling()) return;

    const node = event.target instanceof Element ? event.target : null;

    if (should_ignore(node)) return;

    const target = find_scrollable_target(node);

    if (!target) return;
    if (!target.can_scroll_y && !target.can_scroll_x) return;

    event.preventDefault();
    start_autoscroll_session(target, event.clientX, event.clientY);
  };

  document.addEventListener("mousedown", on_mouse_down, true);

  return () => document.removeEventListener("mousedown", on_mouse_down, true);
};
