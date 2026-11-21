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
import { describe, it, expect, vi } from "vitest";

import {
  is_rate_limited,
  rate_limit_delay_ms,
  run_bounded,
  with_rate_limit_retry,
} from "./rate_limit_retry";

const limited = (retry_after_secs?: number) => ({
  error: "Too many requests",
  code: "RATE_LIMIT_EXCEEDED" as const,
  status: 429,
  ...(retry_after_secs === undefined ? {} : { retry_after_secs }),
});

describe("is_rate_limited", () => {
  it("recognizes the error code and the status", () => {
    expect(is_rate_limited(limited())).toBe(true);
    expect(is_rate_limited({ error: "x", status: 429 })).toBe(true);
    expect(is_rate_limited({ error: "x", status: 500 })).toBe(false);
    expect(is_rate_limited({ data: {} })).toBe(false);
    expect(is_rate_limited(null)).toBe(false);
  });
});

describe("rate_limit_delay_ms", () => {
  it("uses the server hint when one is present", () => {
    expect(rate_limit_delay_ms(limited(7), 1)).toBe(7000);
  });

  it("backs off without a hint and never exceeds the cap", () => {
    const first = rate_limit_delay_ms(limited(), 1);
    const second = rate_limit_delay_ms(limited(), 2);

    expect(second).toBeGreaterThan(first);
    expect(rate_limit_delay_ms(limited(100000), 1)).toBeLessThan(100000 * 1000);
  });
});

describe("with_rate_limit_retry", () => {
  it("waits for the hinted time and sends the request again", async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const request = vi
      .fn()
      .mockResolvedValueOnce(limited(3))
      .mockResolvedValueOnce({ data: { ok: true } });

    const response = await with_rate_limit_retry(request, { wait });

    expect(response.data).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls).toEqual([[3000]]);
  });

  it("returns other failures at once", async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const request = vi.fn().mockResolvedValue({ error: "offline" });

    const response = await with_rate_limit_retry(request, { wait });

    expect(response.error).toBe("offline");
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("gives up after the attempt limit and returns the last response", async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const request = vi.fn().mockResolvedValue(limited(1));

    const response = await with_rate_limit_retry(request, {
      wait,
      max_attempts: 3,
    });

    expect(is_rate_limited(response)).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("stops retrying once the signal is aborted", async () => {
    const controller = new AbortController();
    const wait = vi.fn(async (_ms: number) => controller.abort());
    const request = vi.fn().mockResolvedValue(limited(1));

    await with_rate_limit_retry(request, { wait, signal: controller.signal });

    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("run_bounded", () => {
  it("visits every item without exceeding the limit", async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];

    await run_bounded([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      seen.push(item);
      active -= 1;
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("does nothing for an empty list", async () => {
    const worker = vi.fn(async () => {});

    await run_bounded([], 4, worker);

    expect(worker).not.toHaveBeenCalled();
  });
});
