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
const DB_NAME = "astermail_external_pgp";
const DB_VERSION = 1;
const STORE = "wrapped_keys";

export interface cached_external_key {
  user_id: string;
  fingerprint: string;
  wrapped_private_key: string;
  public_key_armored: string;
  published: boolean;
  stored_at: number;
}

function indexed_db_available(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function open_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () =>
      reject(request.error ?? new Error("external key cache: open failed"));
    request.onblocked = () =>
      reject(new Error("external key cache: open blocked"));
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "user_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function with_store<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  if (!indexed_db_available()) return null;

  let db: IDBDatabase | null = null;

  try {
    db = await open_db();
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));

    return await new Promise<T | null>((resolve, reject) => {
      transaction.oncomplete = () => resolve((request.result as T) ?? null);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function is_cached_record(value: unknown): value is cached_external_key {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.user_id === "string" &&
    typeof record.fingerprint === "string" &&
    typeof record.wrapped_private_key === "string" &&
    typeof record.public_key_armored === "string" &&
    typeof record.published === "boolean"
  );
}

export async function read_cached_external_key(
  user_id: string,
): Promise<cached_external_key | null> {
  const value = await with_store<unknown>("readonly", (store) =>
    store.get(user_id),
  );

  return is_cached_record(value) ? value : null;
}

export async function write_cached_external_key(
  record: cached_external_key,
): Promise<void> {
  await with_store("readwrite", (store) => store.put(record));
}

export async function remove_cached_external_key(
  user_id: string,
): Promise<void> {
  await with_store("readwrite", (store) => store.delete(user_id));
}

export async function delete_external_key_cache(): Promise<void> {
  if (!indexed_db_available()) return;

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
