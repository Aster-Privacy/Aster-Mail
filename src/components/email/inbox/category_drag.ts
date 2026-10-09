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
import type { EmailCategory } from "@/types/email";
import type { SelectionSnapshot } from "@/components/email/inbox/selection_snapshot";

import { useSyncExternalStore } from "react";

export const EMAIL_DRAG_MIME = "application/x-astermail-emails";

let is_dragging = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_snapshot(): boolean {
  return is_dragging;
}

function detach_window_reset(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("dragend", end_category_drag, true);
  window.removeEventListener("drop", end_category_drag, true);
}

export function begin_category_drag(): void {
  if (is_dragging) return;
  is_dragging = true;
  if (typeof window !== "undefined") {
    window.addEventListener("dragend", end_category_drag, true);
    window.addEventListener("drop", end_category_drag, true);
  }
  notify();
}

export function end_category_drag(): void {
  if (!is_dragging) return;
  is_dragging = false;
  detach_window_reset();
  notify();
}

export function use_category_drag_active(): boolean {
  return useSyncExternalStore(subscribe, get_snapshot, () => false);
}

export const EMAIL_SCOPE_DRAG_MIME = "application/x-astermail-select-all";

export type ScopeDropTarget =
  | { kind: "folder"; token: string; name: string }
  | { kind: "tag"; token: string; name: string }
  | { kind: "category"; category: EmailCategory };

interface ScopeDragHandler {
  is_active: () => boolean;
  count: () => number;
  selection_snapshot: () => SelectionSnapshot;
  run: (target: ScopeDropTarget) => void;
}

let scope_drag_handler: ScopeDragHandler | null = null;

export function register_scope_drag_handler(
  handler: ScopeDragHandler,
): () => void {
  scope_drag_handler = handler;

  return () => {
    if (scope_drag_handler === handler) scope_drag_handler = null;
  };
}

export function is_scope_drag_active(): boolean {
  return scope_drag_handler?.is_active() ?? false;
}

export function scope_drag_count(): number {
  return scope_drag_handler?.count() ?? 0;
}

export function loaded_selection_snapshot(): SelectionSnapshot | null {
  return scope_drag_handler?.selection_snapshot() ?? null;
}

export function run_scope_drop(
  data_transfer: DataTransfer,
  target: ScopeDropTarget,
): boolean {
  if (!data_transfer.types.includes(EMAIL_SCOPE_DRAG_MIME)) return false;
  if (!scope_drag_handler || !scope_drag_handler.is_active()) return false;

  scope_drag_handler.run(target);

  return true;
}
