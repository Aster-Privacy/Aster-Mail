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
const DB_NAME = "astermail_device_key";
const DB_VERSION = 1;
const STORE_NAME = "wrap_keys";
const WRAP_KEY_ID = "device_wrap_key_v2";

let cached_wrap_key: CryptoKey | null = null;
let wrap_key_promise: Promise<CryptoKey | null> | null = null;
let keychain_reset_requested = false;

async function request_native_keychain_reset(): Promise<void> {
  if (keychain_reset_requested) return;
  keychain_reset_requested = true;

  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    await invoke("reset_webkit_crypto_keychain");
  } catch {
    return;
  }
}

function indexed_db_available(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
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

function open_device_key_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () =>
      reject(request.error ?? new Error("device_key_store: open failed"));
    request.onblocked = () =>
      reject(new Error("device_key_store: open blocked"));
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function read_stored_key(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(WRAP_KEY_ID);

    request.onsuccess = () => {
      const value = request.result;

      resolve(is_crypto_key(value) ? value : null);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("device_key_store: read failed"));
  });
}

function delete_stored_key(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).delete(WRAP_KEY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("device_key_store: delete aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("device_key_store: delete failed"));
  });
}

async function key_survives_round_trip(key: CryptoKey): Promise<boolean> {
  try {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const probe = new Uint8Array([1]);
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      probe,
    );
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      sealed,
    );

    return new Uint8Array(opened)[0] === 1;
  } catch {
    return false;
  }
}

function claim_key_slot(
  db: IDBDatabase,
  candidate: CryptoKey,
): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const existing_request = store.get(WRAP_KEY_ID);
    let winner: CryptoKey = candidate;

    existing_request.onsuccess = () => {
      const existing = existing_request.result;

      if (is_crypto_key(existing)) {
        winner = existing;

        return;
      }

      store.put(candidate, WRAP_KEY_ID);
    };
    existing_request.onerror = (event) => {
      event.preventDefault();
      store.put(candidate, WRAP_KEY_ID);
    };

    transaction.oncomplete = () => resolve(winner);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("device_key_store: write aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("device_key_store: write failed"));
  });
}

async function load_or_create_wrap_key(): Promise<CryptoKey | null> {
  if (!indexed_db_available()) {
    return null;
  }

  let db: IDBDatabase | null = null;

  try {
    db = await open_device_key_db();

    let existing: CryptoKey | null = null;
    let slot_is_unusable = false;

    try {
      existing = await read_stored_key(db);
    } catch {
      slot_is_unusable = true;
    }

    if (existing) {
      if (await key_survives_round_trip(existing)) {
        return existing;
      }

      slot_is_unusable = true;
    }

    if (slot_is_unusable) {
      try {
        await delete_stored_key(db);
      } catch {
        return null;
      }
    }

    const candidate = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const claimed = await claim_key_slot(db, candidate);

    if (await key_survives_round_trip(claimed)) {
      return claimed;
    }

    await request_native_keychain_reset();

    return null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function get_device_wrap_key(): Promise<CryptoKey | null> {
  if (cached_wrap_key) {
    return cached_wrap_key;
  }

  if (!wrap_key_promise) {
    wrap_key_promise = load_or_create_wrap_key().then((key) => {
      cached_wrap_key = key;
      wrap_key_promise = null;

      return key;
    });
  }

  return wrap_key_promise;
}

export function clear_device_wrap_key_cache(): void {
  cached_wrap_key = null;
  wrap_key_promise = null;
}

export async function delete_device_wrap_key(): Promise<void> {
  clear_device_wrap_key_cache();

  if (!indexed_db_available()) {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
