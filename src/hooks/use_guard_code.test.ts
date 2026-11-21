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
import type { GuardDevice } from "@/services/guard/guard_device";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { use_guard_code } from "@/hooks/use_guard_code";
import { guard_code_for_step } from "@/lib/crypto/guard_code";
import {
  get_server_time_offset,
  note_server_date,
  set_server_time_offset_for_tests,
} from "@/lib/server_clock";

const VECTOR = "12345678901234567890";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function renderHook<T>(hook: () => T) {
  const result = { current: undefined as unknown as T };
  const container = document.createElement("div");
  const root = createRoot(container);

  function Probe() {
    result.current = hook();

    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    result,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

function device_with(secret: string | null): GuardDevice {
  return {
    code_secret: vi.fn(async () =>
      secret === null ? null : new TextEncoder().encode(secret),
    ),
  } as unknown as GuardDevice;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  set_server_time_offset_for_tests(null);
});

afterEach(() => {
  vi.useRealTimers();
  set_server_time_offset_for_tests(null);
});

describe("use_guard_code", () => {
  it("shows the step 1 code at t=59 and changes at t=60", async () => {
    vi.setSystemTime(59_000);
    const { result } = renderHook(() => use_guard_code(device_with(VECTOR)));

    await flush();
    expect(result.current.code).toBe("PV9M4");
    expect(result.current.seconds_left).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    const secret = new TextEncoder().encode(VECTOR);

    expect(result.current.code).toBe(guard_code_for_step(secret, 2));
    expect(result.current.code).not.toBe("PV9M4");
    expect(result.current.seconds_left).toBe(30);
  });

  it("uses server time when the local clock is 120 s fast", async () => {
    vi.setSystemTime(59_000 + 120_000);
    set_server_time_offset_for_tests(-120_000);
    const { result } = renderHook(() => use_guard_code(device_with(VECTOR)));

    await flush();
    expect(result.current.code).toBe("PV9M4");
  });

  it("returns null without a secret", async () => {
    vi.setSystemTime(59_000);
    const device = device_with(null);
    const { result } = renderHook(() => use_guard_code(device));

    await flush();
    expect(result.current.code).toBeNull();
    expect(result.current.ready).toBe(true);
  });

  it("returns null without a device", async () => {
    const { result } = renderHook(() => use_guard_code(null));

    await flush();
    expect(result.current.code).toBeNull();
  });

  it("zeroes the secret on unmount", async () => {
    const bytes = new TextEncoder().encode(VECTOR);
    const device = {
      code_secret: vi.fn(async () => bytes),
    } as unknown as GuardDevice;
    const { unmount } = renderHook(() => use_guard_code(device));

    await flush();
    unmount();
    expect(bytes.every((b) => b === 0)).toBe(true);
  });
});

describe("server clock", () => {
  it("ignores small skew and applies a large one", () => {
    note_server_date(new Date(10_000).toUTCString(), 9_000, 9_000);
    expect(get_server_time_offset()).toBe(0);
    note_server_date(new Date(0).toUTCString(), 120_000, 120_000);
    expect(get_server_time_offset()).toBe(-119_500);
    note_server_date("not a date", 0, 0);
    expect(get_server_time_offset()).toBe(-119_500);
  });
});
