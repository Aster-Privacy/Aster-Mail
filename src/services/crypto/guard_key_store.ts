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
import { release_on_version_change } from "@/lib/idb_release";

export const GUARD_DB_NAME = "astermail_guard_device";
const GUARD_DB_VERSION = 1;
const GUARD_STORE = "keys";

export interface GuardWrappedSecrets {
  iv: Uint8Array;
  ct: Uint8Array;
}

export interface GuardKeyRecord {
  user_id: string;
  name: string;
  action_key: CryptoKey;
  action_pk: Uint8Array;
  ed25519_pk: Uint8Array;
  mlkem_pk: Uint8Array;
  x25519_pk: Uint8Array;
  wrapped_secrets: GuardWrappedSecrets | null;
  wrapped_code_secret?: GuardWrappedSecrets | null;
  device_id: string | null;
  created_at?: number;
}

const HINT_PREFIX = "hint:";
const PENDING_RECORD_PREFIX = "pending:";
export const GUARD_PENDING_MAX_AGE_MS = 15 * 60 * 1000;

function idb_available(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function open_guard_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GUARD_DB_NAME, GUARD_DB_VERSION);

    request.onerror = () =>
      reject(request.error ?? new Error("guard_key_store: open failed"));
    request.onblocked = () => reject(new Error("guard_key_store: open blocked"));
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(GUARD_STORE)) {
        db.createObjectStore(GUARD_STORE);
      }
    };
    request.onsuccess = () => resolve(release_on_version_change(request.result));
  });
}

async function with_store<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | null,
): Promise<T | undefined> {
  const db = await open_guard_db();

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(GUARD_STORE, mode);
      const request = run(tx.objectStore(GUARD_STORE));
      let result: T | undefined;

      if (request) {
        request.onsuccess = () => {
          result = request.result as T | undefined;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new Error("guard_key_store: transaction aborted"));
      tx.onerror = () =>
        reject(tx.error ?? new Error("guard_key_store: transaction failed"));
    });
  } finally {
    db.close();
  }
}

function is_record(value: unknown, user_id: string): value is GuardKeyRecord {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Partial<GuardKeyRecord>;

  return (
    rec.user_id === user_id &&
    rec.action_key !== undefined &&
    rec.action_pk instanceof Uint8Array
  );
}

export async function read_guard_record(
  user_id: string,
): Promise<GuardKeyRecord | null> {
  if (!idb_available()) return null;
  const value = await with_store<unknown>("readonly", (store) =>
    store.get(user_id),
  );

  return is_record(value, user_id) ? value : null;
}

export async function write_guard_record(record: GuardKeyRecord): Promise<void> {
  if (!idb_available()) throw new Error("guard_key_store: unavailable");
  const stored =
    record.user_id.startsWith(PENDING_RECORD_PREFIX) &&
    record.created_at === undefined
      ? { ...record, created_at: Date.now() }
      : record;

  await with_store("readwrite", (store) => store.put(stored, stored.user_id));
}

export async function sweep_pending_guard_records(
  now: number = Date.now(),
): Promise<void> {
  if (!idb_available()) return;
  const keys = await with_store<IDBValidKey[]>("readonly", (store) =>
    store.getAllKeys(),
  );

  for (const key of keys ?? []) {
    if (typeof key !== "string" || !key.startsWith(PENDING_RECORD_PREFIX)) {
      continue;
    }
    const value = await with_store<unknown>("readonly", (store) =>
      store.get(key),
    );
    const created =
      typeof value === "object" && value !== null
        ? (value as { created_at?: unknown }).created_at
        : undefined;

    if (
      typeof created !== "number" ||
      now - created > GUARD_PENDING_MAX_AGE_MS
    ) {
      await with_store("readwrite", (store) => store.delete(key));
    }
  }
}

export async function delete_guard_record(user_id: string): Promise<void> {
  if (!idb_available()) return;
  await with_store("readwrite", (store) => store.delete(user_id));
}

export async function rekey_guard_record(
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return;
  const record = await read_guard_record(from);

  if (!record) throw new Error("guard_key_store: no record");
  await write_guard_record({ ...record, user_id: to });
  await delete_guard_record(from);
}

export async function read_guard_hint(
  user_hash: string,
): Promise<string | null> {
  if (!idb_available()) return null;
  const value = await with_store<unknown>("readonly", (store) =>
    store.get(HINT_PREFIX + user_hash),
  );

  return typeof value === "string" ? value : null;
}

export async function write_guard_hint(
  user_hash: string,
  user_id: string,
): Promise<void> {
  if (!idb_available()) return;
  await with_store("readwrite", (store) =>
    store.put(user_id, HINT_PREFIX + user_hash),
  );
}

export async function delete_guard_hints_for(user_id: string): Promise<void> {
  if (!idb_available()) return;
  const keys = await with_store<IDBValidKey[]>("readonly", (store) =>
    store.getAllKeys(),
  );

  for (const key of keys ?? []) {
    if (typeof key !== "string" || !key.startsWith(HINT_PREFIX)) continue;
    const value = await with_store<unknown>("readonly", (store) =>
      store.get(key),
    );

    if (value === user_id) {
      await with_store("readwrite", (store) => store.delete(key));
    }
  }
}

export async function delete_guard_database(): Promise<void> {
  if (!idb_available()) return;

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(GUARD_DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
