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
import type { ProxiedImageResult } from "@/lib/image_proxy_grant";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_CACHE_DB_NAME,
  IMAGE_CACHE_TTL_MS,
  MAX_IMAGE_CACHE_BYTES,
  clear_remote_image_cache,
  configure_image_cache,
  create_cached_image_loader,
  image_cache_usage,
  is_image_cache_enabled,
  is_image_prefetch_enabled,
  reset_image_cache_for_tests,
  set_image_cache_enabled,
  set_image_prefetch_enabled,
} from "@/lib/remote_image_cache";

type Row = Record<string, unknown>;

interface StoreData {
  key_path: string;
  rows: Map<string, Row>;
  indexes: Map<string, string>;
}

class FakeRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}

const databases = new Map<string, Map<string, StoreData>>();

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
  private pending = 0;
  private finished = false;

  constructor(private stores: Map<string, StoreData>) {
    this.schedule_check();
  }

  objectStore(name: string): FakeStore {
    const data = this.stores.get(name);

    if (!data) throw new Error(`no store ${name}`);

    return new FakeStore(data, this);
  }

  run<T>(work: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>();

    this.pending += 1;
    setTimeout(() => {
      request.result = work();
      request.onsuccess?.();
      this.pending -= 1;
      this.schedule_check();
    }, 0);

    return request;
  }

  private schedule_check(): void {
    setTimeout(() => {
      if (this.finished || this.pending > 0) return;
      this.finished = true;
      this.oncomplete?.();
    }, 0);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class FakeIndex {
  constructor(
    private data: StoreData,
    private field: string,
    private tx: FakeTransaction,
  ) {}

  private matching(range?: { only: unknown }): Row[] {
    const rows = Array.from(this.data.rows.values()).filter(
      (row) => range === undefined || row[this.field] === range.only,
    );

    return rows.sort(
      (a, b) => (a[this.field] as number) - (b[this.field] as number),
    );
  }

  getAll(range?: { only: unknown }) {
    return this.tx.run(() => this.matching(range).map(clone));
  }

  getAllKeys(range?: { only: unknown }) {
    return this.tx.run(() =>
      this.matching(range).map((row) => row[this.data.key_path]),
    );
  }
}

class FakeStore {
  constructor(
    private data: StoreData,
    private tx: FakeTransaction,
  ) {}

  createIndex(name: string, field: string): void {
    this.data.indexes.set(name, field);
  }

  index(name: string): FakeIndex {
    return new FakeIndex(this.data, this.data.indexes.get(name)!, this.tx);
  }

  get(key: string) {
    return this.tx.run(() => {
      const row = this.data.rows.get(key);

      return row ? clone(row) : undefined;
    });
  }

  getAll() {
    return this.tx.run(() => Array.from(this.data.rows.values()).map(clone));
  }

  put(value: Row) {
    return this.tx.run(() => {
      this.data.rows.set(value[this.data.key_path] as string, clone(value));

      return undefined;
    });
  }

  delete(key: string) {
    return this.tx.run(() => {
      this.data.rows.delete(key);

      return undefined;
    });
  }
}

function install_fake_indexed_db(): void {
  const factory = {
    open(name: string) {
      const request = new FakeRequest<unknown>();

      setTimeout(() => {
        let stores = databases.get(name);
        const fresh = !stores;

        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }
        const db = {
          objectStoreNames: {
            contains: (store: string) => stores!.has(store),
          },
          createObjectStore(store: string, options: { keyPath: string }) {
            const data: StoreData = {
              key_path: options.keyPath,
              rows: new Map(),
              indexes: new Map(),
            };

            stores!.set(store, data);

            return new FakeStore(data, new FakeTransaction(stores!));
          },
          transaction: () => new FakeTransaction(stores!),
          close() {},
          onversionchange: null,
        };

        request.result = db;
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);

      return request;
    },
    deleteDatabase(name: string) {
      const request = new FakeRequest<undefined>();

      setTimeout(() => {
        databases.delete(name);
        request.onsuccess?.();
      }, 0);

      return request;
    },
  };

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = factory;
  (globalThis as unknown as { IDBKeyRange: unknown }).IDBKeyRange = {
    only: (value: unknown) => ({ only: value }),
  };
}

function blob_rows(): Row[] {
  const stores = databases.get(IMAGE_CACHE_DB_NAME);

  return stores ? Array.from(stores.get("blobs")!.rows.values()) : [];
}

function entry_rows(): Row[] {
  const stores = databases.get(IMAGE_CACHE_DB_NAME);

  return stores ? Array.from(stores.get("entries")!.rows.values()) : [];
}

let account: string | null = "acct-a";
let clock = 1_800_000_000_000;
let persist = true;
let unseal_fails = false;

function image(size: number, fill = 7): ProxiedImageResult {
  return {
    kind: "image",
    content_type: "image/png",
    bytes: new Uint8Array(size).fill(fill),
  };
}

function make_fetcher(result: () => ProxiedImageResult) {
  return vi.fn(async () => result());
}

beforeEach(async () => {
  databases.clear();
  localStorage.clear();
  install_fake_indexed_db();
  await reset_image_cache_for_tests();
  account = "acct-a";
  clock = 1_800_000_000_000;
  persist = true;
  unseal_fails = false;
  configure_image_cache({
    get_account_id: async () => account,
    seal: async (plain) => `sealed:${plain}`,
    unseal: async (sealed) => {
      if (unseal_fails) throw new Error("wrong key");

      return sealed.slice("sealed:".length);
    },
    may_persist: async () => persist,
    now: () => clock,
  });
});

afterEach(async () => {
  await reset_image_cache_for_tests();
});

describe("remote image cache", () => {
  it("serves a re-open from the cache without any network request", async () => {
    const fetcher = make_fetcher(() => image(32));
    const load = create_cached_image_loader(fetcher);

    const first = await load("https://cdn.example/a.png", {});
    const second = await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("keeps the url and the image bytes out of storage", async () => {
    const url = "https://cdn.example/secret-name.png";
    const load = create_cached_image_loader(make_fetcher(() => image(64, 0x41)));

    await load(url, {});

    const [entry] = entry_rows();
    const [blob] = blob_rows();
    const plain_digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(JSON.stringify(entry)).not.toContain("secret-name");
    expect(entry.name).not.toBe(plain_digest);
    expect(entry.name).toMatch(/^[0-9a-f]{64}$/);

    const stored = new Uint8Array(blob.data as ArrayBuffer);

    expect(stored.length).toBeGreaterThan(64);
    expect(Array.from(stored).filter((b) => b === 0x41).length).toBeLessThan(
      16,
    );
  });

  it("does not store or read anything when the setting is off", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    expect(entry_rows()).toHaveLength(1);

    await set_image_cache_enabled(false);

    expect(is_image_cache_enabled()).toBe(false);
    expect(databases.has(IMAGE_CACHE_DB_NAME)).toBe(false);

    await load("https://cdn.example/a.png", {});
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(entry_rows()).toHaveLength(0);
  });

  it("turning the cache off also turns prefetch off", async () => {
    set_image_prefetch_enabled(true);
    expect(is_image_prefetch_enabled()).toBe(true);

    await set_image_cache_enabled(false);

    expect(is_image_prefetch_enabled()).toBe(false);
    await set_image_cache_enabled(true);
    expect(is_image_prefetch_enabled()).toBe(false);
  });

  it("keeps each account's images separate", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    account = "acct-b";
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(2);

    const names = entry_rows().map((row) => row.name);

    expect(new Set(names).size).toBe(2);

    await clear_remote_image_cache("acct-a");

    expect(entry_rows().map((row) => row.account)).toEqual(["acct-b"]);
  });

  it("treats a tampered entry as a miss and drops it", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});

    const [blob] = blob_rows();
    const data = new Uint8Array(blob.data as ArrayBuffer);

    data[3] ^= 0xff;
    blob.data = data.buffer;

    const again = await load("https://cdn.example/a.png", {});

    expect(again.kind).toBe("image");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("expires entries after the time limit", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    clock += IMAGE_CACHE_TTL_MS + 1;
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used images past the size limit", async () => {
    const size = 4 * 1024 * 1024;
    const load = create_cached_image_loader(make_fetcher(() => image(size)));

    for (let index = 0; index < 18; index += 1) {
      clock += 1000;
      await load(`https://cdn.example/${index}.png`, {});
    }

    const usage = await image_cache_usage();

    expect(usage.bytes).toBeLessThanOrEqual(MAX_IMAGE_CACHE_BYTES);
    expect(usage.entries).toBeLessThan(18);

    const fetcher = make_fetcher(() => image(size));
    const probe = create_cached_image_loader(fetcher);

    await probe("https://cdn.example/17.png", {});
    expect(fetcher).toHaveBeenCalledTimes(0);
    await probe("https://cdn.example/0.png", {});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never stores failures, oversized images or unknown types", async () => {
    const results: ProxiedImageResult[] = [
      { kind: "failed", retryable: true },
      { kind: "fallback" },
      image(5 * 1024 * 1024 + 1),
      { kind: "image", content_type: "text/html", bytes: new Uint8Array(8) },
    ];

    for (const [index, result] of results.entries()) {
      const load = create_cached_image_loader(make_fetcher(() => result));

      await load(`https://cdn.example/${index}`, {});
    }

    expect(entry_rows()).toHaveLength(0);
  });

  it("stores nothing while the app lock keeps data server wrapped", async () => {
    persist = false;

    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(entry_rows()).toHaveLength(0);
  });

  it("drops old entries when the device key can no longer open the secret", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    expect(entry_rows()).toHaveLength(1);

    await reset_image_cache_for_tests();
    unseal_fails = true;
    configure_image_cache({
      get_account_id: async () => account,
      seal: async (plain) => `sealed:${plain}`,
      unseal: async () => {
        throw new Error("wrong key");
      },
      may_persist: async () => true,
      now: () => clock,
    });

    await load("https://cdn.example/a.png", {});
    await load("https://cdn.example/a.png", {});
    expect(entry_rows()).toHaveLength(1);
    clock += 1000;
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(entry_rows()).toHaveLength(1);
    expect(entry_rows()[0].stored_at).toBe(clock);
  });

  it("keeps saved images through a single failed unseal", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    await reset_image_cache_for_tests();

    let fail_once = true;

    configure_image_cache({
      get_account_id: async () => account,
      seal: async (plain) => `sealed:${plain}`,
      unseal: async (sealed) => {
        if (fail_once) {
          fail_once = false;
          throw new Error("not ready");
        }

        return sealed.slice("sealed:".length);
      },
      may_persist: async () => true,
      now: () => clock,
    });

    await load("https://cdn.example/a.png", {});
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(entry_rows()).toHaveLength(1);
  });

  it("removes saved images once the app lock becomes server wrapped", async () => {
    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});
    expect(entry_rows()).toHaveLength(1);

    persist = false;
    await load("https://cdn.example/a.png", {});

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(entry_rows()).toHaveLength(0);
  });

  it("stores nothing when the cache is cleared while a fetch is in flight", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = create_cached_image_loader(async () => {
      await gate;

      return image(16);
    });
    const pending = load("https://cdn.example/a.png", {});

    await new Promise((resolve) => setTimeout(resolve, 0));
    await clear_remote_image_cache("acct-a");
    release();
    await pending;

    expect(entry_rows()).toHaveLength(0);
  });

  it("never saves an image under an account switched to mid-fetch", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = create_cached_image_loader(async () => {
      await gate;

      return image(16);
    });
    const pending = load("https://cdn.example/a.png", {});

    await new Promise((resolve) => setTimeout(resolve, 0));
    account = "acct-b";
    release();
    await pending;

    expect(entry_rows()).toHaveLength(0);
  });

  it("does nothing without a signed-in account", async () => {
    account = null;

    const fetcher = make_fetcher(() => image(16));
    const load = create_cached_image_loader(fetcher);

    await load("https://cdn.example/a.png", {});

    expect(entry_rows()).toHaveLength(0);
  });

  it("clears every account on a full clear", async () => {
    const load = create_cached_image_loader(make_fetcher(() => image(16)));

    await load("https://cdn.example/a.png", {});
    await clear_remote_image_cache();

    expect(databases.has(IMAGE_CACHE_DB_NAME)).toBe(false);
  });
});
