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

export const EMAIL_FOLDERS_DRAG_MIME = "application/x-astermail-folders";
export const EMAIL_TAGS_DRAG_MIME = "application/x-astermail-tags";

export interface EmailDragPayload {
  ids: string[];
  folder_tokens: string[];
  tag_tokens: string[];
  is_scope: boolean;
}

let active_payload: EmailDragPayload | null = null;

function end_after_drop_dispatch(): void {
  setTimeout(end_category_drag, 0);
}

function detach_window_reset(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("dragend", end_category_drag, true);
  window.removeEventListener("drop", end_after_drop_dispatch, true);
}

export function begin_category_drag(): void {
  if (is_dragging) return;
  is_dragging = true;
  if (typeof window !== "undefined") {
    window.addEventListener("dragend", end_category_drag, true);
    window.addEventListener("drop", end_after_drop_dispatch, true);
  }
  notify();
}

export function end_category_drag(): void {
  active_payload = null;
  if (!is_dragging) return;
  is_dragging = false;
  detach_window_reset();
  notify();
}

export function write_email_drag(
  data_transfer: DataTransfer,
  payload: EmailDragPayload,
): void {
  active_payload = payload;
  data_transfer.setData(EMAIL_DRAG_MIME, JSON.stringify(payload.ids));
  if (payload.is_scope) data_transfer.setData(EMAIL_SCOPE_DRAG_MIME, "1");
  data_transfer.setData(
    EMAIL_FOLDERS_DRAG_MIME,
    JSON.stringify(payload.folder_tokens),
  );
  data_transfer.setData(
    EMAIL_TAGS_DRAG_MIME,
    JSON.stringify(payload.tag_tokens),
  );
  data_transfer.effectAllowed = "move";
}

function parse_string_list(raw: string): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function read_transfer(data_transfer: DataTransfer, mime: string): string {
  try {
    return data_transfer.getData(mime);
  } catch {
    return "";
  }
}

export function is_email_drag(data_transfer: DataTransfer | null): boolean {
  if (active_payload) return true;

  return !!data_transfer && data_transfer.types.includes(EMAIL_DRAG_MIME);
}

export function read_email_drag(
  data_transfer: DataTransfer | null,
): EmailDragPayload | null {
  const ids = data_transfer
    ? parse_string_list(read_transfer(data_transfer, EMAIL_DRAG_MIME))
    : null;

  if (!ids || !data_transfer) return active_payload;

  return {
    ids,
    folder_tokens:
      parse_string_list(
        read_transfer(data_transfer, EMAIL_FOLDERS_DRAG_MIME),
      ) ?? [],
    tag_tokens:
      parse_string_list(read_transfer(data_transfer, EMAIL_TAGS_DRAG_MIME)) ??
      [],
    is_scope:
      data_transfer.types.includes(EMAIL_SCOPE_DRAG_MIME) ||
      active_payload?.is_scope === true,
  };
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
  const is_scope =
    data_transfer.types.includes(EMAIL_SCOPE_DRAG_MIME) ||
    active_payload?.is_scope === true;

  if (!is_scope) return false;
  if (!scope_drag_handler || !scope_drag_handler.is_active()) return false;

  scope_drag_handler.run(target);

  return true;
}
