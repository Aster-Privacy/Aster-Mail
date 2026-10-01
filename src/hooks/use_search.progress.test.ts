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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/hooks/use_search/index_cache", () => ({
  build_search_index: vi.fn(async () => null),
  cached_index: null,
  schedule_deep_index: vi.fn(),
}));

import {
  MAX_ACTIVE_PERCENT,
  PROGRESS_PUBLISH_INTERVAL_MS,
  advance_counts,
  has_known_total,
  mailbox_index_total,
  progress_percent,
} from "./use_search/progress_math";
import {
  begin_indexing_run,
  end_indexing_run,
  get_indexing_snapshot,
  report_indexing_counts,
  reset_indexing_progress,
  subscribe_indexing,
} from "./use_search/progress";

import {
  get_index_download_snapshot,
  reset_index_download_state,
} from "@/services/search/index_download_control";

const INDEX_CAP = 1000000;

describe("mailbox_index_total", () => {
  it("counts the messages in the mailbox and in the trash", () => {
    const total = mailbox_index_total(
      { total_items: 6400, trash: 100 },
      INDEX_CAP,
    );

    expect(total).toBe(6500);
  });

  it("treats a missing trash count as zero", () => {
    expect(mailbox_index_total({ total_items: 320 }, INDEX_CAP)).toBe(320);
  });

  it("never exceeds the index cap", () => {
    const total = mailbox_index_total({ total_items: 900, trash: 300 }, 1000);

    expect(total).toBe(1000);
  });

  it("reports an unknown total when the stats are unusable", () => {
    expect(mailbox_index_total(null, 1000)).toBe(0);
    expect(mailbox_index_total(undefined, 1000)).toBe(0);
    expect(mailbox_index_total({}, 1000)).toBe(0);
    expect(mailbox_index_total({ total_items: -1, trash: -1 }, 1000)).toBe(0);
    expect(mailbox_index_total({ total_items: Number.NaN }, 1000)).toBe(0);
  });
});

describe("advance_counts", () => {
  it("keeps the known total when a report carries none", () => {
    const known = advance_counts(
      { done: 0, total: 0 },
      { done: 0, total: 6500 },
    );
    const next = advance_counts(known, { done: 200, total: 0 });

    expect(next).toEqual({ done: 200, total: 6500 });
  });

  it("never moves the downloaded count backward", () => {
    const next = advance_counts(
      { done: 4000, total: 6500 },
      { done: 3800, total: 6500 },
    );

    expect(next).toEqual({ done: 4000, total: 6500 });
  });

  it("never lowers the total", () => {
    const next = advance_counts(
      { done: 100, total: 6500 },
      { done: 120, total: 6000 },
    );

    expect(next).toEqual({ done: 120, total: 6500 });
  });

  it("leaves the total unknown until a real total arrives", () => {
    const next = advance_counts({ done: 0, total: 0 }, { done: 400, total: 0 });

    expect(next).toEqual({ done: 400, total: 0 });
    expect(has_known_total(next)).toBe(false);
  });

  it("raises a known total that the downloaded count has passed", () => {
    const next = advance_counts(
      { done: 6400, total: 6500 },
      { done: 6600, total: 0 },
    );

    expect(next).toEqual({ done: 6600, total: 6600 });
  });

  it("returns the same counts when nothing changed", () => {
    const prev = { done: 40, total: 200 };

    expect(advance_counts(prev, { done: 40, total: 200 })).toBe(prev);
    expect(advance_counts(prev, { done: 10, total: 0 })).toBe(prev);
  });

  it("ignores values that are not usable counts", () => {
    const next = advance_counts(
      { done: 40, total: 200 },
      { done: Number.NaN, total: -1 },
    );

    expect(next).toEqual({ done: 40, total: 200 });
  });
});

describe("progress_percent", () => {
  it("reflects the share of messages downloaded", () => {
    expect(progress_percent({ done: 120, total: 200 }, true)).toBe(60);
    expect(progress_percent({ done: 1, total: 3 }, true)).toBe(33);
  });

  it("is never full while the download is active", () => {
    const at_total = progress_percent({ done: 200, total: 200 }, true);
    const near_total = progress_percent({ done: 6499, total: 6500 }, true);

    expect(at_total).toBe(MAX_ACTIVE_PERCENT);
    expect(near_total).toBe(MAX_ACTIVE_PERCENT);
  });

  it("is full only after the download has finished", () => {
    expect(progress_percent({ done: 200, total: 200 }, false)).toBe(100);
    expect(progress_percent({ done: 199, total: 200 }, false)).toBe(99);
  });

  it("never exceeds one hundred percent", () => {
    const finished = progress_percent({ done: 900, total: 200 }, false);
    const active = progress_percent({ done: 900, total: 200 }, true);

    expect(finished).toBe(100);
    expect(active).toBe(MAX_ACTIVE_PERCENT);
  });

  it("is empty while the total is unknown", () => {
    expect(progress_percent({ done: 400, total: 0 }, true)).toBe(0);
  });
});

