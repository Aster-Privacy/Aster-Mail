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
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
  safe_session_get,
  safe_session_keys,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";
import { mark_device_traces_erased } from "@/lib/device_erase_latch";
import { ignore_error } from "@/lib/ignore_error";

export const DEVICE_SETTING_LOCAL_KEYS: readonly string[] = [
  "astermail_theme",
  "astermail_language",
  "aster_sw_reset_v1",
];

export const ERROR_REPORT_OPT_OUT_KEY = "aster_error_reports";

export const INDEXED_DB_NAMES: readonly string[] = [
  "astermail_session_keys",
  "astermail_favicon_cache",
  "aster_phishing",
  "aster_app_lock",
  "aster_calendar_sync",
  "astermail_category_index",
  "astermail_device_key",
  "astermail_device_recovery",
  "astermail_secure_db",
  "astermail_external_pgp",
  "astermail_offline_cache",
  "astermail_session_db",
];

const DATABASE_DELETE_TIMEOUT_MS = 3000;
const DATABASE_EMPTY_TIMEOUT_MS = 1500;

export interface DatabaseEraseReport {
  failed: string[];
  blocked: string[];
}

export interface DeviceTraceReport {
  complete: boolean;
  failed_databases: string[];
  blocked_databases: string[];
  failed_caches: string[];
  failed_session: string[];
  failed_local: string[];
}

type DatabaseOutcome = "deleted" | "blocked" | "failed";

const pending_deletes = new Map<string, Promise<boolean>>();
const emptied_databases = new Set<string>();
const blocked_deletes = new Set<string>();

export function survives_device_erase(
  key: string,
  value: string | null,
): boolean {
  if (DEVICE_SETTING_LOCAL_KEYS.includes(key)) return true;

  return key === ERROR_REPORT_OPT_OUT_KEY && value === "off";
}

function scramble(length: number): string {
  const bytes = new Uint8Array(Math.min(length, 65536));

  crypto.getRandomValues(bytes);

  let text = "";

  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(97 + (bytes[index % bytes.length] % 26));
  }

  return text;
}

export function erase_local_storage_traces(): string[] {
  const failed: string[] = [];

  for (const key of safe_local_keys()) {
    const value = safe_local_get(key);

    if (survives_device_erase(key, value)) continue;
    if (value) safe_local_set(key, scramble(value.length));
    safe_local_remove(key);
    if (safe_local_get(key) !== null) failed.push(key);
  }

  return failed;
}

export function erase_session_storage_traces(): string[] {
  const failed: string[] = [];

  for (const key of safe_session_keys()) {
    const value = safe_session_get(key);

    if (value) safe_session_set(key, scramble(value.length));
    safe_session_remove(key);
    if (safe_session_get(key) !== null) failed.push(key);
  }

  return failed;
}

async function list_database_names(): Promise<string[]> {
  const names = new Set<string>(INDEXED_DB_NAMES);

  try {
    if (typeof indexedDB.databases === "function") {
      for (const entry of await indexedDB.databases()) {
        if (entry.name) names.add(entry.name);
      }
    }
  } catch {
    return [...names];
  }

  return [...names];
}

function empty_database(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let absent = false;
    let db: IDBDatabase | null = null;
    const settle = (emptied: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        db?.close();
      } catch (caught) {
        ignore_error("contexts/auth/local_data_registry:empty_database", caught);
      }
      resolve(emptied);
    };
    const timer = setTimeout(() => settle(false), DATABASE_EMPTY_TIMEOUT_MS);

    try {
      const request = indexedDB.open(name);

      request.onupgradeneeded = (event) => {
        if (event.oldVersion !== 0) return;
        absent = true;
        request.transaction?.abort();
      };
      request.onerror = () => settle(absent);
      request.onsuccess = () => {
        const opened = request.result;

        if (settled) {
          opened.close();

          return;
        }
        db = opened;
        opened.onversionchange = () => settle(false);

        try {
          const stores = Array.from(opened.objectStoreNames);

          if (stores.length === 0) {
            settle(true);

            return;
          }

          const transaction = opened.transaction(stores, "readwrite");

          transaction.oncomplete = () => settle(true);
          transaction.onerror = () => settle(false);
          transaction.onabort = () => settle(false);
          for (const store of stores) transaction.objectStore(store).clear();
        } catch {
          settle(false);
        }
      };
    } catch {
      settle(false);
    }
  });
}

function request_database_delete(name: string): Promise<boolean> {
  const known = pending_deletes.get(name);

  if (known) return known;

  const outcome = new Promise<boolean>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => {
        blocked_deletes.add(name);
      };
    } catch {
      resolve(false);
    }
  }).then((deleted) => {
    pending_deletes.delete(name);
    emptied_databases.delete(name);
    blocked_deletes.delete(name);

    return deleted;
  });

  pending_deletes.set(name, outcome);

  return outcome;
}

function delete_within_timeout(name: string): Promise<boolean | null> {
  return new Promise<boolean | null>((resolve) => {
    const timer = setTimeout(
      () => resolve(null),
      DATABASE_DELETE_TIMEOUT_MS,
    );

    void request_database_delete(name).then((deleted) => {
      clearTimeout(timer);
      resolve(deleted);
    });
  });
}

async function erase_database(name: string): Promise<DatabaseOutcome> {
  if (!pending_deletes.has(name)) {
    if (await empty_database(name)) emptied_databases.add(name);
    else emptied_databases.delete(name);
  }

  const emptied = emptied_databases.has(name);
  const deleted = await delete_within_timeout(name);

  if (deleted) return "deleted";
  if (deleted === null && emptied && blocked_deletes.has(name)) {
    return "blocked";
  }

  return "failed";
}

export async function erase_indexed_databases(
  only?: readonly string[],
): Promise<DatabaseEraseReport> {
  if (typeof indexedDB === "undefined") return { failed: [], blocked: [] };

  const names = only ? [...new Set(only)] : await list_database_names();
  const outcomes = await Promise.all(names.map((name) => erase_database(name)));

  return {
    failed: names.filter((_, index) => outcomes[index] === "failed"),
    blocked: names.filter((_, index) => outcomes[index] === "blocked"),
  };
}

export async function erase_cache_storage(): Promise<string[]> {
  if (typeof caches === "undefined") return [];

  try {
    const names = await caches.keys();
    const results = await Promise.all(
      names.map((name) => caches.delete(name).catch(() => false)),
    );

    return names.filter((_, index) => !results[index]);
  } catch {
    return ["cache_storage"];
  }
}

export async function erase_device_traces(
  previous?: DeviceTraceReport,
): Promise<DeviceTraceReport> {
  mark_device_traces_erased();
  erase_session_storage_traces();
  erase_local_storage_traces();

  const retried_databases = previous
    ? [...previous.failed_databases, ...previous.blocked_databases]
    : undefined;
  const [databases, failed_caches] = await Promise.all([
    retried_databases && retried_databases.length === 0
      ? { failed: [], blocked: [] }
      : erase_indexed_databases(retried_databases),
    previous && previous.failed_caches.length === 0
      ? []
      : erase_cache_storage(),
  ]);
  const failed_session = erase_session_storage_traces();
  const failed_local = erase_local_storage_traces();

  return {
    complete:
      databases.failed.length === 0 &&
      databases.blocked.length === 0 &&
      failed_caches.length === 0 &&
      failed_session.length === 0 &&
      failed_local.length === 0,
    failed_databases: databases.failed,
    blocked_databases: databases.blocked,
    failed_caches,
    failed_session,
    failed_local,
  };
}
