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
import { api_client } from "@/services/api/client";

const IDB_STORE = "phishing_blocklist";
const IDB_KEY = "bloom_data";
const UPDATE_INTERVAL = 60 * 60 * 1000;

interface BlocklistData {
  version: number;
  bloom_filter: Uint8Array;
  url_count: number;
  fetched_at: number;
}

let cached_data: BlocklistData | null = null;
let update_timer: ReturnType<typeof setInterval> | null = null;

async function open_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("aster_phishing", 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function load_from_idb(): Promise<BlocklistData | null> {
  try {
    const db = await open_db();

    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const request = store.get(IDB_KEY);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function save_to_idb(data: BlocklistData): Promise<void> {
  try {
    const db = await open_db();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);

    store.put(data, IDB_KEY);
  } catch {}
}

async function fetch_blocklist(): Promise<BlocklistData | null> {
  try {
    const response = await api_client.get<{
      version: number;
      bloom_filter: string;
      url_count: number;
    }>("/phishing/v1/blocklist");

    if (!response.data?.bloom_filter) return null;

    const binary = atob(response.data.bloom_filter);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return {
      version: response.data.version,
      bloom_filter: bytes,
      url_count: response.data.url_count,
      fetched_at: Date.now(),
    };
  } catch {
    return null;
  }
}

function bloom_check(filter: Uint8Array, item: Uint8Array): boolean {
  if (filter.length === 0) return false;

  const bit_count = filter.length * 8;
  const num_hashes = 7;

  for (let i = 0; i < num_hashes; i++) {
    let hash = fnv1a(item, i);

    hash = ((hash % bit_count) + bit_count) % bit_count;
    const byte_index = Math.floor(hash / 8);
    const bit_index = hash % 8;

    if ((filter[byte_index] & (1 << bit_index)) === 0) {
      return false;
    }
  }

  return true;
}

function fnv1a(data: Uint8Array, seed: number): number {
  let hash = 0x811c9dc5 ^ seed;

  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

async function sha256_hash(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);

  return new Uint8Array(buffer);
}

export async function init_blocklist(): Promise<void> {
  const stored = await load_from_idb();

  if (stored) {
    cached_data = stored;
  }

  const fresh = await fetch_blocklist();

  if (fresh && (!cached_data || fresh.version > cached_data.version)) {
    cached_data = fresh;
    await save_to_idb(fresh);
  }

  if (update_timer) clearInterval(update_timer);
  update_timer = setInterval(async () => {
    const updated = await fetch_blocklist();

    if (updated && (!cached_data || updated.version > cached_data.version)) {
      cached_data = updated;
      await save_to_idb(updated);
    }
  }, UPDATE_INTERVAL);
}

export async function check_url_blocklist(url: string): Promise<boolean> {
  if (!cached_data || cached_data.bloom_filter.length === 0) return false;

  try {
    const domain = extract_domain(url);
    const hash = await sha256_hash(domain.toLowerCase());

    return bloom_check(cached_data.bloom_filter, hash);
  } catch {
    return false;
  }
}

export async function verify_url_with_server(
  urls: string[],
): Promise<Set<string>> {
  const matched = new Set<string>();

  if (urls.length === 0) return matched;

  const prefix_map = new Map<string, string[]>();

  for (const url of urls) {
    try {
      const domain = extract_domain(url);
      const hash = await sha256_hash(domain.toLowerCase());
      const prefix = Array.from(hash.slice(0, 4))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (!prefix_map.has(prefix)) {
        prefix_map.set(prefix, []);
      }
      prefix_map.get(prefix)!.push(url);
    } catch {}
  }

  try {
    const response = await api_client.post<{
      matches: { prefix: string; full_hashes: string[] }[];
    }>("/phishing/v1/check-urls", {
      hash_prefixes: Array.from(prefix_map.keys()),
    });

    if (response.data?.matches) {
      for (const match of response.data.matches) {
        const urls_for_prefix = prefix_map.get(match.prefix) || [];

        for (const url of urls_for_prefix) {
          matched.add(url);
        }
      }
    }
  } catch {}

  return matched;
}

function extract_domain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const without_scheme = url
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0];

    return without_scheme;
  }
}

export function cleanup_blocklist(): void {
  if (update_timer) {
    clearInterval(update_timer);
    update_timer = null;
  }
  cached_data = null;
}
