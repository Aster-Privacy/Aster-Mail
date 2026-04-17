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
const SESSION_KEY_DB_NAME = "astermail_session_keys";
const SESSION_KEY_STORE = "keys";
const SESSION_KEY_ID = "session_encryption_key";

const IDB_OPEN_TIMEOUT_MS = 10000;
const IDB_TX_TIMEOUT_MS = 8000;

let session_encryption_key: CryptoKey | null = null;

function open_session_key_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      reject(new Error("IndexedDB open timed out"));
    }, IDB_OPEN_TIMEOUT_MS);

    const request = indexedDB.open(SESSION_KEY_DB_NAME, 1);

    request.onerror = () => {
      clearTimeout(timeout_id);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSION_KEY_STORE)) {
        db.createObjectStore(SESSION_KEY_STORE, { keyPath: "id" });
      }
    };

    request.onblocked = () => {
      clearTimeout(timeout_id);
      reject(new Error("IndexedDB blocked by another connection"));
    };
  });
}

async function store_session_key_in_db(key: CryptoKey): Promise<void> {
  const db = await open_session_key_db();
  const raw = await crypto.subtle.exportKey("raw", key);
  const raw_bytes = new Uint8Array(raw);

  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      try {
        db.close();
      } catch {}
      reject(new Error("IndexedDB store transaction timed out"));
    }, IDB_TX_TIMEOUT_MS);

    const tx = db.transaction(SESSION_KEY_STORE, "readwrite");
    const store = tx.objectStore(SESSION_KEY_STORE);
    const request = store.put({ id: SESSION_KEY_ID, raw: raw_bytes });

    request.onerror = () => {
      clearTimeout(timeout_id);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
      resolve();
    };
    tx.oncomplete = () => db.close();
  });
}

async function get_session_key_from_db(): Promise<CryptoKey | null> {
  try {
    const db = await open_session_key_db();

    return new Promise((resolve, reject) => {
      const timeout_id = setTimeout(() => {
        try {
          db.close();
        } catch {}
        resolve(null);
      }, IDB_TX_TIMEOUT_MS);

      const tx = db.transaction(SESSION_KEY_STORE, "readonly");
      const store = tx.objectStore(SESSION_KEY_STORE);
      const request = store.get(SESSION_KEY_ID);

      request.onerror = () => {
        clearTimeout(timeout_id);
        reject(request.error);
      };
      request.onsuccess = async () => {
        clearTimeout(timeout_id);
        const result = request.result;

        if (result?.raw) {
          try {
            const key = await crypto.subtle.importKey(
              "raw",
              result.raw,
              { name: "AES-GCM", length: 256 },
              true,
              ["encrypt", "decrypt"],
            );

            resolve(key);
          } catch {
            resolve(null);
          }
        } else if (result?.key) {
          resolve(result.key);
        } else {
          resolve(null);
        }
      };
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function clear_session_key_from_db(): Promise<void> {
  try {
    const db = await open_session_key_db();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_KEY_STORE, "readwrite");
      const store = tx.objectStore(SESSION_KEY_STORE);
      const request = store.delete(SESSION_KEY_ID);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    return;
  }
}

export async function get_or_create_session_key(): Promise<CryptoKey> {
  if (session_encryption_key) {
    return session_encryption_key;
  }

  const stored_key = await get_session_key_from_db();

  if (stored_key) {
    session_encryption_key = stored_key;

    return session_encryption_key;
  }

  session_encryption_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  await store_session_key_in_db(session_encryption_key);

  return session_encryption_key;
}

export async function clear_session_key(): Promise<void> {
  session_encryption_key = null;
  await clear_session_key_from_db();
}

export function get_session_encryption_key(): CryptoKey | null {
  return session_encryption_key;
}

export function set_session_encryption_key(key: CryptoKey | null): void {
  session_encryption_key = key;
}

export { get_session_key_from_db };
