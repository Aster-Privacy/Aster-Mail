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
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOAD_DEADLINE_MS,
  use_loading_deadline,
  use_retry_on_recovery,
} from "./use_load_recovery";

import { RATE_LIMIT_RECOVERED_EVENT } from "@/services/api/client/request_governor";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T, P extends object = Record<string, never>>(
  hook: (props: P) => T,
  options: { initialProps?: P } = {},
) {
  const result = { current: undefined as unknown as T };
  const root = createRoot(document.createElement("div"));
  let props = (options.initialProps ?? {}) as P;

  function Probe() {
    result.current = hook(props);

    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    result,
    rerender: (next: P) => {
      props = next;
      act(() => {
        root.render(createElement(Probe));
      });
    },
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

describe("use_loading_deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags a load that never finishes", () => {
    const { result } = renderHook(() => use_loading_deadline(true));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(LOAD_DEADLINE_MS);
    });

    expect(result.current).toBe(true);
  });

  it("clears once the load settles", () => {
    const { result, rerender } = renderHook(
      ({ loading }) => use_loading_deadline(loading),
      { initialProps: { loading: true } },
    );

    act(() => {
      vi.advanceTimersByTime(LOAD_DEADLINE_MS);
    });
    expect(result.current).toBe(true);

    rerender({ loading: false });
    expect(result.current).toBe(false);
  });
});

describe("use_retry_on_recovery", () => {
  it("retries when the tab refocuses, the network returns, or the limit lifts", () => {
    const on_retry = vi.fn();
    const now = vi.spyOn(Date, "now");
    let clock = 100_000;

    now.mockImplementation(() => clock);

    const hook = renderHook(() => use_retry_on_recovery(true, on_retry));

    window.dispatchEvent(new Event("focus"));
    expect(on_retry).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(on_retry).toHaveBeenCalledTimes(1);

    clock += 10_000;
    window.dispatchEvent(new Event("online"));
    expect(on_retry).toHaveBeenCalledTimes(2);

    clock += 10_000;
    window.dispatchEvent(new Event(RATE_LIMIT_RECOVERED_EVENT));
    expect(on_retry).toHaveBeenCalledTimes(3);

    hook.unmount();
    now.mockRestore();
  });

  it("stays quiet while nothing has failed", () => {
    const on_retry = vi.fn();

    const hook = renderHook(() => use_retry_on_recovery(false, on_retry));

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event(RATE_LIMIT_RECOVERED_EVENT));

    expect(on_retry).not.toHaveBeenCalled();
    hook.unmount();
  });
});
