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
type Records = Map<string, unknown>;

interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onupgradeneeded: ((event: unknown) => void) | null;
  onblocked: ((event: unknown) => void) | null;
}

interface FakeTransaction {
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: (name: string) => unknown;
}

interface PendingStep {
  request: FakeRequest;
  run: (working: Map<string, Records>) => unknown;
}

interface QueuedTransaction {
  handle: FakeTransaction;
  steps: PendingStep[];
  writes: boolean;
  doomed: boolean;
}

export interface TransactionalIndexedDb {
  factory: IDBFactory;
  keys: (store_name: string) => string[];
  abort_next_write: () => void;
  write_commits: () => number;
  idle: () => Promise<void>;
}

function new_request(): FakeRequest {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
  };
}

function copy_stores(source: Map<string, Records>): Map<string, Records> {
  const copy = new Map<string, Records>();

  for (const [name, records] of source) copy.set(name, new Map(records));

  return copy;
}

export function create_transactional_indexed_db(): TransactionalIndexedDb {
  let committed = new Map<string, Records>();
  const queue: QueuedTransaction[] = [];
  let running = false;
  let abort_pending = false;
  let commits = 0;

  const next_task = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function drain(): Promise<void> {
    if (running) return;
    running = true;

    while (queue.length > 0) {
      const current = queue[0];
      const working = copy_stores(committed);

      await next_task();

      while (current.steps.length > 0) {
        const step = current.steps.shift() as PendingStep;

        step.request.result = step.run(working);
        step.request.onsuccess?.({ target: step.request });

        await next_task();
      }

      queue.shift();

      if (current.doomed) {
        current.handle.onabort?.();
        continue;
      }

      if (current.writes) {
        committed = working;
        commits += 1;
      }

      current.handle.oncomplete?.();
    }

    running = false;
  }

  function open_transaction(mode: string): FakeTransaction {
    const queued: QueuedTransaction = {
      handle: {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => undefined,
      },
      steps: [],
      writes: mode === "readwrite",
      doomed: mode === "readwrite" && abort_pending,
    };

    if (queued.doomed) abort_pending = false;

    const enqueue = (run: PendingStep["run"]): FakeRequest => {
      const request = new_request();

      queued.steps.push({ request, run });

      return request;
    };

    queued.handle.objectStore = (name: string) => {
      const records = (working: Map<string, Records>): Records => {
        let found = working.get(name);

        if (!found) {
          found = new Map();
          working.set(name, found);
        }

        return found;
      };

      return {
        get: (key: string) =>
          enqueue((working) => {
            const value = records(working).get(key);

            return value === undefined ? undefined : structuredClone(value);
          }),
        put: (value: unknown, key: string) =>
          enqueue((working) => {
            records(working).set(key, structuredClone(value));

            return key;
          }),
        delete: (key: string) =>
          enqueue((working) => {
            records(working).delete(key);

            return undefined;
          }),
        clear: () =>
          enqueue((working) => {
            records(working).clear();

            return undefined;
          }),
        getAllKeys: () => enqueue((working) => [...records(working).keys()]),
      };
    };

    queue.push(queued);
    void drain();

    return queued.handle;
  }

  const database = {
    onclose: null,
    objectStoreNames: {
      contains: (name: string) => committed.has(name),
    },
    createObjectStore: (name: string) => {
      if (!committed.has(name)) committed.set(name, new Map());
    },
    transaction: (_stores: string | string[], mode: string = "readonly") =>
      open_transaction(mode),
    close: () => undefined,
  };

  const factory = {
    open: () => {
      const request = new_request();

      setTimeout(() => {
        request.result = database;
        request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      }, 0);

      return request;
    },
    deleteDatabase: () => {
      const request = new_request();

      setTimeout(() => {
        committed = new Map();
        request.onsuccess?.({ target: request });
      }, 0);

      return request;
    },
  };

  return {
    factory: factory as unknown as IDBFactory,
    keys: (store_name: string) => [
      ...(committed.get(store_name)?.keys() ?? []),
    ],
    abort_next_write: () => {
      abort_pending = true;
    },
    write_commits: () => commits,
    idle: async () => {
      do {
        await next_task();
      } while (running || queue.length > 0);
    },
  };
}
