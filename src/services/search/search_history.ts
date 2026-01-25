import { secure_wipe_storage_key } from "./secure_wipe";

import {
  secure_store,
  secure_retrieve,
  secure_remove,
} from "@/services/crypto/secure_storage";

const STORAGE_KEY = "astermail_search_history";
const MAX_HISTORY_ENTRIES = 20;
const MAX_QUERY_LENGTH = 500;

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  result_count: number;
}

function generate_entry_id(): string {
  return `sh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function validate_user_id(user_id: string): boolean {
  return (
    typeof user_id === "string" && user_id.length > 0 && user_id.length < 100
  );
}

export async function get_search_history(
  user_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!validate_user_id(user_id)) {
    return [];
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  try {
    const entries = await secure_retrieve<SearchHistoryEntry[]>(storage_key);

    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.query === "string" &&
        typeof e.timestamp === "number",
    );
  } catch {
    return [];
  }
}

export async function add_to_history(
  user_id: string,
  query: string,
  result_count: number,
): Promise<SearchHistoryEntry[]> {
  if (!validate_user_id(user_id)) {
    return [];
  }

  const trimmed_query = query.trim();

  if (!trimmed_query || trimmed_query.length > MAX_QUERY_LENGTH) {
    return get_search_history(user_id);
  }

  const safe_result_count = Math.max(0, Math.floor(result_count) || 0);
  const normalized_query = trimmed_query.toLowerCase();
  const entries = await get_search_history(user_id);

  const existing_index = entries.findIndex(
    (entry) => entry.query.trim().toLowerCase() === normalized_query,
  );

  if (existing_index !== -1) {
    entries.splice(existing_index, 1);
  }

  const new_entry: SearchHistoryEntry = {
    id: generate_entry_id(),
    query: trimmed_query,
    timestamp: Date.now(),
    result_count: safe_result_count,
  };

  entries.unshift(new_entry);

  while (entries.length > MAX_HISTORY_ENTRIES) {
    entries.pop();
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, entries);

  return entries;
}

export async function remove_from_history(
  user_id: string,
  entry_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!validate_user_id(user_id) || !entry_id) {
    return get_search_history(user_id);
  }

  const entries = await get_search_history(user_id);
  const filtered = entries.filter((entry) => entry.id !== entry_id);

  if (filtered.length === entries.length) {
    return entries;
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, filtered);

  return filtered;
}

export async function clear_search_history(user_id: string): Promise<void> {
  if (!validate_user_id(user_id)) {
    return;
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_wipe_storage_key(storage_key);
  secure_remove(storage_key);
}

export function format_history_timestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return "";
  }

  const now = Date.now();
  const diff_ms = now - timestamp;

  if (diff_ms < 0) {
    return "";
  }

  const diff_minutes = Math.floor(diff_ms / 60000);
  const diff_hours = Math.floor(diff_minutes / 60);
  const diff_days = Math.floor(diff_hours / 24);

  if (diff_minutes < 1) {
    return "Just now";
  }

  if (diff_minutes < 60) {
    return `${diff_minutes}m ago`;
  }

  if (diff_hours < 24) {
    return `${diff_hours}h ago`;
  }

  if (diff_days < 7) {
    return `${diff_days}d ago`;
  }

  const date = new Date(timestamp);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
