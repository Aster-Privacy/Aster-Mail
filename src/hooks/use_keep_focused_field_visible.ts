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
import { useEffect, type RefObject } from "react";

const FOCUS_SCROLL_DELAY_MS = 250;
const RESIZE_SCROLL_DELAY_MS = 60;

export function is_editable_field(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      !["checkbox", "radio", "button", "submit", "file", "range"].includes(
        target.type,
      ))
  );
}

export function scroll_field_into_view(field: HTMLElement): void {
  if (typeof field.scrollIntoView !== "function") return;
  field.scrollIntoView({ block: "center", inline: "nearest" });
}

export function use_keep_focused_field_visible(
  container_ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      const active = document.activeElement;

      if (!(active instanceof HTMLElement)) return;
      if (!container.contains(active) || !is_editable_field(active)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (document.activeElement === active) scroll_field_into_view(active);
      }, delay);
    };

    const handle_focus_in = (event: FocusEvent) => {
      if (!is_editable_field(event.target)) return;
      schedule(FOCUS_SCROLL_DELAY_MS);
    };
    const handle_resize = () => schedule(RESIZE_SCROLL_DELAY_MS);
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;

    container.addEventListener("focusin", handle_focus_in);
    viewport?.addEventListener("resize", handle_resize);

    return () => {
      if (timer) clearTimeout(timer);
      container.removeEventListener("focusin", handle_focus_in);
      viewport?.removeEventListener("resize", handle_resize);
    };
  }, [container_ref]);
}
