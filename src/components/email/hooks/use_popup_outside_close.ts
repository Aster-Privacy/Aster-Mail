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
import { useEffect, useRef, type RefObject } from "react";

export const POPUP_OUTSIDE_IGNORE_ATTRIBUTE = "data-popup-outside-ignore";
export const INLINE_REPLY_COMPOSER_ATTRIBUTE = "data-inline-reply-composer";

const CLICK_MOVE_TOLERANCE_PX = 6;

const IGNORED_TARGET_SELECTOR = [
  `[${POPUP_OUTSIDE_IGNORE_ATTRIBUTE}]`,
  "[data-radix-popper-content-wrapper]",
  "[data-radix-portal]",
  "[role='menu']",
  "[role='listbox']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[aria-modal='true']",
  ".aster_scrim",
].join(",");

const OPEN_LAYER_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[role='menu'][data-state='open']",
  "[role='dialog'][data-state='open']",
  "[role='alertdialog']",
  "[aria-modal='true']",
].join(",");

function is_plain_primary_press(event: PointerEvent): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function has_open_layer_outside(popup: HTMLElement): boolean {
  if (document.body.style.pointerEvents === "none") return true;

  return Array.from(document.querySelectorAll(OPEN_LAYER_SELECTOR)).some(
    (layer) => !popup.contains(layer),
  );
}

export function should_arm_outside_close(
  event: PointerEvent,
  popup: HTMLElement | null,
): boolean {
  if (!popup || !popup.isConnected) return false;
  if (!is_plain_primary_press(event)) return false;

  const target = event.target;

  if (!(target instanceof Element)) return false;
  if (popup.contains(target)) return false;
  if (target.closest(IGNORED_TARGET_SELECTOR)) return false;
  if (has_open_layer_outside(popup)) return false;
  if (popup.querySelector(`[${INLINE_REPLY_COMPOSER_ATTRIBUTE}]`)) return false;

  return true;
}

interface UsePopupOutsideCloseOptions {
  enabled: boolean;
  popup_ref: RefObject<HTMLElement | null>;
  on_close: () => void;
}

export function use_popup_outside_close({
  enabled,
  popup_ref,
  on_close,
}: UsePopupOutsideCloseOptions): void {
  const on_close_ref = useRef(on_close);

  on_close_ref.current = on_close;

  useEffect(() => {
    if (!enabled) return;

    let armed_at: { x: number; y: number } | null = null;

    const handle_pointer_down = (event: PointerEvent) => {
      armed_at = should_arm_outside_close(event, popup_ref.current)
        ? { x: event.clientX, y: event.clientY }
        : null;
    };

    const handle_pointer_up = (event: PointerEvent) => {
      const start = armed_at;

      armed_at = null;
      if (!start) return;

      const popup = popup_ref.current;

      if (!popup || event.button !== 0) return;
      if (event.target instanceof Node && popup.contains(event.target)) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);

      if (moved > CLICK_MOVE_TOLERANCE_PX) return;

      on_close_ref.current();
    };

    const disarm = () => {
      armed_at = null;
    };

    document.addEventListener("pointerdown", handle_pointer_down, true);
    document.addEventListener("pointerup", handle_pointer_up, true);
    document.addEventListener("pointercancel", disarm, true);

    return () => {
      document.removeEventListener("pointerdown", handle_pointer_down, true);
      document.removeEventListener("pointerup", handle_pointer_up, true);
      document.removeEventListener("pointercancel", disarm, true);
    };
  }, [enabled, popup_ref]);
}
