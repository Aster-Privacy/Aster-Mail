import { secure_wipe_storage_key } from "./secure_wipe";

import {
  secure_store,
  secure_retrieve,
  secure_remove,
} from "@/services/crypto/secure_storage";

const STORAGE_KEY = "astermail_saved_searches";
const MAX_SAVED_SEARCHES = 50;
const MAX_NAME_LENGTH = 100;
const MAX_QUERY_LENGTH = 500;

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  created_at: number;
  last_used_at?: number;
  use_count: number;
}

function generate_search_id(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function validate_user_id(user_id: string): boolean {
  return (
    typeof user_id === "string" && user_id.length > 0 && user_id.length < 100
  );
}

function validate_saved_search(s: unknown): s is SavedSearch {
  if (!s || typeof s !== "object") return false;

  const search = s as Record<string, unknown>;

  return (
    typeof search.id === "string" &&
    typeof search.name === "string" &&
    typeof search.query === "string" &&
    typeof search.created_at === "number" &&
    typeof search.use_count === "number"
  );
}

export async function get_saved_searches(
  user_id: string,
): Promise<SavedSearch[]> {
  if (!validate_user_id(user_id)) {
    return [];
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  try {
    const searches = await secure_retrieve<SavedSearch[]>(storage_key);

    if (!Array.isArray(searches)) {
      return [];
    }

    return searches.filter(validate_saved_search);
  } catch {
    return [];
  }
}

export async function save_search(
  user_id: string,
  name: string,
  query: string,
): Promise<{ success: boolean; search?: SavedSearch; error?: string }> {
  if (!validate_user_id(user_id)) {
    return { success: false, error: "Invalid user" };
  }

  const trimmed_name = name.trim();
  const trimmed_query = query.trim();

  if (!trimmed_name) {
    return { success: false, error: "Name is required" };
  }

  if (trimmed_name.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or less`,
    };
  }

  if (!trimmed_query) {
    return { success: false, error: "Query is required" };
  }

  if (trimmed_query.length > MAX_QUERY_LENGTH) {
    return {
      success: false,
      error: `Query must be ${MAX_QUERY_LENGTH} characters or less`,
    };
  }

  const searches = await get_saved_searches(user_id);

  if (searches.length >= MAX_SAVED_SEARCHES) {
    return {
      success: false,
      error: `Maximum of ${MAX_SAVED_SEARCHES} saved searches reached`,
    };
  }

  const normalized_name = trimmed_name.toLowerCase();
  const existing = searches.find(
    (s) => s.name.toLowerCase() === normalized_name,
  );

  if (existing) {
    return {
      success: false,
      error: "A saved search with this name already exists",
    };
  }

  const new_search: SavedSearch = {
    id: generate_search_id(),
    name: trimmed_name,
    query: trimmed_query,
    created_at: Date.now(),
    use_count: 0,
  };

  searches.unshift(new_search);

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, searches);

  return { success: true, search: new_search };
}

export async function delete_saved_search(
  user_id: string,
  search_id: string,
): Promise<SavedSearch[]> {
  if (!validate_user_id(user_id) || !search_id) {
    return get_saved_searches(user_id);
  }

  const searches = await get_saved_searches(user_id);
  const filtered = searches.filter((s) => s.id !== search_id);

  if (filtered.length === searches.length) {
    return searches;
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, filtered);

  return filtered;
}

export async function rename_saved_search(
  user_id: string,
  search_id: string,
  new_name: string,
): Promise<{ success: boolean; search?: SavedSearch; error?: string }> {
  if (!validate_user_id(user_id)) {
    return { success: false, error: "Invalid user" };
  }

  const trimmed_name = new_name.trim();

  if (!trimmed_name) {
    return { success: false, error: "Name is required" };
  }

  if (trimmed_name.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or less`,
    };
  }

  const searches = await get_saved_searches(user_id);
  const search_index = searches.findIndex((s) => s.id === search_id);

  if (search_index === -1) {
    return { success: false, error: "Saved search not found" };
  }

  const normalized_name = trimmed_name.toLowerCase();
  const existing = searches.find(
    (s) => s.id !== search_id && s.name.toLowerCase() === normalized_name,
  );

  if (existing) {
    return {
      success: false,
      error: "A saved search with this name already exists",
    };
  }

  searches[search_index] = {
    ...searches[search_index],
    name: trimmed_name,
  };

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, searches);

  return { success: true, search: searches[search_index] };
}

export async function update_saved_search_usage(
  user_id: string,
  search_id: string,
): Promise<void> {
  if (!validate_user_id(user_id) || !search_id) {
    return;
  }

  const searches = await get_saved_searches(user_id);
  const search_index = searches.findIndex((s) => s.id === search_id);

  if (search_index === -1) {
    return;
  }

  searches[search_index] = {
    ...searches[search_index],
    last_used_at: Date.now(),
    use_count: searches[search_index].use_count + 1,
  };

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_store(storage_key, searches);
}

export async function clear_saved_searches(user_id: string): Promise<void> {
  if (!validate_user_id(user_id)) {
    return;
  }

  const storage_key = `${STORAGE_KEY}_${user_id}`;

  await secure_wipe_storage_key(storage_key);
  secure_remove(storage_key);
}

export function get_saved_searches_count(searches: SavedSearch[]): number {
  return searches.length;
}

export function get_remaining_slots(searches: SavedSearch[]): number {
  return Math.max(0, MAX_SAVED_SEARCHES - searches.length);
}
