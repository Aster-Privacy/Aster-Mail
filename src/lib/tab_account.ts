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
const TAB_ACCOUNT_KEY = "aster_tab_account";
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface TabAccountBinding {
  id: string;
  index: number;
}

export type TabAccountChoice =
  | { kind: "bound"; id: string; index: number; moved: boolean }
  | { kind: "invalid_index"; requested: number }
  | { kind: "empty" };

let bound_account_id: string | null = null;
let choice_required = false;
let cookie_owner_id: string | null | undefined = undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe_tab_account(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function get_tab_account_id(): string | null {
  return bound_account_id;
}

export function is_account_choice_required(): boolean {
  return choice_required;
}

export function set_account_choice_required(required: boolean): void {
  if (choice_required === required) return;
  choice_required = required;
  notify();
}

function is_valid_binding(value: unknown): value is TabAccountBinding {
  if (!value || typeof value !== "object") return false;

  const candidate = value as { id?: unknown; index?: unknown };

  return (
    typeof candidate.id === "string" &&
    ACCOUNT_ID_PATTERN.test(candidate.id) &&
    typeof candidate.index === "number" &&
    Number.isInteger(candidate.index) &&
    candidate.index >= 0
  );
}

export function read_tab_account_binding(): TabAccountBinding | null {
  try {
    const raw = window.sessionStorage.getItem(TAB_ACCOUNT_KEY);

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    return is_valid_binding(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function bind_tab_account(id: string, index: number): void {
  bound_account_id = id;
  choice_required = false;

  try {
    window.sessionStorage.setItem(
      TAB_ACCOUNT_KEY,
      JSON.stringify({ id, index }),
    );
  } catch {
    bound_account_id = id;
  }

  notify();
}

export function clear_tab_account(): void {
  bound_account_id = null;

  try {
    window.sessionStorage.removeItem(TAB_ACCOUNT_KEY);
  } catch {
    bound_account_id = null;
  }

  notify();
}

export function note_cookie_owner(id: string | null): void {
  cookie_owner_id = id;
}

export function forget_cookie_owner(): void {
  cookie_owner_id = undefined;
}

export function tab_shares_session_cookies(): boolean {
  if (bound_account_id === null) return true;

  return cookie_owner_id === bound_account_id;
}

export function navigation_restores_tab(): boolean {
  try {
    const entries = window.performance.getEntriesByType("navigation");
    const entry = entries[0] as PerformanceNavigationTiming | undefined;

    return entry?.type === "reload" || entry?.type === "back_forward";
  } catch {
    return false;
  }
}

export function choose_tab_account(
  account_ids: readonly string[],
  url_index: number,
  binding: TabAccountBinding | null,
  restores_tab: boolean,
): TabAccountChoice {
  if (account_ids.length === 0) return { kind: "empty" };

  if (restores_tab && binding) {
    const bound_index = account_ids.indexOf(binding.id);

    if (bound_index === -1) {
      return { kind: "invalid_index", requested: url_index };
    }

    return {
      kind: "bound",
      id: binding.id,
      index: bound_index,
      moved: bound_index !== url_index,
    };
  }

  const id = account_ids[url_index];

  if (id === undefined) return { kind: "invalid_index", requested: url_index };

  return { kind: "bound", id, index: url_index, moved: false };
}

export function reset_tab_account_for_tests(): void {
  bound_account_id = null;
  choice_required = false;
  cookie_owner_id = undefined;
  listeners.clear();
}
