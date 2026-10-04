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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  TRACKING_PIXEL_MARKER_SIZE_PX,
  TrackingPixelMarkers,
  locate_tracking_pixel_markers,
} from "./tracking_pixel_markers";

import { TRACKING_PIXEL_DOT_PX } from "@/components/email/tracking_pixel_dot";
import {
  request_tracking_pixel_highlight,
  use_tracking_pixel_marker_total,
} from "@/stores/tracking_pixel_highlight_store";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function place(el: Element, box: DOMRect | null) {
  el.getBoundingClientRect = () => box ?? rect(0, 0, 0, 0);
  el.getClientRects = () => (box ? [box] : []) as unknown as DOMRectList;
}

function pixel(url: string): HTMLImageElement {
  const img = document.createElement("img");

  img.setAttribute("src", "data:image/svg+xml,placeholder");
  img.setAttribute("data-original-src", url);
  img.setAttribute("data-blocked", "true");
  img.setAttribute("data-tracking-pixel", "true");
  img.setAttribute("width", "1");
  img.setAttribute("height", "1");

  return img;
}

const BOUNDS = { offset_left: 0, offset_top: 0, width: 600, height: 400 };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("locate_tracking_pixel_markers", () => {
  it("anchors a marker at each visible pixel and skips hidden ones", () => {
    const cell = document.createElement("td");
    const in_cell = pixel("https://open.mailmetrics.example/o/1.gif");
    const hidden_box = document.createElement("div");
    const hidden = pixel("https://open.mailmetrics.example/o/2.gif");
    const at_end = pixel("https://t.beacon.example/open?id=9");
    const image = document.createElement("img");

    image.setAttribute("data-blocked", "true");
    image.setAttribute("data-tracking-pixel", "false");
    cell.append(in_cell);
    hidden_box.append(hidden);
    document.body.append(cell, hidden_box, at_end, image);
    place(in_cell, rect(220, 120.4, 1, 1));
    place(hidden, null);
    place(at_end, rect(10, 300, 1, 1));
    place(image, rect(0, 0, 200, 100));

    const markers = locate_tracking_pixel_markers(document, {
      ...BOUNDS,
      offset_left: 24,
      offset_top: 8,
    });
    const half = TRACKING_PIXEL_MARKER_SIZE_PX / 2;

    expect(markers.map(({ left, top }) => ({ left, top }))).toEqual([
      { left: 244, top: Math.round(8 + 120.4 + 0.5 - half) },
      { left: 34, top: Math.round(8 + 300 + 0.5 - half) },
    ]);
  });

  it("skips pixels clipped away by a zero-height container", () => {
    const preheader = document.createElement("div");
    const clipped = pixel("https://px.example/a.gif");

    preheader.style.overflow = "hidden";
    preheader.append(clipped);
    document.body.append(preheader);
    place(preheader, rect(0, 0, 600, 0));
    place(clipped, rect(0, 0, 1, 1));

    expect(locate_tracking_pixel_markers(document, BOUNDS)).toEqual([]);
  });

  it("keeps markers inside the frame and merges pixels stacked on one spot", () => {
    const first = pixel("https://px.example/a.gif");
    const second = pixel("https://px.example/b.gif");

    document.body.append(first, second);
    place(first, rect(599, 399, 1, 1));
    place(second, rect(600, 400, 1, 1));

    expect(locate_tracking_pixel_markers(document, BOUNDS)).toEqual([
      {
        key: expect.any(String),
        left: 600 - TRACKING_PIXEL_MARKER_SIZE_PX,
        top: 400 - TRACKING_PIXEL_MARKER_SIZE_PX,
      },
    ]);
  });
});

