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

import { Slider } from "@/components/ui/slider";

let root: Root | null = null;
let host: HTMLElement | null = null;

function render_slider(
  direction: "ltr" | "rtl",
  on_change: (v: number) => void,
) {
  host = document.createElement("div");
  host.style.direction = direction;
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Slider max={20} min={10} value={15} onChange={on_change} />);
  });

  const track = host.querySelector("div.relative") as HTMLDivElement;

  track.style.direction = direction;

  return track;
}

function stub_rect(track: HTMLDivElement) {
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe("Slider direction handling", () => {
  it("increases with the right arrow when reading left to right", () => {
    const on_change = vi.fn();
    const track = render_slider("ltr", on_change);
    const thumb = track.querySelector('[role="slider"]') as HTMLElement;

    act(() => {
      thumb.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenCalledWith(16);
  });

  it("increases with the left arrow when reading right to left", () => {
    const on_change = vi.fn();
    const track = render_slider("rtl", on_change);
    const thumb = track.querySelector('[role="slider"]') as HTMLElement;

    act(() => {
      thumb.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenCalledWith(16);
  });

  it("decreases with the right arrow when reading right to left", () => {
    const on_change = vi.fn();
    const track = render_slider("rtl", on_change);
    const thumb = track.querySelector('[role="slider"]') as HTMLElement;

    act(() => {
      thumb.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenCalledWith(14);
  });

  it("mirrors pointer positions when reading right to left", () => {
    const on_change = vi.fn();
    const track = render_slider("rtl", on_change);

    stub_rect(track);
    track.setPointerCapture = () => {};
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 25, bubbles: true }),
      );
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerup", { clientX: 25, bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenCalledWith(18);
  });

  it("keeps pointer positions unmirrored when reading left to right", () => {
    const on_change = vi.fn();
    const track = render_slider("ltr", on_change);

    stub_rect(track);
    track.setPointerCapture = () => {};
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 25, bubbles: true }),
      );
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerup", { clientX: 25, bubbles: true }),
      );
    });

    expect(on_change).toHaveBeenCalledWith(13);
  });
});
