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
import { ignore_error } from "@/lib/ignore_error";
import { read_logo_tone, type LogoTone } from "@/lib/logo_tone";

const DB_NAME = "astermail_favicon_cache";
const STORE = "favicons";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const IDB_OPEN_TIMEOUT_MS = 5000;
const IDB_TX_TIMEOUT_MS = 8000;

const live_urls: Map<string, string> = new Map();
const in_flight: Map<string, Promise<string | null>> = new Map();
const tones: Map<string, LogoTone | null> = new Map();
const tone_listeners = new Set<() => void>();

interface FaviconEntry {
  domain: string;
  blob: Blob;
  ts: number;
  tone?: LogoTone | null;
}

function set_tone(domain: string, tone: LogoTone | null): void {
  if (tones.get(domain) === tone && tones.has(domain)) return;
  tones.set(domain, tone);
  for (const listener of tone_listeners) listener();
}

export function peek_favicon_tone(domain: string): LogoTone | null {
  return tones.get(domain) ?? null;
}

export function subscribe_favicon_tones(listener: () => void): () => void {
  tone_listeners.add(listener);

  return () => {
    tone_listeners.delete(listener);
  };
}

let db_promise: Promise<IDBDatabase> | null = null;

function open_connection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      reject(new Error("favicon IndexedDB open timed out"));
    }, IDB_OPEN_TIMEOUT_MS);

    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      clearTimeout(timeout_id);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
      const db = request.result;

      db.onclose = () => {
        db_promise = null;
      };
      db.onversionchange = () => {
        db_promise = null;
        try {
          db.close();
        } catch (caught) {
          ignore_error("lib/favicon_cache_db:onversionchange", caught);
        }
      };
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "domain" });
      }
    };
    request.onblocked = () => {
      clearTimeout(timeout_id);
      reject(new Error("favicon IndexedDB blocked"));
    };
  });
}

function open_favicon_db(): Promise<IDBDatabase> {
  if (!db_promise) {
    db_promise = open_connection().catch((caught) => {
      db_promise = null;
      throw caught;
    });
  }

  return db_promise;
}

async function read_entry(domain: string): Promise<FaviconEntry | null> {
  let db: IDBDatabase;

  try {
    db = await open_favicon_db();
  } catch {
    return null;
  }

  return new Promise<FaviconEntry | null>((resolve) => {
    const timeout_id = setTimeout(() => resolve(null), IDB_TX_TIMEOUT_MS);

    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const request = store.get(domain);

    request.onerror = () => {
      clearTimeout(timeout_id);
      resolve(null);
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
      resolve((request.result as FaviconEntry) ?? null);
    };
  });
}

async function write_entry(entry: FaviconEntry): Promise<void> {
  let db: IDBDatabase;

  try {
    db = await open_favicon_db();
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout_id = setTimeout(resolve, IDB_TX_TIMEOUT_MS);

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.put(entry);

    request.onerror = () => {
      clearTimeout(timeout_id);
      resolve();
    };
    tx.oncomplete = () => {
      clearTimeout(timeout_id);
      resolve();
    };
  });
}

function analyze_stored_entry(entry: FaviconEntry): void {
  read_logo_tone(entry.blob)
    .then((tone) => {
      if (live_urls.has(entry.domain)) set_tone(entry.domain, tone);

      return write_entry({ ...entry, tone });
    })
    .catch((caught) =>
      ignore_error("lib/favicon_cache_db:analyze_stored_entry", caught),
    );
}

export function peek_favicon_object_url(domain: string): string | null {
  return live_urls.get(domain) ?? null;
}

export function get_favicon_object_url(domain: string): Promise<string | null> {
  const cached = live_urls.get(domain);

  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const existing = in_flight.get(domain);

  if (existing) return existing;

  const promise = read_entry(domain)
    .then((entry) => {
      in_flight.delete(domain);

      if (!entry || Date.now() - entry.ts > TTL_MS) {
        return null;
      }

      const url = URL.createObjectURL(entry.blob);

      live_urls.set(domain, url);

      if (entry.tone !== undefined) {
        set_tone(domain, entry.tone);
      } else {
        analyze_stored_entry(entry);
      }

      return url;
    })
    .catch(() => {
      in_flight.delete(domain);

      return null;
    });

  in_flight.set(domain, promise);

  return promise;
}

export async function cache_favicon_blob(
  domain: string,
  blob: Blob,
): Promise<void> {
  if (blob.size > 200 * 1024) return;

  const tone = await read_logo_tone(blob);

  set_tone(domain, tone);

  await write_entry({ domain, blob, ts: Date.now(), tone });
}

export async function evict_stale_favicons(): Promise<void> {
  let db: IDBDatabase;

  try {
    db = await open_favicon_db();
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout_id = setTimeout(resolve, IDB_TX_TIMEOUT_MS);

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.openCursor();
    const now = Date.now();

    request.onerror = () => {
      clearTimeout(timeout_id);
      resolve();
    };
    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null;

      if (!cursor) return;

      const entry = cursor.value as FaviconEntry;

      if (now - entry.ts > TTL_MS) {
        const stale_url = live_urls.get(entry.domain);

        if (stale_url) {
          try {
            URL.revokeObjectURL(stale_url);
          } catch (caught) {
            ignore_error("lib/favicon_cache_db:evict_stale_favicons", caught);
          }
          live_urls.delete(entry.domain);
        }
        tones.delete(entry.domain);
        cursor.delete();
      }

      cursor.continue();
    };
    tx.oncomplete = () => {
      clearTimeout(timeout_id);
      resolve();
    };
  });
}

export async function purge_favicon_cache(): Promise<void> {
  for (const url of live_urls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch (caught) {
      ignore_error("lib/favicon_cache_db:purge_favicon_cache", caught);
    }
  }

  live_urls.clear();
  in_flight.clear();
  tones.clear();
  for (const listener of tone_listeners) listener();

  let db: IDBDatabase;

  try {
    db = await open_favicon_db();
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout_id = setTimeout(resolve, IDB_TX_TIMEOUT_MS);

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.clear();

    request.onerror = () => {
      clearTimeout(timeout_id);
      resolve();
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
    };
    tx.oncomplete = () => {
      clearTimeout(timeout_id);
      resolve();
    };
  });
}
