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
import { describe, it, expect, vi, afterEach } from "vitest";

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

describe("RequestCache skip_cache sharing", () => {
  const COUNTS_KEY = "GET:/mail/v1/labels/counts";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one request between fresh callers that start together", async () => {
    const cache = new RequestCache();
    const pending = deferred<{ unread: number }>();
    let calls = 0;
    const fetcher = () => {
      calls++;

      return pending.promise;
    };

    const callers = [1, 2, 3, 4, 5, 6].map(() =>
      cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true),
    );

    pending.resolve({ unread: 3 });

    const results = await Promise.all(callers);

    expect(calls).toBe(1);
    expect(results.every((r) => r.unread === 3)).toBe(true);
    expect(cache.pending_count).toBe(0);
  });

  it("starts a new request once the join window has passed", async () => {
    vi.useFakeTimers();

    const cache = new RequestCache();
    const slow = deferred<{ unread: number }>();

    const first = cache.get_or_fetch(
      COUNTS_KEY,
      () => slow.promise,
      15_000,
      true,
    );

    vi.advanceTimersByTime(300);

    const second = cache.get_or_fetch(
      COUNTS_KEY,
      async () => ({ unread: 1 }),
      15_000,
      true,
    );

    slow.resolve({ unread: 5 });

    expect((await second).unread).toBe(1);
    expect((await first).unread).toBe(5);
  });

  it("starts a new request after the shared one settles", async () => {
    const cache = new RequestCache();
    let calls = 0;
    const fetcher = async () => ({ unread: ++calls });

    const first = await cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    const second = await cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);

    expect(first.unread).toBe(1);
    expect(second.unread).toBe(2);
  });

  it("does not join a request that started before a mutation", async () => {
    const cache = new RequestCache();
    const before = deferred<{ unread: number }>();

    const stale = cache.get_or_fetch(
      COUNTS_KEY,
      () => before.promise,
      15_000,
      true,
    );

    cache.invalidate_for_mutation("/mail/v1/messages/abc/read");

    const after = cache.get_or_fetch(
      COUNTS_KEY,
      async () => ({ unread: 0 }),
      15_000,
      true,
    );

    before.resolve({ unread: 1 });

    expect((await after).unread).toBe(0);
    expect((await stale).unread).toBe(1);
  });

  it("does not join a request dropped by invalidation", async () => {
    const cache = new RequestCache();
    const before = deferred<{ unread: number }>();

    const stale = cache.get_or_fetch(
      COUNTS_KEY,
      () => before.promise,
      15_000,
      true,
    );

    cache.invalidate(COUNTS_KEY);

    const after = cache.get_or_fetch(
      COUNTS_KEY,
      async () => ({ unread: 0 }),
      15_000,
      true,
    );

    before.resolve({ unread: 1 });

    expect((await after).unread).toBe(0);
    expect((await stale).unread).toBe(1);

    const cached = await cache.get_or_fetch(COUNTS_KEY, async () => ({
      unread: 9,
    }));

    expect(cached.unread).toBe(0);
  });

  it("never shares when dedup is skipped", async () => {
    const cache = new RequestCache();
    let calls = 0;
    const fetcher = async () => ({ unread: ++calls });

    const results = await Promise.all([
      cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true, true),
      cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true, true),
    ]);

    expect(calls).toBe(2);
    expect(results.map((r) => r.unread).sort()).toEqual([1, 2]);
  });

  it("shares a rejection and clears the slot", async () => {
    const cache = new RequestCache();
    let calls = 0;
    const failing = () => {
      calls++;

      return Promise.reject(new Error("offline"));
    };

    const results = await Promise.allSettled([
      cache.get_or_fetch(COUNTS_KEY, failing, 15_000, true),
      cache.get_or_fetch(COUNTS_KEY, failing, 15_000, true),
    ]);

    expect(calls).toBe(1);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(cache.pending_count).toBe(0);
  });

  it("does not join a request that started before a sync event", async () => {
    const cache = new RequestCache();
    const before_event = deferred<{ unread: number }>();
    const after_event = deferred<{ unread: number }>();
    const queue = [before_event, after_event];
    let calls = 0;
    const fetcher = () => queue[calls++].promise;

    const early = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);

    cache.end_fresh_joins();
    const late = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    const later = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);

    before_event.resolve({ unread: 1 });
    after_event.resolve({ unread: 2 });

    expect(calls).toBe(2);
    expect((await early).unread).toBe(1);
    expect((await late).unread).toBe(2);
    expect((await later).unread).toBe(2);
    expect(cache.pending_count).toBe(0);
  });

  it("gives each joined caller its own copy of the response", async () => {
    const cache = new RequestCache();
    const pending = deferred<{ data: { items: string[] } }>();
    const fetcher = () => pending.promise;

    const first = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    const second = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    const third = cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);

    pending.resolve({ data: { items: ["a", "b"] } });

    const [one, two, three] = await Promise.all([first, second, third]);

    two.data.items.push("mutated");
    three.data.items.length = 0;

    expect(one.data.items).toEqual(["a", "b"]);
    expect(two.data.items).toEqual(["a", "b", "mutated"]);
    expect(three.data.items).toEqual([]);
    expect(two).not.toBe(one);
    expect(three).not.toBe(two);
  });

  it("drops every shared request when the account changes", async () => {
    const cache = new RequestCache();
    const pending = deferred<{ unread: number }>();
    let calls = 0;
    const fetcher = () => {
      calls++;

      return pending.promise;
    };

    void cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    cache.clear();
    void cache.get_or_fetch(COUNTS_KEY, fetcher, 15_000, true);
    pending.resolve({ unread: 1 });
    await pending.promise;
    await Promise.resolve();

    expect(calls).toBe(2);
  });
});
