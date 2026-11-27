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


import type { CategoryIndexEntry } from "@/services/category_index";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ASYNC_DERIVE_MIN_ENTRIES,
  clear_category_index_memory,
  flush_pending_notify,
  get_category_total,
  get_counts,
  get_page_ids,
  get_version,
  subscribe,
  upsert_entries,
  wait_for_derived,
} from "@/services/category_index";

const LONG_TASK_MS = 50;
const BASE_TS = Date.parse("2026-01-01T00:00:00.000Z");

interface TaskMeter {
  longest(): number;
  stop(): void;
}

function entry(index: number, is_read: boolean): CategoryIndexEntry {
  return {
    id: `m${index}`,
    thread_token: index % 3 === 0 ? `t${Math.floor(index / 6)}` : undefined,
    message_ts: new Date(BASE_TS + index * 60_000).toISOString(),
    is_read,
    category: index % 4 === 0 ? "promotions" : "primary",
  };
}

function arrival(index: number): CategoryIndexEntry {
  return {
    id: `m${index}`,
    thread_token: undefined,
    message_ts: new Date(BASE_TS + index * 60_000).toISOString(),
    is_read: false,
    category: "primary",
  };
}

function start_task_meter(): TaskMeter {
  const holder = globalThis as { scheduler?: { yield: () => Promise<void> } };
  const previous = holder.scheduler;
  let slice_started_at = performance.now();
  let longest = 0;
  const close_slice = () => {
    longest = Math.max(longest, performance.now() - slice_started_at);
  };

  holder.scheduler = {
    yield: () => {
      close_slice();

      return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(
        () => {
          slice_started_at = performance.now();
        },
      );
    },
  };

  return {
    longest: () => {
      close_slice();

      return longest;
    },
    stop: () => {
      holder.scheduler = previous;
    },
  };
}

describe("category_index work on a tab return", () => {
  let meter: TaskMeter | null = null;

  beforeEach(() => {
    clear_category_index_memory();
  });

  afterEach(() => {
    meter?.stop();
    meter = null;
    clear_category_index_memory();
  });

  it.each([600, 20_000, 60_000])(
    "keeps every main-thread task under 50 ms with %i indexed messages",
    async (size) => {
      upsert_entries(
        Array.from({ length: size }, (_, index) => entry(index, index % 5 !== 0)),
      );
      flush_pending_notify();
      await wait_for_derived();
      get_counts();
      get_page_ids("primary", 0, 50);

      const before_version = get_version();
      const renders: number[] = [];
      const unsubscribe = subscribe(() => {
        get_counts();
        get_page_ids("primary", 0, 50);
        renders.push(get_version());
      });

      try {
        meter = start_task_meter();

        const arrivals = Array.from({ length: 40 }, (_, offset) =>
          arrival(size + offset),
        );
        const read_changes = Array.from({ length: 200 }, (_, offset) =>
          entry(offset * 2 + 1, true),
        );

        upsert_entries([...arrivals, ...read_changes]);
        flush_pending_notify();
        await wait_for_derived();

        expect(meter.longest()).toBeLessThan(LONG_TASK_MS);
      } finally {
        unsubscribe();
      }

      expect(renders.length).toBeGreaterThan(0);
      expect(get_version()).toBeGreaterThan(before_version);
      expect(get_category_total("primary")).toBeGreaterThan(0);

      const page = get_page_ids("primary", 0, 200);
      const order = page.map((id) => Number(id.slice(1)));

      expect(page[0]).toBe(`m${size + 39}`);
      expect(order).toEqual([...order].sort((a, b) => b - a));
    },
    30_000,
  );

  it("builds the first result after load in slices with 60000 messages", async () => {
    const size = 60_000;
    let notified = 0;
    const unsubscribe = subscribe(() => {
      notified += 1;
      get_counts();
      get_page_ids("primary", 0, 50);
    });

    try {
      upsert_entries(
        Array.from({ length: size }, (_, index) => entry(index, index % 5 !== 0)),
      );
      meter = start_task_meter();
      flush_pending_notify();
      await wait_for_derived();

      expect(meter.longest()).toBeLessThan(LONG_TASK_MS);
    } finally {
      unsubscribe();
    }

    expect(notified).toBeGreaterThan(0);
    expect(get_category_total("primary")).toBeGreaterThan(0);
    expect(get_page_ids("primary", 0, 1)).toEqual([`m${size - 1}`]);
  }, 30_000);

  it("serves the previous result until the sliced derive commits", async () => {
    const size = ASYNC_DERIVE_MIN_ENTRIES * 2;

    upsert_entries(
      Array.from({ length: size }, (_, index) => entry(index, true)),
    );
    flush_pending_notify();
    await wait_for_derived();

    const committed_version = get_version();
    const newest_before = get_page_ids("primary", 0, 1);
    let listener_saw: string[] = [];
    const unsubscribe = subscribe(() => {
      listener_saw = get_page_ids("primary", 0, 1);
    });

    try {
      upsert_entries([arrival(size + 1)]);
      flush_pending_notify();

      expect(get_page_ids("primary", 0, 1)).toEqual(newest_before);

      await wait_for_derived();
    } finally {
      unsubscribe();
    }

    expect(get_version()).toBeGreaterThan(committed_version);
    expect(listener_saw).toEqual([`m${size + 1}`]);
    expect(get_page_ids("primary", 0, 1)).toEqual([`m${size + 1}`]);
  });
});
