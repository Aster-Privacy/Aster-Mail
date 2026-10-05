//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useCallback, useLayoutEffect, useRef } from "react";

export const VISIBLE_TAIL_COUNT = 2;

export function find_scroll_parent(el: HTMLElement): HTMLElement | null {
  let container = el.parentElement;

  while (container) {
    const overflow = getComputedStyle(container).overflowY;

    if (overflow === "auto" || overflow === "scroll") return container;
    container = container.parentElement;
  }

  return null;
}

function offset_in_scroller(el: HTMLElement, scroller: HTMLElement): number {
  return (
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
}

export function opened_message_is_collapsed(
  display_ids: string[],
  opened_id: string,
): boolean {
  if (display_ids.length <= VISIBLE_TAIL_COUNT + 2) return false;

  const index = display_ids.indexOf(opened_id);

  return index > 0 && index < display_ids.length - VISIBLE_TAIL_COUNT;
}

export function use_opened_message_anchor(
  opened_id: string | undefined,
  message_ids_key: string,
): (id: string, el: HTMLDivElement | null) => void {
  const rows = useRef<Map<string, HTMLDivElement>>(new Map());
  const alone = useRef<{ id: string; offset: number } | null>(null);

  useLayoutEffect(() => {
    const earlier = alone.current;
    const shows_only_opened = !!opened_id && message_ids_key === opened_id;

    alone.current = null;

    if (!opened_id || (!shows_only_opened && !earlier)) return;

    const el = rows.current.get(opened_id);
    const scroller = el ? find_scroll_parent(el) : null;

    if (!el || !scroller) return;

    const offset = offset_in_scroller(el, scroller);

    if (shows_only_opened) {
      alone.current = { id: opened_id, offset };

      return;
    }

    if (earlier && earlier.id === opened_id && offset !== earlier.offset) {
      scroller.scrollTop += offset - earlier.offset;
    }
  });

  return useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      rows.current.set(id, el);
    } else {
      rows.current.delete(id);
    }
  }, []);
}
