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
const DB_NAME = "astermail_device_recovery";
const DB_VERSION = 1;
const KEY_STORE = "device_keys";
const SNAPSHOT_STORE = "snapshots";
const DEVICE_KEY_ID = "device_recovery_key_v1";

export interface DeviceSnapshotRecord {
  snapshot_id: string;
  user_id: string;
  source_hash: string;
  created_at: number;
  iv: Uint8Array;
  sealed: ArrayBuffer;
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
      reject(request.error ?? new Error("device_recovery_store: open failed"));
    request.onblocked = () =>
      reject(new Error("device_recovery_store: open blocked"));
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "snapshot_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function with_db<T>(
  run: (db: IDBDatabase) => Promise<T>,
): Promise<T | null> {
  if (!indexed_db_available()) return null;

  let db: IDBDatabase | null = null;

  try {
    db = await open_db();

    return await run(db);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("device_recovery_store: aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("device_recovery_store: failed"));
  });
}

function is_crypto_key(value: unknown): value is CryptoKey {
  if (typeof CryptoKey !== "undefined" && value instanceof CryptoKey) {
    return true;
  }

  return (
    typeof value === "object" &&
    value !== null &&
    "algorithm" in value &&
    "type" in value &&
    "usages" in value
  );
}

function is_record(value: unknown): value is DeviceSnapshotRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.snapshot_id === "string" &&
    typeof record.user_id === "string" &&
    typeof record.source_hash === "string" &&
    typeof record.created_at === "number" &&
    record.iv instanceof Uint8Array &&
    record.sealed instanceof ArrayBuffer
  );
}

export async function load_device_recovery_key(
  create: boolean,
): Promise<CryptoKey | null> {
  return with_db(async (db) => {
    const read = db.transaction(KEY_STORE, "readonly");
    const existing = await new Promise<unknown>((resolve, reject) => {
      const request = read.objectStore(KEY_STORE).get(DEVICE_KEY_ID);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (is_crypto_key(existing)) return existing;
    if (!create) return null;

    const candidate = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const write = db.transaction(KEY_STORE, "readwrite");
    const store = write.objectStore(KEY_STORE);
    let winner: CryptoKey = candidate;
    const lookup = store.get(DEVICE_KEY_ID);

    lookup.onsuccess = () => {
      if (is_crypto_key(lookup.result)) {
        winner = lookup.result;

        return;
      }
      store.put(candidate, DEVICE_KEY_ID);
    };

    await complete(write);

    return winner;
  });
}

export async function list_device_snapshots(
  user_id: string,
): Promise<DeviceSnapshotRecord[]> {
  const records = await with_db(async (db) => {
    const transaction = db.transaction(SNAPSHOT_STORE, "readonly");

    return new Promise<unknown[]>((resolve, reject) => {
      const request = transaction.objectStore(SNAPSHOT_STORE).getAll();

      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  });

  return (records ?? [])
    .filter(is_record)
    .filter((record) => record.user_id === user_id)
    .sort((a, b) => b.created_at - a.created_at);
}

export async function save_device_snapshot(
  record: DeviceSnapshotRecord,
): Promise<boolean> {
  const saved = await with_db(async (db) => {
    const transaction = db.transaction(SNAPSHOT_STORE, "readwrite");

    transaction.objectStore(SNAPSHOT_STORE).put(record);
    await complete(transaction);

    return true;
  });

  return saved === true;
}

export async function delete_device_snapshots(
  snapshot_ids: string[],
): Promise<void> {
  if (snapshot_ids.length === 0) return;

  await with_db(async (db) => {
    const transaction = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = transaction.objectStore(SNAPSHOT_STORE);

    for (const id of snapshot_ids) store.delete(id);
    await complete(transaction);

    return true;
  });
}