describe("TrackingPixelMarkers", () => {
  let container: HTMLDivElement;
  let root: Root;
  let iframe: HTMLIFrameElement;
  let release_highlight: (() => void) | null = null;

  function highlight() {
    act(() => {
      release_highlight = request_tracking_pixel_highlight();
    });
  }

  function release() {
    act(() => release_highlight?.());
    release_highlight = null;
  }

  function MarkedTotal() {
    return (
      <span data-testid="marked-total">
        {use_tracking_pixel_marker_total()}
      </span>
    );
  }

  function marked_total(): string | null {
    return container.querySelector("[data-testid='marked-total']")!.textContent;
  }

  function show(label = "Tracking pixel blocked") {
    act(() => {
      root.render(
        <>
          <TrackingPixelMarkers
            iframe_ref={{ current: iframe }}
            label={label}
          />
          <MarkedTotal />
        </>,
      );
    });
  }

  function add_pixel(box: DOMRect | null) {
    const img = pixel("https://open.mailmetrics.example/o/1.gif");

    document.body.append(img);
    place(img, box);
    const measure = vi.fn(img.getBoundingClientRect);

    img.getBoundingClientRect = measure;

    return measure;
  }

  beforeEach(() => {
    const frame_box = document.createElement("div");

    iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get: () => document,
    });
    Object.defineProperty(frame_box, "clientWidth", { value: 600 });
    Object.defineProperty(frame_box, "clientHeight", { value: 400 });
    frame_box.append(iframe);
    container = document.createElement("div");
    document.body.append(frame_box, container);
    root = createRoot(container);
  });

  afterEach(() => {
    release();
    act(() => root.unmount());
    vi.restoreAllMocks();
  });

  it("draws nothing and measures nothing until the shield asks for it", () => {
    const measure = add_pixel(rect(40, 20, 1, 1));

    show();

    expect(
      container.querySelector("[data-testid='tracking-pixel-markers']"),
    ).toBeNull();
    expect(measure).not.toHaveBeenCalled();
    expect(marked_total()).toBe("0");

    highlight();
    expect(
      container.querySelectorAll("[data-tracking-pixel-marker]"),
    ).toHaveLength(1);
    expect(measure).toHaveBeenCalled();
    expect(marked_total()).toBe("1");

    release();
    expect(
      container.querySelector("[data-testid='tracking-pixel-markers']"),
    ).toBeNull();
    expect(marked_total()).toBe("0");
  });

  it("draws labelled static dots in an overlay that never takes layout space or prints", () => {
    add_pixel(rect(40, 20, 1, 1));
    add_pixel(rect(8, 300, 1, 1));
    highlight();
    show();

    const layer = container.querySelector<HTMLElement>(
      "[data-testid='tracking-pixel-markers']",
    )!;
    const badges = Array.from(
      layer.querySelectorAll<HTMLElement>("[data-tracking-pixel-marker]"),
    );

    expect(layer.className).toContain("absolute");
    expect(layer.className).toContain("inset-0");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("print:hidden");
    expect(badges.map((badge) => badge.getAttribute("role"))).toEqual([
      "img",
      "img",
    ]);
    expect(badges.map((badge) => badge.getAttribute("aria-label"))).toEqual([
      "Tracking pixel blocked",
      "Tracking pixel blocked",
    ]);
    expect(badges[0].style.left).toBe("40px");
    expect(badges[0].style.width).toBe(`${TRACKING_PIXEL_MARKER_SIZE_PX}px`);
    const dot = badges[0].querySelector<HTMLElement>(
      "[data-tracking-pixel-dot]",
    )!;

    expect(badges[0].querySelector("svg")).toBeNull();
    expect(dot.style.width).toBe(`${TRACKING_PIXEL_DOT_PX}px`);
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.className).toContain("bg-emerald-600");
    expect(dot.className).toContain("rgb(255_255_255)");
    expect(layer.innerHTML).not.toMatch(/animate-|transition/);
    expect(layer.children).toHaveLength(2);
  });

  it("skips hidden pixels and draws nothing when none are visible", () => {
    add_pixel(null);
    highlight();
    show();

    expect(container.querySelector("[data-tracking-pixel-marker]")).toBeNull();
    expect(marked_total()).toBe("0");
  });
});
