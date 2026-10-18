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
import { compute_hash } from "./key_manager_core";

type KeyType =
  | "identity"
  | "signed_prekey"
  | "one_time_prekey"
  | "ke"
  | "aes"
  | "hmac";

interface CachedKeyEntry {
  key: CryptoKey;
  key_type: KeyType;
  algorithm: string;
  created_at: number;
  last_accessed: number;
  expires_at: number | null;
}

interface CacheConfig {
  session_timeout_ms: number;
  max_entries: number;
  cleanup_interval_ms: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  session_timeout_ms: 2 * 60 * 60 * 1000,
  max_entries: 100,
  cleanup_interval_ms: 60 * 1000,
};

let cache_config: CacheConfig = { ...DEFAULT_CONFIG };
let key_cache: Map<string, CachedKeyEntry> = new Map();
let cleanup_timer: ReturnType<typeof setInterval> | null = null;
let session_start_time: number | null = null;
let cache_generation = 0;
const pending_keys: Map<string, Promise<CryptoKey>> = new Map();
const secret_cache_ids: Map<string, Map<string, Promise<string>>> = new Map();

if (import.meta.hot) {
  const hmr_data = import.meta.hot.data as
    | {
        session_start_time?: number | null;
      }
    | undefined;

  if (hmr_data?.session_start_time) {
    session_start_time = hmr_data.session_start_time;
  }

  import.meta.hot.dispose((data: { session_start_time: number | null }) => {
    data.session_start_time = session_start_time;
  });
}

function is_session_expired(): boolean {
  return session_start_time === null;
}

function is_entry_expired(entry: CachedKeyEntry): boolean {
  if (entry.expires_at !== null && Date.now() > entry.expires_at) {
    return true;
  }
  if (is_session_expired()) {
    return true;
  }

  return false;
}

function cleanup_expired_entries(): void {
  const entries_to_remove: string[] = [];

  for (const [id, entry] of key_cache) {
    if (is_entry_expired(entry)) {
      entries_to_remove.push(id);
    }
  }

  for (const id of entries_to_remove) {
    key_cache.delete(id);
  }

  if (is_session_expired()) {
    clear_all_keys();
  }
}

function start_cleanup_timer(): void {
  if (cleanup_timer !== null) {
    return;
  }

  cleanup_timer = setInterval(() => {
    cleanup_expired_entries();
  }, cache_config.cleanup_interval_ms);
}

function stop_cleanup_timer(): void {
  if (cleanup_timer !== null) {
    clearInterval(cleanup_timer);
    cleanup_timer = null;
  }
}

export function start_session(): void {
  session_start_time = Date.now();
  start_cleanup_timer();
}

export function refresh_session(): void {
  if (session_start_time !== null) {
    session_start_time = Date.now();
  }
}

export function store_key(
  id: string,
  key: CryptoKey,
  key_type: KeyType,
  ttl_ms?: number,
): void {
  if (session_start_time === null) {
    start_session();
  }

  if (key_cache.size >= cache_config.max_entries) {
    cleanup_expired_entries();

    if (key_cache.size >= cache_config.max_entries) {
      let oldest_id: string | null = null;
      let oldest_time = Infinity;

      for (const [entry_id, entry] of key_cache) {
        if (entry.last_accessed < oldest_time) {
          oldest_time = entry.last_accessed;
          oldest_id = entry_id;
        }
      }

      if (oldest_id !== null) {
        key_cache.delete(oldest_id);
      }
    }
  }

  const now = Date.now();
  const entry: CachedKeyEntry = {
    key,
    key_type,
    algorithm: key.algorithm.name,
    created_at: now,
    last_accessed: now,
    expires_at: ttl_ms ? now + ttl_ms : null,
  };

  key_cache.set(id, entry);
}

export function get_key(id: string): CryptoKey | null {
  const entry = key_cache.get(id);

  if (!entry) {
    return null;
  }

  if (is_entry_expired(entry)) {
    key_cache.delete(id);

    return null;
  }

  entry.last_accessed = Date.now();

  return entry.key;
}

export function get_secret_cache_id(
  label: string,
  secret: string,
): Promise<string> {
  const known = secret_cache_ids.get(label)?.get(secret);

  if (known) return known;

  const id = compute_hash(
    new TextEncoder().encode(`${label}\x00${secret}`),
  ).then((hash) => `${label}:${hash}`);

  if (session_start_time === null) return id;

  const ids = secret_cache_ids.get(label) ?? new Map<string, Promise<string>>();

  if (ids.size >= cache_config.max_entries) ids.clear();
  ids.set(secret, id);
  secret_cache_ids.set(label, ids);

  return id;
}

export async function get_or_create_key(
  id_source: string | Promise<string>,
  key_type: KeyType,
  create: () => Promise<CryptoKey>,
): Promise<CryptoKey> {
  const started_generation = cache_generation;
  const id = await id_source;

  if (started_generation !== cache_generation) return create();

  const cached = get_key(id);

  if (cached) return cached;

  const pending = pending_keys.get(id);

  if (pending) return pending;

  const request = create()
    .then((key) => {
      if (
        started_generation === cache_generation &&
        session_start_time !== null
      ) {
        store_key(id, key, key_type);
      }

      return key;
    })
    .finally(() => {
      if (pending_keys.get(id) === request) pending_keys.delete(id);
    });

  pending_keys.set(id, request);

  return request;
}

export function has_key(id: string): boolean {
  const entry = key_cache.get(id);

  if (!entry) {
    return false;
  }

  if (is_entry_expired(entry)) {
    key_cache.delete(id);

    return false;
  }

  return true;
}

export function remove_key(id: string): boolean {
  return key_cache.delete(id);
}

export function clear_all_keys(): void {
  key_cache.clear();
  pending_keys.clear();
  secret_cache_ids.clear();
  cache_generation += 1;
  session_start_time = null;
  stop_cleanup_timer();
}

export function on_session_expire(callback: () => void): () => void {
  const check_interval = setInterval(() => {
    if (is_session_expired() && session_start_time !== null) {
      callback();
      session_start_time = null;
    }
  }, 1000);

  return () => {
    clearInterval(check_interval);
  };
}

export type { KeyType, CachedKeyEntry, CacheConfig };
