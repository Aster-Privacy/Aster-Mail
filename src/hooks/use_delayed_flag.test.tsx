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
import { act, render_hook } from "@/tests/render_hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { use_delayed_flag } from "./use_delayed_flag";

describe("use_delayed_flag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the flag in the same render with no delay and no minimum", () => {
    const { result, rerender } = render_hook(
      ({ active }) => use_delayed_flag(active, 0, 0),
      { initialProps: { active: true } },
    );

    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("drops a flag raised without delay as soon as delays come back", () => {
    const { result, rerender } = render_hook(
      ({ active, delay }) => use_delayed_flag(active, delay, delay),
      { initialProps: { active: true, delay: 0 } },
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ active: false, delay: 250 });

    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it("waits for the delay and holds for the minimum by default", () => {
    const { result, rerender } = render_hook(
      ({ active }) => use_delayed_flag(active, 250, 400),
      { initialProps: { active: true } },
    );

    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(false);
  });
});
