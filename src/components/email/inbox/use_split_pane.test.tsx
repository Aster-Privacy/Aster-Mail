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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_split_pane } from "./use_split_pane";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let observer_callback: (() => void) | null = null;
let container_width = 1600;
let latest_width = 0;
let root: Root | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    observer_callback = callback;
  }
  observe() {}
  disconnect() {}
}

function Probe({ saved_width }: { saved_width: number }) {
  const pane = use_split_pane({
    is_split_view: true,
    is_bottom_pane: false,
    split_pane_width: saved_width,
    split_pane_height: 0,
    update_preference: vi.fn(),
  });

  latest_width = pane.pane_width;

  return (
    <div
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () =>
            ({ width: container_width, height: 800 }) as DOMRect;
        }
      }}
    >
      <div ref={pane.list_panel_ref} />
    </div>
  );
}

function mount(saved_width: number) {
  const host = document.createElement("div");

  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<Probe saved_width={saved_width} />));
}

describe("use_split_pane", () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.unstubAllGlobals();
    observer_callback = null;
    container_width = 1600;
  });

  it("shrinks the list when the container gets narrower", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount(1200);

    expect(latest_width).toBe(1200);

    container_width = 1100;
    act(() => observer_callback?.());

    expect(latest_width).toBe(1100 - 360);
  });

  it("never goes below the minimum list width", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount(1200);

    container_width = 500;
    act(() => observer_callback?.());

    expect(latest_width).toBe(256);
  });
});
