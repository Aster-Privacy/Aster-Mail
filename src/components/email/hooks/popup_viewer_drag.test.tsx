//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_popup_drag_resize } from "./popup_viewer_drag";
import { POPUP_MARGIN } from "./popup_viewer_types";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_popup_drag_resize>;

function set_viewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function expect_fully_visible(result: HookResult) {
  const { position, dimensions } = result;

  expect(position.x).toBeGreaterThanOrEqual(0);
  expect(position.y).toBeGreaterThanOrEqual(0);
  expect(position.x + dimensions.width).toBeLessThanOrEqual(window.innerWidth);
  expect(position.y + dimensions.height).toBeLessThanOrEqual(
    window.innerHeight,
  );
}

describe("use_popup_drag_resize", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: HookResult;

  function Probe() {
    latest = use_popup_drag_resize();

    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    set_viewport(1356, 667);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("opens fully visible on a short viewport", () => {
    expect(latest.dimensions.height).toBe(667 - POPUP_MARGIN * 2);
    expect_fully_visible(latest);
  });

  it("opens centered horizontally", () => {
    expect(latest.position.x).toBe(Math.round((1356 - 680) / 2));
  });

  it("stays visible after the window shrinks", () => {
    act(() => {
      set_viewport(900, 500);
      window.dispatchEvent(new Event("resize"));
    });

    expect(latest.dimensions.height).toBe(500 - POPUP_MARGIN * 2);
    expect_fully_visible(latest);
  });

  it("stays visible when expanded", () => {
    act(() => latest.toggle_size());

    expect(latest.popup_size).toBe("expanded");
    expect_fully_visible(latest);
  });

  it("returns to a visible default window after leaving fullscreen", () => {
    act(() => latest.handle_fullscreen());
    expect(latest.is_fullscreen).toBe(true);

    act(() => latest.handle_fullscreen());
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(latest.is_fullscreen).toBe(false);
    expect(latest.popup_size).toBe("default");
    expect_fully_visible(latest);
  });
});
