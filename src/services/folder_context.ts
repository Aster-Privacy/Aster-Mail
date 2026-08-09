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
  get_unlock_token,
  get_unlocked_folder_tokens,
  list_folder_unlock_records,
} from "@/services/folder_unlock_store";

const MAX_TRACKED_ITEMS = 5000;

const item_folder_tokens = new Map<string, string>();
const thread_folder_tokens = new Map<string, string>();

let active_folder_token: string | null = null;

function remember(map: Map<string, string>, key: string, value: string): void {
  if (map.get(key) === value) return;

  map.set(key, value);

  while (map.size > MAX_TRACKED_ITEMS) {
    const oldest = map.keys().next();

    if (oldest.done) break;

    map.delete(oldest.value);
  }
}

export function set_active_folder_token(token: string | null): void {
  active_folder_token = token && token.length > 0 ? token : null;
}

export function get_active_folder_token(): string | null {
  return active_folder_token;
}

export function clear_folder_context(): void {
  item_folder_tokens.clear();
  thread_folder_tokens.clear();
  active_folder_token = null;
}

export function remember_item_folder_context(item: {
  id?: string;
  thread_token?: string;
  folder_token?: string;
  labels?: { token: string }[];
  folders?: { token: string }[];
}): void {
  const unlocked = get_unlocked_folder_tokens();

  if (unlocked.size === 0) return;

  const candidates: string[] = [];

  if (item.folder_token) candidates.push(item.folder_token);
  for (const label of item.labels ?? []) candidates.push(label.token);
  for (const folder of item.folders ?? []) candidates.push(folder.token);

  const owning = candidates.find((token) => unlocked.has(token));

  if (!owning) return;

  if (item.id) remember(item_folder_tokens, item.id, owning);
  if (item.thread_token) {
    remember(thread_folder_tokens, item.thread_token, owning);
  }
}

export function remember_items_folder_context(
  items: {
    id?: string;
    thread_token?: string;
    folder_token?: string;
    labels?: { token: string }[];
    folders?: { token: string }[];
  }[],
  fallback_label_token?: string,
): void {
  const unlocked = get_unlocked_folder_tokens();

  if (unlocked.size === 0) return;

  const scoped =
    fallback_label_token && unlocked.has(fallback_label_token)
      ? fallback_label_token
      : null;

  for (const item of items) {
    remember_item_folder_context(item);

    if (!scoped) continue;

    if (item.id) remember(item_folder_tokens, item.id, scoped);
    if (item.thread_token) {
      remember(thread_folder_tokens, item.thread_token, scoped);
    }
  }
}

export function remember_thread_message_ids(
  thread_token: string | null | undefined,
  item_ids: readonly string[],
): void {
  if (!thread_token) return;

  const folder = thread_folder_tokens.get(thread_token);

  if (!folder) return;

  for (const id of item_ids) remember(item_folder_tokens, id, folder);
}

export function get_sole_unlock_token(): string | null {
  const records = list_folder_unlock_records();

  if (records.length !== 1) return null;

  return records[0].unlock_token;
}

function token_for_folder(folder_token: string | null): string | null {
  if (!folder_token) return null;

  return get_unlock_token(folder_token);
}

export function resolve_item_unlock_token(
  item_id: string | null | undefined,
): string | null {
  if (item_id) {
    const known = token_for_folder(item_folder_tokens.get(item_id) ?? null);

    if (known) return known;
  }

  return token_for_folder(active_folder_token);
}

export function resolve_items_unlock_token(
  item_ids: readonly string[],
): string | null {
  const folders = new Set<string>();

  for (const id of item_ids) {
    const folder = item_folder_tokens.get(id);

    if (folder) folders.add(folder);
  }

  if (folders.size === 1) {
    const only = [...folders][0];
    const token = token_for_folder(only);

    if (token) return token;
  }

  if (folders.size > 1) return null;

  return token_for_folder(active_folder_token);
}

export function resolve_thread_unlock_token(
  thread_token: string | null | undefined,
): string | null {
  if (thread_token) {
    const known = token_for_folder(
      thread_folder_tokens.get(thread_token) ?? null,
    );

    if (known) return known;
  }

  return token_for_folder(active_folder_token);
}
