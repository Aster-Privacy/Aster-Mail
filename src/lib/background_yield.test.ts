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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INPUT_QUIET_MS,
  create_background_slicer,
  is_user_interacting,
  yield_to_background,
} from "@/lib/background_yield";

type SchedulerHolder = { scheduler?: unknown };

describe("background yield", () => {
  const holder = globalThis as SchedulerHolder;
  const saved = holder.scheduler;

  afterEach(() => {
    holder.scheduler = saved;
    vi.restoreAllMocks();
  });

  it("posts continuations at background priority when available", async () => {
    const post_task = vi.fn(
      async (callback: () => void, _options?: { priority?: string }) =>
        callback(),
    );

    holder.scheduler = { postTask: post_task };
    await new Promise((resolve) => setTimeout(resolve, INPUT_QUIET_MS));
    await yield_to_background();

    expect(post_task).toHaveBeenCalled();
    expect(post_task.mock.calls[0][1]).toEqual({ priority: "background" });
  });

  it("waits for input to go quiet before continuing", async () => {
    holder.scheduler = undefined;
    const slicer = create_background_slicer(1000);

    window.dispatchEvent(new Event("keydown"));

    expect(is_user_interacting()).toBe(true);
    expect(slicer.should_yield()).toBe(true);

    const started = performance.now();

    await slicer.yield();

    expect(performance.now() - started).toBeGreaterThanOrEqual(
      INPUT_QUIET_MS - 20,
    );
    expect(is_user_interacting()).toBe(false);
    expect(slicer.should_yield()).toBe(false);
  });
});
