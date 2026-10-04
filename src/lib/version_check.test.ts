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

import { MODEL_CACHE_NAME } from "@/services/translation/model_source";

const STALE_APP_CACHES = ["aster_push_strings", "aster-runtime-assets"];

let cache_names: Set<string>;
let deleted: string[];
let reloads: number;

beforeEach(() => {
  cache_names = new Set([MODEL_CACHE_NAME, ...STALE_APP_CACHES]);
  deleted = [];
  reloads = 0;

  vi.stubGlobal("caches", {
    keys: vi.fn(async () => [...cache_names]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);

      return cache_names.delete(name);
    }),
  });
  vi.spyOn(window.location, "reload").mockImplementation(() => {
    reloads += 1;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("hard_flush_and_reload", () => {
  it("keeps downloaded translation models when a new build is loaded", async () => {
    vi.resetModules();
    const { hard_flush_and_reload } = await import("./version_check");

    await hard_flush_and_reload();

    expect(reloads).toBe(1);
    expect(cache_names.has(MODEL_CACHE_NAME)).toBe(true);
    expect([...deleted].sort()).toEqual([...STALE_APP_CACHES].sort());
  });
});
