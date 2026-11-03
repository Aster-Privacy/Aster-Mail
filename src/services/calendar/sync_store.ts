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

const DB_NAME = "aster_calendar_sync";
const DB_VERSION = 1;
const EVENTS_STORE = "events";
const CALENDARS_STORE = "calendars";
const META_STORE = "meta";
const QUEUE_STORE = "queue";
const ALL_STORES = [EVENTS_STORE, CALENDARS_STORE, META_STORE, QUEUE_STORE];
const KEY_SEPARATOR = "|";
const KEY_UPPER_BOUND = "￿";
const ANONYMOUS_ACCOUNT = "anonymous";

export interface CachedEventRow {
  id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CachedCalendarRow {
  id: string;
  encrypted_blob: string;
  blob_nonce: string;
  is_visible: boolean;
  is_default: boolean;
  version: number;
  updated_at: string;
}

export interface SyncCursor {
  server_time: string;
  cursor_id: string | null;
}

export interface SyncMeta {
  events_cursor?: SyncCursor;
  calendars_cursor?: SyncCursor;
  bound_event_ids?: string[];
  bound_calendar_ids?: string[];
  v3_event_ids?: string[];
  v3_calendar_ids?: string[];
  event_revisions?: Record<string, number>;
  calendar_revisions?: Record<string, number>;
  event_confirmed?: Record<string, number>;
  calendar_confirmed?: Record<string, number>;
  event_pending?: Record<string, number>;
  calendar_pending?: Record<string, number>;
}

export interface QueueRecord {
  id: string;
  seq: number;
  payload: unknown;
}

export interface SyncPage {
  events?: CachedEventRow[];
  event_deletes?: string[];
  calendars?: CachedCalendarRow[];
  calendar_deletes?: string[];
  meta?: Partial<SyncMeta>;
}

export interface SyncStoreAdapter {
  get_events(account_id: string): Promise<CachedEventRow[]>;
  get_calendars(account_id: string): Promise<CachedCalendarRow[]>;
  get_meta(account_id: string): Promise<SyncMeta>;
  apply_page(account_id: string, page: SyncPage): Promise<void>;
  get_queue(account_id: string): Promise<QueueRecord[]>;
  put_queue(account_id: string, record: QueueRecord): Promise<void>;
  delete_queue(account_id: string, id: string): Promise<void>;
  clear_account(account_id: string): Promise<void>;
  clear_all(): Promise<void>;
}

function scoped_key(account_id: string, id: string): string {
  return `${account_id}${KEY_SEPARATOR}${id}`;
}

function scope_prefix(account_id: string): string {
  return `${account_id}${KEY_SEPARATOR}`;
}

function scope_range(account_id: string): IDBKeyRange {
  const prefix = scope_prefix(account_id);

  return IDBKeyRange.bound(prefix, prefix + KEY_UPPER_BOUND, false, false);
}

export class MemorySyncStore implements SyncStoreAdapter {
  private readonly events = new Map<string, CachedEventRow>();
  private readonly calendars = new Map<string, CachedCalendarRow>();
  private readonly meta = new Map<string, SyncMeta>();
  private readonly queue = new Map<string, QueueRecord>();

  async get_events(account_id: string): Promise<CachedEventRow[]> {
    return this.scoped(this.events, account_id);
  }

  async get_calendars(account_id: string): Promise<CachedCalendarRow[]> {
    return this.scoped(this.calendars, account_id);
  }

  async get_meta(account_id: string): Promise<SyncMeta> {
    return { ...(this.meta.get(account_id) ?? {}) };
  }

  async apply_page(account_id: string, page: SyncPage): Promise<void> {
    for (const row of page.events ?? []) {
      this.events.set(scoped_key(account_id, row.id), row);
    }
    for (const id of page.event_deletes ?? []) {
      this.events.delete(scoped_key(account_id, id));
    }
    for (const row of page.calendars ?? []) {
      this.calendars.set(scoped_key(account_id, row.id), row);
    }
    for (const id of page.calendar_deletes ?? []) {
      this.calendars.delete(scoped_key(account_id, id));
    }
    if (page.meta) {
      this.meta.set(account_id, {
        ...(this.meta.get(account_id) ?? {}),
        ...page.meta,
      });
    }
  }

