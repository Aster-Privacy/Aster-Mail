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
  BACKGROUND_PAUSE_MAX_MS,
  BACKGROUND_PAUSE_MIN_MS,
  background_pause_remaining_ms,
  is_background_paused,
  on_rate_limit_recovered,
  pause_background_requests,
  reset_request_governor,
  wait_for_background_window,
} from "./request_governor";

describe("request governor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset_request_governor();
  });

  afterEach(() => {
    reset_request_governor();
    vi.useRealTimers();
  });

  it("is open until a rate limit arrives", async () => {
    expect(is_background_paused()).toBe(false);
    await expect(wait_for_background_window()).resolves.toBeUndefined();
  });

  it("holds background work for the retry window", async () => {
    pause_background_requests(5000);

    expect(is_background_paused()).toBe(true);

    let released = false;

    void wait_for_background_window().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(4900);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(released).toBe(true);
    expect(is_background_paused()).toBe(false);
  });

  it("extends the pause and never shortens it", async () => {
    pause_background_requests(5000);
    pause_background_requests(1000);
    expect(background_pause_remaining_ms()).toBe(5000);

    await vi.advanceTimersByTimeAsync(3000);
    pause_background_requests(6000);
    expect(background_pause_remaining_ms()).toBe(6000);
  });

  it("clamps the pause to sane bounds", () => {
    pause_background_requests(0);
    expect(background_pause_remaining_ms()).toBe(BACKGROUND_PAUSE_MIN_MS);

    reset_request_governor();
    pause_background_requests(10 * 60_000);
    expect(background_pause_remaining_ms()).toBe(BACKGROUND_PAUSE_MAX_MS);
  });

  it("tells listeners once the limit recovers", async () => {
    const listener = vi.fn();

    on_rate_limit_recovered(listener);
    pause_background_requests(3000);

    await vi.advanceTimersByTimeAsync(2999);
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
