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
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  is_activated_plan,
  wait_for_slow_activation,
  SLOW_ACTIVATION_INTERVAL_MS,
  SLOW_ACTIVATION_WINDOW_MS,
} from "./billing_activation_poll";

import {
  activate_subscription,
  get_subscription,
} from "@/services/api/billing";

vi.mock("@/services/api/billing", () => ({
  activate_subscription: vi.fn(),
  get_subscription: vi.fn(),
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { invalidate: vi.fn() },
}));

const on_plan = (code: string) => ({ data: { plan: { code } } });
const no_wait = () => Promise.resolve();

describe("is_activated_plan", () => {
  it("matches the purchased plan when one is known", () => {
    expect(is_activated_plan("nova", "nova")).toBe(true);
    expect(is_activated_plan("free", "nova")).toBe(false);
    expect(is_activated_plan("star", "nova")).toBe(false);
  });

  it("accepts any paid plan when the target is unknown", () => {
    expect(is_activated_plan("star", null)).toBe(true);
    expect(is_activated_plan("free", null)).toBe(false);
    expect(is_activated_plan(undefined, null)).toBe(false);
  });
});

describe("wait_for_slow_activation", () => {
  beforeEach(() => {
    vi.mocked(activate_subscription).mockReset();
    vi.mocked(get_subscription).mockReset();
    vi.mocked(activate_subscription).mockResolvedValue({
      data: { activated: false },
    } as never);
  });

  it("keeps asking the server to activate until the plan is live", async () => {
    vi.mocked(get_subscription)
      .mockResolvedValueOnce(on_plan("free") as never)
      .mockResolvedValueOnce(on_plan("free") as never)
      .mockResolvedValueOnce(on_plan("nova") as never);
    const waits: number[] = [];

    const result = await wait_for_slow_activation(
      "nova",
      () => false,
      (ms) => {
        waits.push(ms);

        return Promise.resolve();
      },
    );

    expect(result?.plan.code).toBe("nova");
    expect(activate_subscription).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([
      SLOW_ACTIVATION_INTERVAL_MS,
      SLOW_ACTIVATION_INTERVAL_MS,
      SLOW_ACTIVATION_INTERVAL_MS,
    ]);
  });

  it("survives a failed activation call", async () => {
    vi.mocked(activate_subscription).mockRejectedValueOnce(new Error("down"));
    vi.mocked(get_subscription).mockResolvedValue(on_plan("nova") as never);

    const result = await wait_for_slow_activation("nova", () => false, no_wait);

    expect(result?.plan.code).toBe("nova");
  });

  it("stops at the end of the window", async () => {
    vi.mocked(get_subscription).mockResolvedValue(on_plan("free") as never);

    const result = await wait_for_slow_activation("nova", () => false, no_wait);

    expect(result).toBeNull();
    expect(get_subscription).toHaveBeenCalledTimes(
      SLOW_ACTIVATION_WINDOW_MS / SLOW_ACTIVATION_INTERVAL_MS,
    );
  });

  it("stops once the screen is gone", async () => {
    vi.mocked(get_subscription).mockResolvedValue(on_plan("free") as never);
    let calls = 0;

    const result = await wait_for_slow_activation(
      "nova",
      () => calls++ >= 2,
      no_wait,
    );

    expect(result).toBeNull();
    expect(activate_subscription).toHaveBeenCalledTimes(1);
  });
});