  async get_queue(account_id: string): Promise<QueueRecord[]> {
    return this.scoped(this.queue, account_id).sort((a, b) => a.seq - b.seq);
  }

  async put_queue(account_id: string, record: QueueRecord): Promise<void> {
    this.queue.set(scoped_key(account_id, record.id), record);
  }

  async delete_queue(account_id: string, id: string): Promise<void> {
    this.queue.delete(scoped_key(account_id, id));
  }

  async clear_account(account_id: string): Promise<void> {
    const prefix = scope_prefix(account_id);

    for (const map of [this.events, this.calendars, this.queue]) {
      for (const key of Array.from(map.keys())) {
        if (key.startsWith(prefix)) {
          map.delete(key);
        }
      }
    }
    this.meta.delete(account_id);
  }

  async clear_all(): Promise<void> {
    this.events.clear();
    this.calendars.clear();
    this.meta.clear();
    this.queue.clear();
  }

  private scoped<T>(map: Map<string, T>, account_id: string): T[] {
    const prefix = scope_prefix(account_id);
    const result: T[] = [];

    for (const [key, value] of map) {
      if (key.startsWith(prefix)) {
        result.push(value);
      }
    }

    return result;
  }
}

function request_to_promise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction_to_promise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

class IndexedDbSyncStore implements SyncStoreAdapter {
  private db_promise: Promise<IDBDatabase> | null = null;

  async get_events(account_id: string): Promise<CachedEventRow[]> {
    return this.read_all<CachedEventRow>(EVENTS_STORE, account_id);
  }

  async get_calendars(account_id: string): Promise<CachedCalendarRow[]> {
    return this.read_all<CachedCalendarRow>(CALENDARS_STORE, account_id);
  }

  async get_meta(account_id: string): Promise<SyncMeta> {
    const db = await this.open();
    const transaction = db.transaction(META_STORE, "readonly");
    const value = await request_to_promise(
      transaction.objectStore(META_STORE).get(account_id),
    );

    return (value as SyncMeta | undefined) ?? {};
  }

  async apply_page(account_id: string, page: SyncPage): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(
      [EVENTS_STORE, CALENDARS_STORE, META_STORE],
      "readwrite",
    );
    const events = transaction.objectStore(EVENTS_STORE);
    const calendars = transaction.objectStore(CALENDARS_STORE);
    const meta = transaction.objectStore(META_STORE);

    for (const row of page.events ?? []) {
      events.put(row, scoped_key(account_id, row.id));
    }
    for (const id of page.event_deletes ?? []) {
      events.delete(scoped_key(account_id, id));
    }
    for (const row of page.calendars ?? []) {
      calendars.put(row, scoped_key(account_id, row.id));
    }
    for (const id of page.calendar_deletes ?? []) {
      calendars.delete(scoped_key(account_id, id));
    }
    if (page.meta) {
      const current =
        ((await request_to_promise(meta.get(account_id))) as
          SyncMeta | undefined) ?? {};

      meta.put({ ...current, ...page.meta }, account_id);
    }

    await transaction_to_promise(transaction);
  }

  async get_queue(account_id: string): Promise<QueueRecord[]> {
    const records = await this.read_all<QueueRecord>(QUEUE_STORE, account_id);

    return records.sort((a, b) => a.seq - b.seq);
  }

  async put_queue(account_id: string, record: QueueRecord): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(QUEUE_STORE, "readwrite");

    transaction
      .objectStore(QUEUE_STORE)
      .put(record, scoped_key(account_id, record.id));

