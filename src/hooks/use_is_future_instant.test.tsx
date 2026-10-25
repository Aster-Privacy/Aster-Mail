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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_is_future_instant } from "@/hooks/use_is_future_instant";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-10-25T08:59:00Z");

let container: HTMLDivElement;
let root: Root;

function Probe({
  instant,
  is_active,
}: {
  instant: Date | null;
  is_active?: boolean;
}) {
  const is_future = use_is_future_instant(instant, is_active);

  return <span>{is_future ? "future" : "past"}</span>;
}

async function render_probe(instant: Date | null, is_active?: boolean) {
  await act(async () => {
    root.render(<Probe instant={instant} is_active={is_active} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("use_is_future_instant", () => {
  it("reports null and past instants as not in the future", async () => {
    await render_probe(null);
    expect(container.textContent).toBe("past");

    await render_probe(new Date(NOW.getTime() - 1));
    expect(container.textContent).toBe("past");
  });

  it("flips to past when the instant is reached", async () => {
    await render_probe(new Date(NOW.getTime() + 60 * 1000));
    expect(container.textContent).toBe("future");

    await act(async () => {
      vi.advanceTimersByTime(59 * 1000);
    });
    expect(container.textContent).toBe("future");

    await act(async () => {
      vi.advanceTimersByTime(2 * 1000);
    });
    expect(container.textContent).toBe("past");
  });

  it("rechecks when the window regains focus", async () => {
    await render_probe(new Date(NOW.getTime() + 60 * 1000));

    vi.setSystemTime(NOW.getTime() + 2 * 60 * 1000);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(container.textContent).toBe("past");
  });

  it("schedules no timer while inactive", async () => {
    await render_probe(new Date(NOW.getTime() + 60 * 1000), false);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer on unmount", async () => {
    await render_probe(new Date(NOW.getTime() + 60 * 1000));
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      root.render(<span />);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
