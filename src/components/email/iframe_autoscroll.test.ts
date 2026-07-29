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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { start_iframe_autoscroll } from "@/components/email/iframe_autoscroll";

let raf_queue: FrameRequestCallback[] = [];

const flush_frames = (count: number) => {
  for (let i = 0; i < count; i += 1) {
    const queued = raf_queue;

    raf_queue = [];
    queued.forEach((cb) => cb(0));
  }
};

const define_metric = (node: Element, key: string, value: number) => {
  Object.defineProperty(node, key, { value, configurable: true });
};

const build_scene = (scrollable: boolean) => {
  const container = document.createElement("div");

  container.style.overflowY = "auto";
  define_metric(container, "scrollHeight", scrollable ? 5000 : 100);
  define_metric(container, "clientHeight", 100);
  define_metric(container, "scrollWidth", 100);
  define_metric(container, "clientWidth", 100);

  const iframe = document.createElement("iframe");

  container.appendChild(iframe);
  document.body.appendChild(container);
  iframe.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 600, height: 400 }) as DOMRect;

  return { container, iframe };
};

beforeEach(() => {
  raf_queue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    raf_queue.push(cb);

    return raf_queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("start_iframe_autoscroll", () => {
  it("scrolls the nearest scrollable ancestor while the pointer sits below the origin", () => {
    const { container, iframe } = build_scene(true);

    expect(start_iframe_autoscroll(iframe, 100, 100)).toBe(true);

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 400 }),
    );
    flush_frames(3);

    expect(container.scrollTop).toBeGreaterThan(0);
  });

  it("does not scroll while the pointer stays inside the dead zone", () => {
    const { container, iframe } = build_scene(true);

    start_iframe_autoscroll(iframe, 100, 100);
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 105 }),
    );
    flush_frames(3);

    expect(container.scrollTop).toBe(0);
  });

  it("scrolls upward when the pointer sits above the origin", () => {
    const { container, iframe } = build_scene(true);

    container.scrollTop = 500;
    start_iframe_autoscroll(iframe, 100, 300);
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 40 }),
    );
    flush_frames(3);

    expect(container.scrollTop).toBeLessThan(500);
  });

  it("stops on the next mousedown and removes the marker", () => {
    const { container, iframe } = build_scene(true);

    start_iframe_autoscroll(iframe, 100, 100);
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 400 }),
    );
    flush_frames(2);

    const scrolled = container.scrollTop;

    document.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    flush_frames(4);

    expect(container.scrollTop).toBe(scrolled);
    expect(document.body.querySelectorAll("[aria-hidden='true']").length).toBe(
      0,
    );
  });

  it("reports failure when nothing around the frame can scroll", () => {
    const { iframe } = build_scene(false);

    expect(start_iframe_autoscroll(iframe, 10, 10)).toBe(false);
  });
});
