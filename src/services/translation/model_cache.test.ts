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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cached_bytes,
  cached_packs,
  clear_model_cache,
  pack_cached,
  remove_pack,
} from "./model_cache";
import { join_url, model_base, reset_registry_cache } from "./model_source";

const REGISTRY = {
  deen: {
    model: { name: "model.deen.bin", size: 17000000, expectedSha256Hash: "a" },
    vocab: { name: "vocab.deen.spm", size: 6000000, expectedSha256Hash: "b" },
  },
  enfr: {
    model: { name: "model.enfr.bin", size: 20000000, expectedSha256Hash: "c" },
    vocab: { name: "vocab.enfr.spm", size: 5900000, expectedSha256Hash: "d" },
  },
};

class FakeCache {
  entries = new Map<string, Response>();

  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url);
  }

  async put(url: string, response: Response): Promise<void> {
    this.entries.set(url, response);
  }

  async delete(url: string): Promise<boolean> {
    return this.entries.delete(url);
  }
}

let cache: FakeCache;

function model_url(name: string): string {
  return join_url(model_base(), name);
}

async function store(...names: string[]): Promise<void> {
  for (const name of names) {
    await cache.put(model_url(name), new Response("x"));
  }
}

beforeEach(() => {
  reset_registry_cache();
  cache = new FakeCache();

  vi.stubGlobal("caches", {
    open: async () => cache,
    delete: async () => {
      cache = new FakeCache();

      return true;
    },
  });

  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify(REGISTRY), {
        headers: { "content-type": "application/json" },
      }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  reset_registry_cache();
});

describe("pack_cached", () => {
  it("reports a pack as absent when nothing is stored", async () => {
    expect(await pack_cached("deen")).toBe(false);
  });

  it("reports a pack as absent when only some of its files are stored", async () => {
    await store("model.deen.bin");

    expect(await pack_cached("deen")).toBe(false);
  });

  it("reports a pack as present once every file is stored", async () => {
    await store("model.deen.bin", "vocab.deen.spm");

    expect(await pack_cached("deen")).toBe(true);
  });

  it("reports an unknown pack as absent", async () => {
    expect(await pack_cached("enja")).toBe(false);
  });
});

describe("cached_packs", () => {
  it("lists only complete packs, with their sizes", async () => {
    await store("model.deen.bin", "vocab.deen.spm", "model.enfr.bin");

    expect(await cached_packs()).toEqual([
      { pair: "deen", from: "de", to: "en", bytes: 23000000 },
    ]);
    expect(await cached_bytes()).toBe(23000000);
  });

  it("totals every complete pack", async () => {
    await store(
      "model.deen.bin",
      "vocab.deen.spm",
      "model.enfr.bin",
      "vocab.enfr.spm",
    );

    expect(await cached_bytes()).toBe(48900000);
  });
});

describe("removing packs", () => {
  it("removes one pack and leaves the rest alone", async () => {
    await store(
      "model.deen.bin",
      "vocab.deen.spm",
      "model.enfr.bin",
      "vocab.enfr.spm",
    );

    await remove_pack("deen");

    expect(await pack_cached("deen")).toBe(false);
    expect(await pack_cached("enfr")).toBe(true);
  });

  it("removes every pack at once", async () => {
    await store(
      "model.deen.bin",
      "vocab.deen.spm",
      "model.enfr.bin",
      "vocab.enfr.spm",
    );

    await clear_model_cache();

    expect(await cached_packs()).toEqual([]);
  });
});

describe("without cache storage", () => {
  it("reports nothing stored rather than failing", async () => {
    vi.stubGlobal("caches", undefined);

    expect(await pack_cached("deen")).toBe(false);
    expect(await cached_packs()).toEqual([]);
    await expect(remove_pack("deen")).resolves.toBeUndefined();
    await expect(clear_model_cache()).resolves.toBeUndefined();
  });
});
