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

vi.mock("./index_cache", () => ({
  build_search_index: async () => {},
  cached_index: null,
  schedule_deep_index: () => {},
}));
vi.mock("@/services/search/index_download_control", () => ({
  flush_index_download_checkpoint: () => {},
  get_index_download_snapshot: () => ({ paused: false, done: 0, total: 0 }),
  record_index_download_checkpoint: () => {},
  set_index_download_paused: () => {},
  subscribe_index_download: () => () => {},
}));

import { PROGRESS_PUBLISH_INTERVAL_MS } from "./progress_math";
import {
  begin_indexing_run,
  end_indexing_run,
  get_indexing_snapshot,
  report_indexing_counts,
  reset_indexing_progress,
  subscribe_indexing,
} from "./progress";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  reset_indexing_progress();
});

afterEach(() => {
  reset_indexing_progress();
  vi.useRealTimers();
});

describe("indexing progress publishing", () => {
  it("publishes at most about four times a second however often counts arrive", () => {
    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);

    const run = begin_indexing_run();
    const publishes: number[] = [];
    const stop = subscribe_indexing(() => publishes.push(Date.now()));

    for (let i = 1; i <= 2000; i++) {
      report_indexing_counts(run, i, 30000);
      vi.advanceTimersByTime(1);
    }

    vi.advanceTimersByTime(PROGRESS_PUBLISH_INTERVAL_MS);
    stop();

    expect(PROGRESS_PUBLISH_INTERVAL_MS).toBeGreaterThanOrEqual(250);
    expect(publishes.length).toBeLessThanOrEqual(
      Math.ceil(2000 / PROGRESS_PUBLISH_INTERVAL_MS) + 1,
    );

    for (let i = 1; i < publishes.length; i++) {
      expect(publishes[i] - publishes[i - 1]).toBeGreaterThanOrEqual(
        PROGRESS_PUBLISH_INTERVAL_MS,
      );
    }

    expect(get_indexing_snapshot().current).toBe(2000);
    end_indexing_run(run);
  });
});
