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
  session_timeout_ms: 24 * 60 * 60 * 1000,
  max_entries: 100,
  cleanup_interval_ms: 60 * 1000,
};

let cache_config: CacheConfig = { ...DEFAULT_CONFIG };
let key_cache: Map<string, CachedKeyEntry> = new Map();
let cleanup_timer: ReturnType<typeof setInterval> | null = null;
let session_start_time: number | null = null;

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

export function configure_cache(config: Partial<CacheConfig>): void {
  cache_config = { ...cache_config, ...config };
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

export function get_keys_by_type(key_type: KeyType): Map<string, CryptoKey> {
  const result = new Map<string, CryptoKey>();

  for (const [id, entry] of key_cache) {
    if (entry.key_type === key_type && !is_entry_expired(entry)) {
      entry.last_accessed = Date.now();
      result.set(id, entry.key);
    }
  }

  return result;
}

export function clear_keys_by_type(key_type: KeyType): number {
  let removed_count = 0;

  for (const [id, entry] of key_cache) {
    if (entry.key_type === key_type) {
      key_cache.delete(id);
      removed_count++;
    }
  }

  return removed_count;
}

export function clear_all_keys(): void {
  key_cache.clear();
  session_start_time = null;
  stop_cleanup_timer();
}

export function get_cache_stats(): {
  total_entries: number;
  entries_by_type: Record<KeyType, number>;
  session_active: boolean;
  session_remaining_ms: number | null;
} {
  const entries_by_type: Record<KeyType, number> = {
    identity: 0,
    signed_prekey: 0,
    one_time_prekey: 0,
    ke: 0,
    aes: 0,
    hmac: 0,
  };

  for (const entry of key_cache.values()) {
    if (!is_entry_expired(entry)) {
      entries_by_type[entry.key_type]++;
    }
  }

  let session_remaining_ms: number | null = null;

  if (session_start_time !== null) {
    const elapsed = Date.now() - session_start_time;

    session_remaining_ms = Math.max(
      0,
      cache_config.session_timeout_ms - elapsed,
    );
  }

  return {
    total_entries: key_cache.size,
    entries_by_type,
    session_active: session_start_time !== null && !is_session_expired(),
    session_remaining_ms,
  };
}

export function get_session_timeout(): number {
  return cache_config.session_timeout_ms;
}

export function set_session_timeout(timeout_ms: number): void {
  cache_config.session_timeout_ms = timeout_ms;
}

export function extend_key_ttl(id: string, additional_ms: number): boolean {
  const entry = key_cache.get(id);

  if (!entry || is_entry_expired(entry)) {
    return false;
  }

  if (entry.expires_at !== null) {
    entry.expires_at = entry.expires_at + additional_ms;
  }

  return true;
}

export async function store_derived_key(
  base_key_id: string,
  derived_key_id: string,
  derivation_params: {
    algorithm: "HKDF" | "PBKDF2";
    hash: string;
    salt: Uint8Array;
    info?: Uint8Array;
    iterations?: number;
  },
  target_algorithm: AesKeyGenParams | HmacKeyGenParams,
  key_usages: KeyUsage[],
  key_type: KeyType,
): Promise<CryptoKey | null> {
  const existing = get_key(derived_key_id);

  if (existing) {
    return existing;
  }

  const base_key = get_key(base_key_id);

  if (!base_key) {
    return null;
  }

  let derived_key: CryptoKey;

  if (derivation_params.algorithm === "HKDF") {
    derived_key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: derivation_params.hash,
        salt: derivation_params.salt,
        info: derivation_params.info || new Uint8Array(0),
      },
      base_key,
      target_algorithm,
      false,
      key_usages,
    );
  } else {
    derived_key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: derivation_params.hash,
        salt: derivation_params.salt,
        iterations: derivation_params.iterations || 100000,
      },
      base_key,
      target_algorithm,
      false,
      key_usages,
    );
  }

  store_key(derived_key_id, derived_key, key_type);

  return derived_key;
}

export async function import_and_store_key(
  id: string,
  key_data: Uint8Array,
  algorithm:
    | AlgorithmIdentifier
    | RsaHashedImportParams
    | EcKeyImportParams
    | HmacImportParams
    | AesKeyAlgorithm,
  extractable: boolean,
  key_usages: KeyUsage[],
  key_type: KeyType,
  format: "raw" | "pkcs8" | "spki" = "raw",
): Promise<CryptoKey> {
  const existing = get_key(id);

  if (existing) {
    return existing;
  }

  const crypto_key = await crypto.subtle.importKey(
    format,
    key_data,
    algorithm,
    extractable,
    key_usages,
  );

  store_key(id, crypto_key, key_type);

  return crypto_key;
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
