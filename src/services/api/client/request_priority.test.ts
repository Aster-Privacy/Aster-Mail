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
  FAST_BACKGROUND_RESPONSE_MS,
  MAX_IDLE_WAIT_MS,
  MIN_BACKGROUND_PAGE_SIZE,
  PREEMPT_AFTER_MS,
  background_page_size,
  begin_foreground_request,
  is_foreground_busy,
  reset_request_priority_state,
  track_background_request,
  wait_for_foreground_idle,
} from "./request_priority";

describe("request_priority", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset_request_priority_state();
  });

  afterEach(() => {
    reset_request_priority_state();
    vi.useRealTimers();
  });

  it("lets background work start at once when nothing is in the foreground", async () => {
    let resolved = false;

    await wait_for_foreground_idle().then(() => {
      resolved = true;
    });

    expect(resolved).toBe(true);
  });

  it("holds background work until every foreground request ends", async () => {
    const end_first = begin_foreground_request();
    const end_second = begin_foreground_request();
    let resolved = false;

    void wait_for_foreground_idle().then(() => {
      resolved = true;
    });

    end_first();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(is_foreground_busy()).toBe(true);

    end_second();
    end_second();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(is_foreground_busy()).toBe(false);
  });

  it("stops holding background work after the maximum wait", async () => {
    begin_foreground_request();
    let resolved = false;

    void wait_for_foreground_idle().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(MAX_IDLE_WAIT_MS);
    expect(resolved).toBe(true);
  });

  it("leaves a running background request alone when the foreground is fast", () => {
    const background = track_background_request();
    const end = begin_foreground_request();

    vi.advanceTimersByTime(PREEMPT_AFTER_MS - 1);
    end();
    vi.advanceTimersByTime(PREEMPT_AFTER_MS);

    expect(background.was_preempted()).toBe(false);
    expect(background.controller.signal.aborted).toBe(false);
    background.release();
  });

  it("aborts running background requests when the foreground stays slow", () => {
    const background = track_background_request();
    const released = track_background_request();

    released.release();
    begin_foreground_request();
    vi.advanceTimersByTime(PREEMPT_AFTER_MS);

    expect(background.was_preempted()).toBe(true);
    expect(background.controller.signal.aborted).toBe(true);
    expect(released.was_preempted()).toBe(false);
  });

  it("shrinks background pages after a preemption and restores them after fast responses", () => {
    expect(background_page_size(200)).toBe(200);

    const background = track_background_request();
    const end = begin_foreground_request();

    vi.advanceTimersByTime(PREEMPT_AFTER_MS);
    end();
    background.release();
    expect(background_page_size(200)).toBe(100);

    const next = track_background_request();

    next.settle(FAST_BACKGROUND_RESPONSE_MS + 1);
    expect(background_page_size(200)).toBe(100);
    next.settle(FAST_BACKGROUND_RESPONSE_MS);
    expect(background_page_size(200)).toBe(200);
    next.release();
  });

  it("never shrinks a background page below the minimum or above the request", () => {
    for (let round = 0; round < 6; round += 1) {
      track_background_request().stalled();
    }

    expect(background_page_size(200)).toBe(MIN_BACKGROUND_PAGE_SIZE);
    expect(background_page_size(10)).toBe(10);
  });
});
