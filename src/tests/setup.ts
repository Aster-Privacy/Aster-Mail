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
import { afterEach, beforeEach, vi } from "vitest";

const subtle_crypto_mock = {
  generateKey: vi.fn(),
  importKey: vi.fn(),
  exportKey: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  sign: vi.fn(),
  verify: vi.fn(),
  digest: vi.fn(),
  deriveBits: vi.fn(),
  deriveKey: vi.fn(),
};

const crypto_mock = {
  subtle: subtle_crypto_mock,
  getRandomValues: <T extends ArrayBufferView>(array: T): T => {
    if (array instanceof Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }

    return array;
  },
  randomUUID: () => crypto.randomUUID(),
};

if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: crypto_mock,
    writable: true,
  });
}

if (typeof globalThis.indexedDB === "undefined") {
  const stores = new Map<string, Map<string, unknown>>();

  const mock_idb_request = (result: unknown, error: unknown = null) => ({
    result,
    error,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: Event) => void) | null,
    onblocked: null as ((event: Event) => void) | null,
    readyState: "done" as IDBRequestReadyState,
    source: null,
    transaction: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  });

  const mock_object_store = (name: string) => {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const store = stores.get(name)!;

    return {
      name,
      keyPath: null,
      indexNames: [],
      autoIncrement: false,
      transaction: null,
      add: vi.fn((value, key) => {
        store.set(key, value);
        const request = mock_idb_request(key);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      put: vi.fn((value, key) => {
        store.set(key, value);
        const request = mock_idb_request(key);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      get: vi.fn((key) => {
        const value = store.get(key);
        const request = mock_idb_request(value);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      getKey: vi.fn((key) => {
        const exists = store.has(key);
        const request = mock_idb_request(exists ? key : undefined);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      getAll: vi.fn(() => {
        const values = Array.from(store.values());
        const request = mock_idb_request(values);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      getAllKeys: vi.fn(() => {
        const keys = Array.from(store.keys());
        const request = mock_idb_request(keys);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      delete: vi.fn((key) => {
        store.delete(key);
        const request = mock_idb_request(undefined);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      clear: vi.fn(() => {
        store.clear();
        const request = mock_idb_request(undefined);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      count: vi.fn(() => {
        const request = mock_idb_request(store.size);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      createIndex: vi.fn(),
      deleteIndex: vi.fn(),
      index: vi.fn(),
      openCursor: vi.fn(),
      openKeyCursor: vi.fn(),
    };
  };

  const mock_transaction = (store_names: string[]) => ({
    objectStoreNames: store_names,
    mode: "readwrite",
    db: null,
    durability: "default",
    error: null,
    onabort: null,
    oncomplete: null,
    onerror: null,
    objectStore: vi.fn((name: string) => mock_object_store(name)),
    abort: vi.fn(),
    commit: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  });

  const mock_database = {
    name: "astermail_secure_db",
    version: 1,
    objectStoreNames: ["encrypted_data"],
    onabort: null,
    onclose: null,
    onerror: null,
    onversionchange: null,
    close: vi.fn(),
    createObjectStore: vi.fn((name: string) => mock_object_store(name)),
    deleteObjectStore: vi.fn(),
    transaction: vi.fn((names: string | string[]) =>
      mock_transaction(Array.isArray(names) ? names : [names]),
    ),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };

  Object.defineProperty(globalThis, "indexedDB", {
    value: {
      open: vi.fn((_name: string, _version?: number) => {
        const request = mock_idb_request(mock_database);

        setTimeout(() => {
          if (request.onupgradeneeded) {
            request.onupgradeneeded({
              target: { result: mock_database },
            } as unknown as Event);
          }
          request.onsuccess?.({ target: request } as unknown as Event);
        }, 0);

        return request;
      }),
      deleteDatabase: vi.fn((_name: string) => {
        stores.clear();
        const request = mock_idb_request(undefined);

        setTimeout(
          () => request.onsuccess?.({ target: request } as unknown as Event),
          0,
        );

        return request;
      }),
      cmp: vi.fn(),
      databases: vi.fn(() => Promise.resolve([])),
    },
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

export { crypto_mock, subtle_crypto_mock };
