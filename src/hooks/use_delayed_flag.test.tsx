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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { use_delayed_flag, SKELETON_DELAY_MS } from "./use_delayed_flag";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let latest = false;

function Probe({ active }: { active: boolean }) {
  latest = use_delayed_flag(active);

  return null;
}

function render(active: boolean) {
  act(() => {
    root.render(<Probe active={active} />);
  });
}

function skeleton_gate(has_data: boolean, pending: boolean): boolean {
  return !has_data && pending;
}

describe("use_delayed_flag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    root = createRoot(container);
    latest = false;
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("never shows a skeleton when loading finishes under 150ms", () => {
    render(true);
    expect(latest).toBe(false);

    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(latest).toBe(false);

    render(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest).toBe(false);
  });

  it("shows the skeleton once pending lasts past the delay", () => {
    render(true);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(latest).toBe(true);
  });

  it("hides in the same render that pending ends", () => {
    render(true);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(latest).toBe(true);

    render(false);
    expect(latest).toBe(false);
  });

  it("restarts the delay for each new pending period", () => {
    render(true);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    render(false);
    render(true);
    expect(latest).toBe(false);
  });

  it("treats cached data that is still fetching as not a skeleton", () => {
    render(skeleton_gate(true, true));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(latest).toBe(false);
  });
});
