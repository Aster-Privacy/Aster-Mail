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
import {
  act,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { resolve_list_width, use_split_pane } from "./use_split_pane";

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

let measure_count = 0;

async function resize(times = 1) {
  await act(async () => {
    for (let i = 0; i < times; i++) observer_callback?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
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
          node.getBoundingClientRect = () => {
            measure_count += 1;

            return { width: container_width, height: 800 } as DOMRect;
          };
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

  it("shrinks the list when the container gets narrower", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount(1200);

    expect(latest_width).toBe(1200);

    container_width = 1100;
    await resize();

    expect(latest_width).toBe(1100 - 360);
  });

  it("never goes below the minimum list width", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount(1200);

    container_width = 500;
    await resize();

    expect(latest_width).toBe(256);
  });

  it("measures once per frame however often the size changes", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount(1200);
    measure_count = 0;

    container_width = 1100;
    await resize(5);

    expect(measure_count).toBe(1);
    expect(latest_width).toBe(1100 - 360);
  });
});

type PreferenceSpy = ReturnType<typeof vi.fn>;

let latest_pane: ReturnType<typeof use_split_pane> | null = null;
let column_width = 800;

function ControlledProbe({
  saved_width,
  saved_ratio,
  rtl,
  on_save,
}: {
  saved_width: number;
  saved_ratio: number;
  rtl: boolean;
  on_save: PreferenceSpy;
}) {
  const pane = use_split_pane({
    is_split_view: true,
    is_bottom_pane: false,
    split_pane_width: saved_width,
    split_pane_ratio: saved_ratio,
    split_pane_height: 0,
    update_preference: on_save as never,
  });

  latest_pane = pane;
  latest_width = pane.pane_width;

  return (
    <div
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () =>
            ({ width: container_width, height: 800 }) as DOMRect;
        }
      }}
      style={{ direction: rtl ? "rtl" : "ltr" }}
    >
      <div
        ref={(node) => {
          (pane.list_column_ref as { current: HTMLDivElement | null }).current =
            node;
          if (node) {
            node.getBoundingClientRect = () =>
              ({ width: column_width, height: 800 }) as DOMRect;
          }
        }}
      >
        <div ref={pane.list_panel_ref} />
      </div>
    </div>
  );
}

function mount_controlled(options: {
  saved_width?: number;
  saved_ratio?: number;
  rtl?: boolean;
}) {
  const on_save = vi.fn();
  const host = document.createElement("div");

  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <ControlledProbe
        on_save={on_save}
        rtl={options.rtl ?? false}
        saved_ratio={options.saved_ratio ?? 0}
        saved_width={options.saved_width ?? 0}
      />,
    ),
  );

  return on_save;
}

function saved_value(on_save: PreferenceSpy, key: string): unknown {
  const calls = on_save.mock.calls.filter((call) => call[0] === key);

  return calls.length ? calls[calls.length - 1][1] : undefined;
}

function drag_by(dx: number, button = 0) {
  act(() =>
    latest_pane?.handle_drag_start({
      button,
      clientX: 500,
      clientY: 0,
      preventDefault: () => {},
    } as unknown as ReactMouseEvent),
  );
  act(() => {
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 500 + dx, clientY: 0 }),
    );
  });
  act(() => {
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
}

function press(key: string) {
  act(() =>
    latest_pane?.handle_key_down({
      key,
      preventDefault: () => {},
    } as unknown as ReactKeyboardEvent),
  );
}

describe("resolve_list_width", () => {
  it("prefers the saved ratio over the saved width", () => {
    expect(
      resolve_list_width({
        container_width: 2000,
        saved_ratio: 0.4,
        saved_width: 500,
      }),
    ).toBe(800);
  });

  it("falls back to the saved width, then to a capped half of the container", () => {
    expect(
      resolve_list_width({
        container_width: 2000,
        saved_ratio: 0,
        saved_width: 500,
      }),
    ).toBe(500);
    expect(
      resolve_list_width({
        container_width: 2000,
        saved_ratio: 0,
        saved_width: 0,
      }),
    ).toBe(680);
    expect(
      resolve_list_width({
        container_width: 1100,
        saved_ratio: 0,
        saved_width: 0,
      }),
    ).toBe(550);
  });

  it("keeps room for the reading pane", () => {
    expect(
      resolve_list_width({
        container_width: 1000,
        saved_ratio: 0.9,
        saved_width: 0,
      }),
    ).toBe(640);
  });
});

describe("use_split_pane resizing", () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    latest_pane = null;
    column_width = 800;
    container_width = 1600;
    vi.unstubAllGlobals();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("scales a saved ratio with the window", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mount_controlled({ saved_ratio: 0.4 });

    expect(latest_width).toBe(640);

    container_width = 2400;
    await resize();

    expect(latest_width).toBe(960);
  });

  it("saves both the width and the ratio after a drag", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const on_save = mount_controlled({ saved_ratio: 0.5 });

    drag_by(100);

    expect(saved_value(on_save, "split_pane_width")).toBe(900);
    expect(saved_value(on_save, "split_pane_ratio")).toBe(0.5625);
  });

  it("follows the pointer when the layout is right to left", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const on_save = mount_controlled({ saved_ratio: 0.5, rtl: true });

    drag_by(-100);

    expect(saved_value(on_save, "split_pane_width")).toBe(900);
  });

  it("ignores drags that do not start with the main button", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const on_save = mount_controlled({ saved_ratio: 0.5 });

    drag_by(100, 2);

    expect(latest_pane?.is_dragging).toBe(false);
    expect(on_save).not.toHaveBeenCalled();
  });

  it("resizes with the arrow keys and mirrors them right to left", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const ltr_save = mount_controlled({ saved_ratio: 0.5 });

    press("ArrowRight");
    expect(saved_value(ltr_save, "split_pane_width")).toBe(824);

    act(() => root?.unmount());
    const rtl_save = mount_controlled({ saved_ratio: 0.5, rtl: true });

    press("ArrowRight");
    expect(saved_value(rtl_save, "split_pane_width")).toBe(776);
  });

  it("resets to the default list width", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const on_save = mount_controlled({ saved_ratio: 0.3 });

    press("Enter");

    expect(saved_value(on_save, "split_pane_width")).toBe(0);
    expect(saved_value(on_save, "split_pane_ratio")).toBe(0);
    expect(latest_pane?.list_column_ref.current?.style.width).toBe("680px");
  });
});
