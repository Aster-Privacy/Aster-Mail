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
export const DRAG_ACTIVE_CLASS = "aster_drag_active";

const INTERACTIVE_SELECTOR =
  "button, a[href], input, textarea, select, [contenteditable], [role='button'], [role='combobox'], [role='menuitem']";

let active_count = 0;

function block_event(event: Event): void {
  event.preventDefault();
}

function is_editable_node(node: Node | null): boolean {
  const element =
    node && node.nodeType === 1
      ? (node as Element)
      : (node?.parentElement ?? null);

  if (!element) return false;

  if (element.closest("input, textarea, select")) return true;

  const editable = element.closest("[contenteditable]");

  return (
    !!editable &&
    (editable as HTMLElement).isContentEditable !== false &&
    editable.getAttribute("contenteditable") !== "false"
  );
}

function clear_stray_selection(): void {
  if (typeof window === "undefined") return;

  const selection = window.getSelection?.();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  if (
    is_editable_node(selection.anchorNode) ||
    is_editable_node(selection.focusNode)
  ) {
    return;
  }

  selection.removeAllRanges();
}

function activate(): void {
  active_count += 1;
  if (active_count > 1) return;

  document.documentElement.classList.add(DRAG_ACTIVE_CLASS);
  document.addEventListener("selectstart", block_event, true);
  document.addEventListener("dragstart", block_event, true);
}

function deactivate(): void {
  if (active_count === 0) return;
  active_count -= 1;
  if (active_count > 0) return;

  document.documentElement.classList.remove(DRAG_ACTIVE_CLASS);
  document.removeEventListener("selectstart", block_event, true);
  document.removeEventListener("dragstart", block_event, true);
}

export function is_drag_handle_target(target: EventTarget | null): boolean {
  if (!target || (target as Node).nodeType !== 1) return true;

  return !(target as Element).closest(INTERACTIVE_SELECTOR);
}

export function begin_drag_selection_guard(): () => void {
  if (typeof document === "undefined") return () => {};

  clear_stray_selection();
  activate();

  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    window.removeEventListener("blur", release);
    deactivate();
  };

  window.addEventListener("blur", release);

  return release;
}

export function prevent_drag_text_selection(
  event: React.MouseEvent | React.PointerEvent,
): void {
  if (event.button !== 0) return;
  if (!is_drag_handle_target(event.target)) return;
  event.preventDefault();
}

export function capture_drag_pointer(
  event: React.PointerEvent | React.MouseEvent,
): void {
  if (!("pointerId" in event)) return;

  const element = event.currentTarget as HTMLElement | null;

  try {
    element?.setPointerCapture?.(event.pointerId);
  } catch {
    return;
  }
}

export function hold_drag_selection_guard_until_release(): () => void {
  const release_guard = begin_drag_selection_guard();

  const release = () => {
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("mouseup", release);
    release_guard();
  };

  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("mouseup", release);

  return release;
}
