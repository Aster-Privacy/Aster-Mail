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
import { describe, it, expect } from "vitest";

import { RequestCache } from "./request_cache";

const LIST_KEY = "GET:/mail/v1/messages";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("RequestCache invalidation", () => {
  it("does not cache a response that was already in flight when invalidation ran", async () => {
    const cache = new RequestCache();
    const stale = deferred<{ is_read: boolean }>();

    const in_flight = cache.get_or_fetch(LIST_KEY, () => stale.promise);

    cache.invalidate(LIST_KEY);
    stale.resolve({ is_read: false });

    await in_flight;

    const fresh = await cache.get_or_fetch(LIST_KEY, async () => ({
      is_read: true,
    }));

    expect(fresh.is_read).toBe(true);
  });

  it("gives a caller after invalidation a new request rather than the pending one", async () => {
    const cache = new RequestCache();
    const stale = deferred<{ is_read: boolean }>();

    const in_flight = cache.get_or_fetch(LIST_KEY, () => stale.promise);

    cache.invalidate(LIST_KEY);

    const after = cache.get_or_fetch(LIST_KEY, async () => ({ is_read: true }));

    stale.resolve({ is_read: false });

    expect((await after).is_read).toBe(true);
    expect((await in_flight).is_read).toBe(false);
  });

  it("leaves unrelated keys cached", async () => {
    const cache = new RequestCache();

    await cache.get_or_fetch("GET:/mail/v1/folders", async () => ({
      count: 1,
    }));

    cache.invalidate(LIST_KEY);

    const folders = await cache.get_or_fetch(
      "GET:/mail/v1/folders",
      async () => ({
        count: 2,
      }),
    );

    expect(folders.count).toBe(1);
  });
});

describe("RequestCache skip_cache", () => {
  it("does not join a request that was already in flight", async () => {
    const cache = new RequestCache();
    const stale = deferred<{ unread: number }>();

    const in_flight = cache.get_or_fetch(LIST_KEY, () => stale.promise);

    const fresh = cache.get_or_fetch(
      LIST_KEY,
      async () => ({ unread: 0 }),
      15_000,
      true,
    );

    stale.resolve({ unread: 7 });

    expect((await fresh).unread).toBe(0);
    expect((await in_flight).unread).toBe(7);
  });

  it("still stores its response for later cached readers", async () => {
    const cache = new RequestCache();

    await cache.get_or_fetch(
      LIST_KEY,
      async () => ({ unread: 0 }),
      15_000,
      true,
    );

    const cached = await cache.get_or_fetch(LIST_KEY, async () => ({
      unread: 9,
    }));

    expect(cached.unread).toBe(0);
  });
});
