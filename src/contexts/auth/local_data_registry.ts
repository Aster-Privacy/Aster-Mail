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

export const DEVICE_SETTING_LOCAL_KEYS: readonly string[] = [
  "astermail_theme",
  "astermail_language",
  "aster_connection_method",
  "aster_cdn_relay_url",
  "aster_onion_api_url",
  "aster_onion_mail_url",
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

function delete_database(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (deleted: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(deleted);
    };
    const timer = setTimeout(() => settle(false), DATABASE_DELETE_TIMEOUT_MS);

    try {
      const request = indexedDB.deleteDatabase(name);

      request.onsuccess = () => settle(true);
      request.onerror = () => settle(false);
      request.onblocked = () => settle(true);
    } catch {
      settle(false);
    }
  });
}

export async function erase_indexed_databases(): Promise<string[]> {
  if (typeof indexedDB === "undefined") return [];

  const names = await list_database_names();
  const results = await Promise.all(names.map((name) => delete_database(name)));

  return names.filter((_, index) => !results[index]);
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

export async function erase_device_traces(): Promise<boolean> {
  const failed_databases = await erase_indexed_databases();
  const failed_caches = await erase_cache_storage();
  const failed_session = erase_session_storage_traces();
  const failed_local = erase_local_storage_traces();

  return (
    failed_databases.length === 0 &&
    failed_caches.length === 0 &&
    failed_session.length === 0 &&
    failed_local.length === 0
  );
}
