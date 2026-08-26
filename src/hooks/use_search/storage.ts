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

import { clear_search_index } from "./index_cache";
import { SavedSearch, SearchHistoryEntry } from "./types";

import {
  secure_store,
  secure_retrieve,
  secure_remove,
} from "@/services/crypto/secure_storage";
export const SEARCH_HISTORY_LIMIT = 20;
export const SAVED_SEARCH_LIMIT = 50;

export function history_storage_key(user_id: string): string {
  return `aster_search_history_${user_id}`;
}

export function saved_search_storage_key(user_id: string): string {
  return `aster_saved_searches_${user_id}`;
}

export async function read_secure_array<T>(key: string): Promise<T[]> {
  try {
    const parsed = await secure_retrieve<T[]>(key);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function write_secure_array<T>(
  key: string,
  value: T[],
): Promise<void> {
  try {
    await secure_store(key, value);
  } catch {
    return;
  }
}

export function sort_saved_searches(searches: SavedSearch[]): SavedSearch[] {
  return [...searches].sort(
    (a, b) =>
      (b.last_used_at ?? b.created_at) - (a.last_used_at ?? a.created_at),
  );
}

export async function get_search_history(
  user_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!user_id) return [];

  return (
    await read_secure_array<SearchHistoryEntry>(history_storage_key(user_id))
  ).sort((a, b) => b.timestamp - a.timestamp);
}

export async function add_to_history(
  user_id: string,
  query: string,
  result_count: number,
): Promise<SearchHistoryEntry[]> {
  const trimmed = query.trim();

  if (!user_id || !trimmed) return get_search_history(user_id);

  const key = history_storage_key(user_id);
  const existing = (await read_secure_array<SearchHistoryEntry>(key)).filter(
    (e) => e.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const entry: SearchHistoryEntry = {
    id: crypto.randomUUID(),
    query: trimmed,
    timestamp: Date.now(),
    result_count,
  };
  const updated = [entry, ...existing].slice(0, SEARCH_HISTORY_LIMIT);

  await write_secure_array(key, updated);

  return updated;
}

export async function remove_from_history(
  user_id: string,
  entry_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!user_id) return [];

  const key = history_storage_key(user_id);
  const updated = (await read_secure_array<SearchHistoryEntry>(key))
    .filter((e) => e.id !== entry_id)
    .sort((a, b) => b.timestamp - a.timestamp);

  await write_secure_array(key, updated);

  return updated;
}

export async function get_saved_searches(
  user_id: string,
): Promise<SavedSearch[]> {
  if (!user_id) return [];

  return sort_saved_searches(
    await read_secure_array<SavedSearch>(saved_search_storage_key(user_id)),
  );
}

export async function save_search_to_storage(
  user_id: string,
  name: string,
  query: string,
): Promise<{ success: boolean; search?: SavedSearch }> {
  const trimmed_name = name.trim();
  const trimmed_query = query.trim();

  if (!user_id || !trimmed_name || !trimmed_query) return { success: false };

  const key = saved_search_storage_key(user_id);
  const existing = await read_secure_array<SavedSearch>(key);
  const search: SavedSearch = {
    id: crypto.randomUUID(),
    name: trimmed_name,
    query: trimmed_query,
    created_at: Date.now(),
  };

  await write_secure_array(
    key,
    [search, ...existing].slice(0, SAVED_SEARCH_LIMIT),
  );

  return { success: true, search };
}

export async function delete_saved_search_from_storage(
  user_id: string,
  search_id: string,
): Promise<SavedSearch[]> {
  if (!user_id) return [];

  const key = saved_search_storage_key(user_id);
  const updated = (await read_secure_array<SavedSearch>(key)).filter(
    (s) => s.id !== search_id,
  );

  await write_secure_array(key, updated);

  return sort_saved_searches(updated);
}

export async function update_saved_search_usage(
  user_id: string,
  search_id: string,
): Promise<void> {
  if (!user_id) return;

  const key = saved_search_storage_key(user_id);
  const updated = (await read_secure_array<SavedSearch>(key)).map((s) =>
    s.id === search_id ? { ...s, last_used_at: Date.now() } : s,
  );

  await write_secure_array(key, updated);
}

export async function clear_search_data(
  user_id: string,
  options: {
    clear_history: boolean;
    clear_saved_searches: boolean;
    clear_cache: boolean;
  },
): Promise<void> {
  if (!user_id) return;

  if (options.clear_history) {
    secure_remove(history_storage_key(user_id));
  }
  if (options.clear_saved_searches) {
    secure_remove(saved_search_storage_key(user_id));
  }
  if (options.clear_cache) {
    clear_search_index();
  }
}
