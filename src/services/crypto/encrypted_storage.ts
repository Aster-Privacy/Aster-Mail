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
const DB_NAME = "astermail_secure_db";
const DB_VERSION = 1;
const STORE_NAME = "encrypted_data";

interface EncryptedEntry {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  version: number;
  timestamp: number;
}

const CURRENT_VERSION = 1;

let db_instance: IDBDatabase | null = null;
let db_promise: Promise<IDBDatabase> | null = null;

function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
  crypto.getRandomValues(buffer);
  buffer.fill(0);
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
      reject(new Error("Failed to open encrypted storage database"));
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

async function derive_storage_key_from_crypto_key(
  master_key: CryptoKey,
  purpose: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(`astermail_encrypted_storage_${purpose}`);

  const exported = await crypto.subtle.exportKey("raw", master_key);
  const key_bytes = new Uint8Array(exported);

  const key_material = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    "HKDF",
    false,
    ["deriveKey"],
  );

  secure_zero_memory(key_bytes);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info: encoder.encode("aes-gcm-key"),
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypted_set(
  key: string,
  value: unknown,
  encryption_key: CryptoKey,
): Promise<void> {
  const db = await open_database();
  const storage_key = await derive_storage_key_from_crypto_key(
    encryption_key,
    key,
  );

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(value));

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    storage_key,
    plaintext,
  );

  secure_zero_memory(plaintext);

  const entry: EncryptedEntry = {
    iv,
    ciphertext: new Uint8Array(encrypted_buffer),
    version: CURRENT_VERSION,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(entry, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to store encrypted data"));
  });
}

export async function encrypted_get<T>(
  key: string,
  decryption_key: CryptoKey,
): Promise<T | null> {
  const db = await open_database();
  const storage_key = await derive_storage_key_from_crypto_key(
    decryption_key,
    key,
  );

  const entry = await new Promise<EncryptedEntry | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () =>
      reject(new Error("Failed to retrieve encrypted data"));
  });

  if (!entry) {
    return null;
  }

  if (entry.version > CURRENT_VERSION) {
    throw new Error(
      "Data encrypted with newer version. Please update the application.",
    );
  }

  try {
    const decrypted_buffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: entry.iv },
      storage_key,
      entry.ciphertext,
    );

    const decoder = new TextDecoder();
    const json_string = decoder.decode(decrypted_buffer);
    const decrypted_bytes = new Uint8Array(decrypted_buffer);

    secure_zero_memory(decrypted_bytes);

    return JSON.parse(json_string) as T;
  } catch {
    return null;
  }
}

export async function encrypted_delete(key: string): Promise<void> {
  const db = await open_database();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error("Failed to delete encrypted data"));
  });
}

export async function encrypted_has(key: string): Promise<boolean> {
  const db = await open_database();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getKey(key);

    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(new Error("Failed to check encrypted data"));
  });
}

export async function encrypted_clear_all(): Promise<void> {
  const db = await open_database();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error("Failed to clear encrypted storage"));
  });
}

export async function encrypted_list_keys(): Promise<string[]> {
  const db = await open_database();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      const keys = request.result.filter(
        (k): k is string => typeof k === "string",
      );

      resolve(keys);
    };
    request.onerror = () =>
      reject(new Error("Failed to list encrypted storage keys"));
  });
}

export function close_database(): void {
  if (db_instance) {
    db_instance.close();
    db_instance = null;
    db_promise = null;
  }
}

export async function delete_database(): Promise<void> {
  close_database();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error("Failed to delete encrypted storage database"));
    request.onblocked = () => {
      resolve();
    };
  });
}

export async function secure_overwrite_and_delete(key: string): Promise<void> {
  const db = await open_database();

  const random_data: EncryptedEntry = {
    iv: crypto.getRandomValues(new Uint8Array(12)),
    ciphertext: crypto.getRandomValues(new Uint8Array(256)),
    version: 0,
    timestamp: 0,
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(random_data, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to overwrite data"));
  });

  await encrypted_delete(key);
}