describe("a full download", () => {
  it("holds one total, only moves forward, and completes at the end", () => {
    const mailbox_total = 6500;
    const page_size = 200;
    let counts = advance_counts(
      { done: 0, total: 0 },
      { done: 0, total: mailbox_total },
    );
    let last_percent = 0;

    for (let done = page_size; done <= mailbox_total; done += page_size) {
      counts = advance_counts(counts, { done, total: 0 });

      const percent = progress_percent(counts, true);

      expect(counts.total).toBe(mailbox_total);
      expect(counts.done).toBe(done);
      expect(percent).toBeGreaterThanOrEqual(last_percent);
      expect(percent).toBeLessThan(100);

      last_percent = percent;
    }

    counts = advance_counts(counts, {
      done: mailbox_total,
      total: mailbox_total,
    });

    expect(progress_percent(counts, true)).toBe(MAX_ACTIVE_PERCENT);
    expect(progress_percent(counts, false)).toBe(100);
  });
});

describe("indexing progress store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset_index_download_state();
    reset_indexing_progress();
  });

  afterEach(() => {
    reset_indexing_progress();
    reset_index_download_state();
    vi.useRealTimers();
  });

  it("starts a run with no counts and a new session", () => {
    const before = get_indexing_snapshot().session;
    const run_id = begin_indexing_run();
    const snapshot = get_indexing_snapshot();

    expect(snapshot.building).toBe(true);
    expect(snapshot.current).toBe(0);
    expect(snapshot.total).toBe(0);
    expect(snapshot.session).toBe(before + 1);

    end_indexing_run(run_id);
  });

  it("publishes a burst of reports once", () => {
    const run_id = begin_indexing_run();
    const listener = vi.fn();
    const unsubscribe = subscribe_indexing(listener);

    report_indexing_counts(run_id, 0, 6500);
    report_indexing_counts(run_id, 40, 0);
    report_indexing_counts(run_id, 80, 0);
    report_indexing_counts(run_id, 120, 0);

    expect(listener).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(get_indexing_snapshot().current).toBe(120);
    expect(get_indexing_snapshot().total).toBe(6500);

    unsubscribe();
    end_indexing_run(run_id);
  });

  it("keeps the total and the count from moving backward", () => {
    const run_id = begin_indexing_run();

    report_indexing_counts(run_id, 4000, 6500);
    report_indexing_counts(run_id, 3800, 0);
    report_indexing_counts(run_id, 3900, 5000);
    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);

    expect(get_indexing_snapshot().current).toBe(4000);
    expect(get_indexing_snapshot().total).toBe(6500);

    end_indexing_run(run_id);
  });

  it("stays in the building state until the last run ends", () => {
    const first = begin_indexing_run();
    const session = get_indexing_snapshot().session;

    report_indexing_counts(first, 12000, 50000);

    const second = begin_indexing_run();

    end_indexing_run(first);

    expect(get_indexing_snapshot().building).toBe(true);
    expect(get_indexing_snapshot().session).toBe(session);
    expect(get_indexing_snapshot().current).toBe(12000);
    expect(get_indexing_snapshot().total).toBe(50000);

    end_indexing_run(second);

    expect(get_indexing_snapshot().building).toBe(false);
    expect(get_indexing_snapshot().current).toBe(12000);
    expect(get_indexing_snapshot().total).toBe(50000);
  });

  it("reports completion only when the run ends with a final count", () => {
    const run_id = begin_indexing_run();

    report_indexing_counts(run_id, 6400, 6500);
    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);

    const running = get_indexing_snapshot();

    expect(running.building).toBe(true);
    expect(running.current).toBeLessThan(running.total);

    end_indexing_run(run_id, 6480);

    expect(get_indexing_snapshot().building).toBe(false);
    expect(get_indexing_snapshot().current).toBe(6480);
    expect(get_indexing_snapshot().total).toBe(6480);
    expect(get_index_download_snapshot().done).toBe(6480);
    expect(get_index_download_snapshot().total).toBe(6480);
  });

  it("saves the latest counts when a run ends early", () => {
    const run_id = begin_indexing_run();

    report_indexing_counts(run_id, 200, 6500);
    report_indexing_counts(run_id, 400, 0);
    end_indexing_run(run_id);

    expect(get_indexing_snapshot().building).toBe(false);
    expect(get_index_download_snapshot().done).toBe(400);
    expect(get_index_download_snapshot().total).toBe(6500);
  });

  it("ignores reports from a run that was reset", () => {
    const run_id = begin_indexing_run();

    report_indexing_counts(run_id, 200, 6500);
    reset_indexing_progress();
    report_indexing_counts(run_id, 400, 6500);
    end_indexing_run(run_id, 6500);
    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);

    expect(get_indexing_snapshot().building).toBe(false);
    expect(get_indexing_snapshot().current).toBe(0);
    expect(get_indexing_snapshot().total).toBe(0);
  });

  it("starts the next session from zero", () => {
    const first = begin_indexing_run();

    report_indexing_counts(first, 6500, 6500);
    end_indexing_run(first, 6500);

    const second = begin_indexing_run();

    expect(get_indexing_snapshot().current).toBe(0);
    expect(get_indexing_snapshot().total).toBe(0);

    end_indexing_run(second);
  });
});
