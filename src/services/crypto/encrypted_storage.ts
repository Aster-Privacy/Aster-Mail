import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { HASH_ALG } from "@/services/crypto/constants";
import {
  decrypt_aes_gcm_with_fallback,
  decrypt_with_legacy_derived_keys,
} from "@/services/crypto/legacy_keks";
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
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
const PARSE_YIELD_BYTES = 256 * 1024;

let db_instance: IDBDatabase | null = null;
let db_promise: Promise<IDBDatabase> | null = null;

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

async function derive_storage_key_from_hkdf_key(
  key_material: CryptoKey,
  purpose: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: encoder.encode(`astermail_encrypted_storage_${purpose}`),
      info: encoder.encode("aes-gcm-key"),
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decrypt_entry_with_legacy_storage_keys(
  purpose: string,
  ciphertext: BufferSource,
  iv: BufferSource,
): Promise<ArrayBuffer | null> {
  return decrypt_with_legacy_derived_keys(
    (base) => derive_storage_key_from_hkdf_key(base, purpose),
    ciphertext,
    iv,
  );
}

async function derive_storage_key_from_crypto_key(
  _master_key: CryptoKey,
  purpose: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(`astermail_encrypted_storage_${purpose}`);

  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) {
    throw new Error("No encryption key available");
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    "HKDF",
    false,
    ["deriveKey"],
  );

  zero_uint8_array(key_bytes);

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

async function seal_entry(
  key: string,
  value: unknown,
  encryption_key: CryptoKey,
  timestamp: number = Date.now(),
): Promise<EncryptedEntry> {
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

  zero_uint8_array(plaintext);

  return {
    iv,
    ciphertext: new Uint8Array(encrypted_buffer),
    version: CURRENT_VERSION,
    timestamp,
  };
}

async function read_raw_entry(key: string): Promise<EncryptedEntry | null> {
  const db = await open_database();

  return new Promise<EncryptedEntry | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () =>
      reject(new Error("Failed to retrieve encrypted data"));
  });
}

async function open_entry<T>(
  key: string,
  entry: EncryptedEntry,
  decryption_key: CryptoKey,
): Promise<T | null> {
  if (entry.version > CURRENT_VERSION) {
    throw new Error(
      "Data encrypted with newer version. Please update the application.",
    );
  }

  const storage_key = await derive_storage_key_from_crypto_key(
    decryption_key,
    key,
  );

  try {
    let decrypted_buffer: ArrayBuffer;

    try {
      decrypted_buffer = await decrypt_aes_gcm_with_fallback(
        storage_key,
        entry.ciphertext,
        entry.iv,
      );
    } catch (primary_error) {
      const recovered = await decrypt_entry_with_legacy_storage_keys(
        key,
        entry.ciphertext,
        entry.iv,
      );

      if (!recovered) {
        throw primary_error;
      }

      decrypted_buffer = recovered;
    }

    const decoder = new TextDecoder();
    const json_string = decoder.decode(decrypted_buffer);
    const decrypted_bytes = new Uint8Array(decrypted_buffer);

    zero_uint8_array(decrypted_bytes);

    if (decrypted_bytes.length >= PARSE_YIELD_BYTES) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    return JSON.parse(json_string) as T;
  } catch {
    return null;
  }
}

export async function encrypted_set(
  key: string,
  value: unknown,
  encryption_key: CryptoKey,
): Promise<void> {
  const db = await open_database();
  const entry = await seal_entry(key, value, encryption_key);

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
  const db_entry = await read_raw_entry(key);

  if (!db_entry) {
    return null;
  }

  return open_entry<T>(key, db_entry, decryption_key);
}

export async function encrypted_has(key: string): Promise<boolean> {
  return (await read_raw_entry(key)) !== null;
}

function same_stored_entry(a: EncryptedEntry, b: EncryptedEntry): boolean {
  if (a.timestamp !== b.timestamp) return false;
  if (a.iv.length !== b.iv.length) return false;

  for (let i = 0; i < a.iv.length; i++) {
    if (a.iv[i] !== b.iv[i]) return false;
  }

  return true;
}

export type EncryptedMoveOutcome =
  "moved" | "missing" | "unreadable" | "kept_existing";

const MOVE_ATTEMPTS = 3;

type MoveStep = EncryptedMoveOutcome | "changed";

export async function encrypted_move(
  from_key: string,
  to_key: string,
  encryption_key: CryptoKey,
): Promise<EncryptedMoveOutcome> {
  if (from_key === to_key) return "kept_existing";

  const db = await open_database();

  for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
    const source = await read_raw_entry(from_key);

    if (!source) return "missing";

    const value = await open_entry<unknown>(from_key, source, encryption_key);

    if (value === null) return "unreadable";

    const sealed = await seal_entry(
      to_key,
      value,
      encryption_key,
      source.timestamp,
    );

    const step = await new Promise<MoveStep>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let result: MoveStep = "changed";

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () =>
        reject(new Error("Failed to move encrypted data"));
      transaction.onabort = () =>
        reject(new Error("Failed to move encrypted data"));

      const source_request = store.get(from_key);

      source_request.onsuccess = () => {
        const live_source = source_request.result as EncryptedEntry | undefined;

        if (!live_source) {
          result = "missing";

          return;
        }

        if (!same_stored_entry(live_source, source)) {
          result = "changed";

          return;
        }

        const target_request = store.get(to_key);

        target_request.onsuccess = () => {
          const target = target_request.result as EncryptedEntry | undefined;

          if (target && target.timestamp >= live_source.timestamp) {
            result = "kept_existing";
          } else {
            store.put(sealed, to_key);
            result = "moved";
          }

          store.delete(from_key);
        };
      };
    });

    if (step !== "changed") return step;
  }

  return "unreadable";
}

export async function encrypted_set_if_absent(
  key: string,
  value: unknown,
  encryption_key: CryptoKey,
): Promise<boolean> {
  const db = await open_database();
  const entry = await seal_entry(key, value, encryption_key);

  return new Promise<boolean>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    let stored = false;

    transaction.oncomplete = () => resolve(stored);
    transaction.onerror = () =>
      reject(new Error("Failed to store encrypted data"));
    transaction.onabort = () =>
      reject(new Error("Failed to store encrypted data"));

    const existing = store.get(key);

    existing.onsuccess = () => {
      if (existing.result) return;

      store.put(entry, key);
      stored = true;
    };
  });
}

export async function encrypted_delete_where(
  matches: (key: string) => boolean,
): Promise<number> {
  const db = await open_database();

  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    let removed = 0;

    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () =>
      reject(new Error("Failed to delete encrypted data"));
    transaction.onabort = () =>
      reject(new Error("Failed to delete encrypted data"));

    const request = store.getAllKeys();

    request.onsuccess = () => {
      for (const key of request.result) {
        if (typeof key !== "string" || !matches(key)) continue;

        store.delete(key);
        removed += 1;
      }
    };
  });
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
