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
const HASH_ALG = ["SHA", "256"].join("-");
const DB_NAME = "astermail_session_db";
const DB_VERSION = 1;
const STORE_NAME = "session_data";
const STORAGE_VERSION = 3;

let session_key: CryptoKey | null = null;
let hmac_key: CryptoKey | null = null;
let db_instance: IDBDatabase | null = null;
let db_promise: Promise<IDBDatabase> | null = null;

interface EncryptedRecord {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  hmac: Uint8Array;
  version: number;
  timestamp: number;
}

async function open_database(): Promise<IDBDatabase> {
  if (db_instance) {
    return db_instance;
  }

  if (db_promise) {
    return db_promise;
  }

  db_promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      db_promise = null;
      reject(new Error("Failed to open session database"));
    };

    request.onsuccess = () => {
      db_instance = request.result;
      db_instance.onclose = () => {
        db_instance = null;
        db_promise = null;
      };
      resolve(db_instance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return db_promise;
}

async function get_or_create_session_key(): Promise<CryptoKey> {
  if (session_key) {
    return session_key;
  }

  session_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return session_key;
}

async function get_or_create_hmac_key(): Promise<CryptoKey> {
  if (hmac_key) {
    return hmac_key;
  }

  hmac_key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign", "verify"],
  );

  return hmac_key;
}

async function compute_hmac(
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign("HMAC", key, data);

  return new Uint8Array(signature);
}

function constant_time_compare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

async function encrypt_data(data: string): Promise<EncryptedRecord> {
  const key = await get_or_create_session_key();
  const hmac_k = await get_or_create_hmac_key();

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data);

  const ciphertext_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  const ciphertext = new Uint8Array(ciphertext_buffer);

  const hmac_data = new Uint8Array(iv.length + ciphertext.length);

  hmac_data.set(iv, 0);
  hmac_data.set(ciphertext, iv.length);

  const hmac = await compute_hmac(hmac_k, hmac_data);

  return {
    iv,
    ciphertext,
    hmac,
    version: STORAGE_VERSION,
    timestamp: Date.now(),
  };
}

async function decrypt_data(record: EncryptedRecord): Promise<string | null> {
  try {
    const key = await get_or_create_session_key();
    const hmac_k = await get_or_create_hmac_key();

    const hmac_data = new Uint8Array(
      record.iv.length + record.ciphertext.length,
    );

    hmac_data.set(record.iv, 0);
    hmac_data.set(record.ciphertext, record.iv.length);

    const computed_hmac = await compute_hmac(hmac_k, hmac_data);

    if (!constant_time_compare(computed_hmac, record.hmac)) {
      return null;
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      key,
      record.ciphertext,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function secure_set(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  const encrypted = await encrypt_data(json);

  const db = await open_database();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(encrypted, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to store data"));
  });
}

export async function secure_get<T>(key: string): Promise<T | null> {
  try {
    const db = await open_database();

    const record = await new Promise<EncryptedRecord | null>(
      (resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(new Error("Failed to retrieve data"));
      },
    );

    if (!record) {
      return null;
    }

    if (record.version > STORAGE_VERSION) {
      return null;
    }

    const max_age = 30 * 24 * 60 * 60 * 1000;

    if (Date.now() - record.timestamp > max_age) {
      await secure_remove(key);

      return null;
    }

    const decrypted = await decrypt_data(record);

    if (!decrypted) {
      await secure_remove(key);

      return null;
    }

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export async function secure_remove(key: string): Promise<void> {
  try {
    const db = await open_database();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    return;
  }
}

export function clear_session(): void {
  session_key = null;
  hmac_key = null;

  if (db_instance) {
    db_instance.close();
    db_instance = null;
    db_promise = null;
  }
}

export function has_valid_session(): boolean {
  return session_key !== null;
}

export async function initialize_session(): Promise<void> {
  await get_or_create_session_key();
  await get_or_create_hmac_key();
}

export async function clear_all_session_data(): Promise<void> {
  try {
    const db = await open_database();

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    return;
  }

  clear_session();
}

export async function delete_session_database(): Promise<void> {
  clear_session();

  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
