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
interface StoreShape {
  key_path: string | null;
  records: Map<unknown, unknown>;
}

interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onupgradeneeded: ((event: unknown) => void) | null;
  onblocked: ((event: unknown) => void) | null;
  transaction: { abort: () => void } | null;
}

interface FakeTransaction {
  error: unknown;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: (name: string) => unknown;
}

interface FakeConnection {
  name: string;
  version: number;
  objectStoreNames: string[] & { contains: (name: string) => boolean };
  onversionchange: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  createObjectStore: (name: string, options?: { keyPath?: string }) => unknown;
  transaction: (names: string | string[], mode?: string) => FakeTransaction;
  close: () => void;
}

export interface VersionChangeIndexedDb {
  factory: IDBFactory;
  database_names: () => string[];
  open_connections: (name: string) => number;
  record_count: (name: string) => number;
  clear_calls: (name: string) => number;
}

function new_request(): FakeRequest {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
    transaction: null,
  };
}

export function replace_indexed_db(factory: IDBFactory): () => void {
  const target = globalThis as { indexedDB?: IDBFactory };
  const before = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

  if (!before || before.configurable) {
    Object.defineProperty(globalThis, "indexedDB", {
      value: factory,
      configurable: true,
      writable: true,
      enumerable: before?.enumerable ?? true,
    });

    return () => {
      if (before) {
        Object.defineProperty(globalThis, "indexedDB", before);
      } else {
        delete target.indexedDB;
      }
    };
  }

  if (!before.writable) {
    throw new Error("indexedDB cannot be replaced in this environment");
  }

  target.indexedDB = factory;

  return () => {
    target.indexedDB = before.value as IDBFactory;
  };
}

export function create_version_change_indexed_db(): VersionChangeIndexedDb {
  const databases = new Map<string, Map<string, StoreShape>>();
  const connections = new Map<string, Set<FakeConnection>>();
  const waiting_deletes = new Map<string, (() => void)[]>();
  const waiting_opens = new Map<string, (() => void)[]>();
  const clears = new Map<string, number>();

  const live = (name: string): Set<FakeConnection> => {
    let open = connections.get(name);

    if (!open) {
      open = new Set<FakeConnection>();
      connections.set(name, open);
    }

    return open;
  };

  const settle_deletes = (name: string): void => {
    if (live(name).size > 0) return;

    const waiting = waiting_deletes.get(name) ?? [];

    waiting_deletes.delete(name);
    for (const finish of waiting) finish();

    const opens = waiting_opens.get(name) ?? [];

    waiting_opens.delete(name);
    for (const resume of opens) resume();
  };

  const begin = (
    name: string,
    stores: Map<string, StoreShape>,
  ): FakeTransaction => {
    let pending = 0;
    let done = false;

    const transaction: FakeTransaction = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: () => undefined,
    };

    const step = (run: () => unknown): FakeRequest => {
      const request = new_request();

      pending += 1;
      queueMicrotask(() => {
        request.result = run();
        request.onsuccess?.({ target: request });
        pending -= 1;
        queueMicrotask(() => {
          if (pending > 0 || done) return;
          done = true;
          transaction.oncomplete?.();
        });
      });

      return request;
    };

    transaction.objectStore = (store_name: string) => {
      const shape = stores.get(store_name);

      if (!shape) throw new Error("NotFoundError");

      return {
        get: (key: unknown) => step(() => shape.records.get(key)),
        put: (value: unknown, key?: unknown) =>
          step(() => {
            const record_key = shape.key_path
              ? (value as Record<string, unknown>)[shape.key_path]
              : key;

            shape.records.set(record_key, value);

            return record_key;
          }),
        delete: (key: unknown) =>
          step(() => {
            shape.records.delete(key);

            return undefined;
          }),
        clear: () =>
          step(() => {
            clears.set(name, (clears.get(name) ?? 0) + 1);
            shape.records.clear();

            return undefined;
          }),
        getAllKeys: () => step(() => [...shape.records.keys()]),
        getAll: () => step(() => [...shape.records.values()]),
      };
    };

    return transaction;
  };

  const connect = (
    name: string,
    stores: Map<string, StoreShape>,
  ): FakeConnection => {
    let closed = false;

    const connection: FakeConnection = {
      name,
      version: 1,
      get objectStoreNames() {
        return Object.assign([...stores.keys()], {
          contains: (store: string) => stores.has(store),
        });
      },
      onversionchange: null,
      onclose: null,
      createObjectStore: (store, options) => {
        stores.set(store, {
          key_path: options?.keyPath ?? null,
          records: new Map<unknown, unknown>(),
        });

        return {};
      },
      transaction: () => {
        if (closed) throw new Error("InvalidStateError");

        return begin(name, stores);
      },
      close: () => {
        if (closed) return;
        closed = true;
        live(name).delete(connection);
        settle_deletes(name);
      },
    };

    live(name).add(connection);

    return connection;
  };

  const factory = {
    open: (name: string) => {
      const request = new_request();
      const run = (): void => {
        let stores = databases.get(name);
        const created = !stores;

        if (!stores) {
          stores = new Map<string, StoreShape>();
          databases.set(name, stores);
        }

        const connection = connect(name, stores);

        request.result = connection;
        if (created) {
          let aborted = false;

          request.transaction = {
            abort: () => {
              aborted = true;
            },
          };
          request.onupgradeneeded?.({ target: request, oldVersion: 0 });
          request.transaction = null;
          if (aborted) {
            databases.delete(name);
            connection.close();
            request.result = undefined;
            request.onerror?.({ target: request });

            return;
          }
        }
        request.onsuccess?.({ target: request });
      };

      queueMicrotask(() => {
        if (waiting_deletes.has(name)) {
          waiting_opens.set(name, [...(waiting_opens.get(name) ?? []), run]);

          return;
        }
        run();
      });

      return request;
    },
    deleteDatabase: (name: string) => {
      const request = new_request();
      const finish = (): void => {
        databases.delete(name);
        request.onsuccess?.({ target: request });
      };

      queueMicrotask(() => {
        for (const connection of [...live(name)]) {
          connection.onversionchange?.({ target: connection });
        }

        if (live(name).size === 0) {
          finish();

          return;
        }

        request.onblocked?.({ target: request });
        waiting_deletes.set(name, [
          ...(waiting_deletes.get(name) ?? []),
          finish,
        ]);
      });

      return request;
    },
    databases: async () =>
      [...databases.keys()].map((name) => ({ name, version: 1 })),
  };

  return {
    factory: factory as unknown as IDBFactory,
    database_names: () => [...databases.keys()],
    open_connections: (name: string) => live(name).size,
    record_count: (name: string) =>
      [...(databases.get(name)?.values() ?? [])].reduce(
        (total, shape) => total + shape.records.size,
        0,
      ),
    clear_calls: (name: string) => clears.get(name) ?? 0,
  };
}