    await transaction_to_promise(transaction);
  }

  async delete_queue(account_id: string, id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(QUEUE_STORE, "readwrite");

    transaction.objectStore(QUEUE_STORE).delete(scoped_key(account_id, id));

    await transaction_to_promise(transaction);
  }

  async clear_account(account_id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(ALL_STORES, "readwrite");

    for (const name of [EVENTS_STORE, CALENDARS_STORE, QUEUE_STORE]) {
      transaction.objectStore(name).delete(scope_range(account_id));
    }
    transaction.objectStore(META_STORE).delete(account_id);

    await transaction_to_promise(transaction);
  }

  async clear_all(): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(ALL_STORES, "readwrite");

    for (const name of ALL_STORES) {
      transaction.objectStore(name).clear();
    }

    await transaction_to_promise(transaction);
  }

  private async read_all<T>(store: string, account_id: string): Promise<T[]> {
    const db = await this.open();
    const transaction = db.transaction(store, "readonly");
    const rows = await request_to_promise(
      transaction.objectStore(store).getAll(scope_range(account_id)),
    );

    return rows as T[];
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db_promise) {
      this.db_promise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          for (const name of ALL_STORES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name);
            }
          }
        };
        request.onsuccess = () => {
          const db = request.result;

          db.onversionchange = () => {
            db.close();
            this.db_promise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          this.db_promise = null;
          reject(request.error);
        };
        request.onblocked = () => {
          this.db_promise = null;
          reject(new Error("calendar sync database blocked"));
        };
      });
    }

    return this.db_promise;
  }
}

let active_adapter: SyncStoreAdapter | null = null;
let persistent_failed = false;

function indexeddb_available(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    indexedDB !== null &&
    typeof IDBKeyRange !== "undefined"
  );
}

export function get_sync_store(): SyncStoreAdapter {
  if (!active_adapter) {
    active_adapter =
      indexeddb_available() && !persistent_failed
        ? new IndexedDbSyncStore()
        : new MemorySyncStore();
  }

  return active_adapter;
}

export function set_sync_store_adapter(adapter: SyncStoreAdapter | null): void {
  active_adapter = adapter;
  persistent_failed = false;
}

async function guarded<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    if (active_adapter instanceof IndexedDbSyncStore) {
      persistent_failed = true;
      active_adapter = new MemorySyncStore();
    }

    return fallback;
  }
}

export async function resolve_sync_account_id(): Promise<string> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return (await get_current_account_id()) ?? ANONYMOUS_ACCOUNT;
  } catch {
    return ANONYMOUS_ACCOUNT;
  }
}

export function read_cached_events(
  account_id: string,
): Promise<CachedEventRow[]> {
  return guarded([], () => get_sync_store().get_events(account_id));
}

export function read_cached_calendars(
  account_id: string,
): Promise<CachedCalendarRow[]> {
  return guarded([], () => get_sync_store().get_calendars(account_id));
}

export function read_sync_meta(account_id: string): Promise<SyncMeta> {
  return guarded({}, () => get_sync_store().get_meta(account_id));
}

export function write_sync_page(
  account_id: string,
  page: SyncPage,
): Promise<boolean> {
  return guarded(false, async () => {
    await get_sync_store().apply_page(account_id, page);

    return true;
  });
}

export function read_queue(account_id: string): Promise<QueueRecord[]> {
  return guarded([], () => get_sync_store().get_queue(account_id));
}

export function write_queue_record(
  account_id: string,
  record: QueueRecord,
): Promise<boolean> {
  return guarded(false, async () => {
    await get_sync_store().put_queue(account_id, record);

    return true;
  });
}

export function remove_queue_record(
  account_id: string,
  id: string,
): Promise<boolean> {
  return guarded(false, async () => {
    await get_sync_store().delete_queue(account_id, id);

    return true;
  });
}

export function clear_sync_account(account_id: string): Promise<boolean> {
  return guarded(false, async () => {
    await get_sync_store().clear_account(account_id);

    return true;
  });
}

export function clear_calendar_sync_cache(): Promise<boolean> {
  return guarded(false, async () => {
    await get_sync_store().clear_all();

    return true;
  });
}
