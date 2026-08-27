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
import { useSyncExternalStore } from "react";

export const EMAIL_DRAG_MIME = "application/x-astermail-emails";

export type DropViewTarget = "starred" | "archive" | "spam" | "trash";

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
