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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  GALLERY_THUMB_ROOT_MARGIN,
  GalleryThumb,
} from "@/components/profile/gallery_thumb";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const observers: Array<{
  callback: ObserverCallback;
  options: IntersectionObserverInit | undefined;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

class FakeObserver {
  disconnect = vi.fn();
  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    observers.push({ callback, options, disconnect: this.disconnect });
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount_in_grid(src: string): HTMLDivElement {
  const grid = document.createElement("div");

  grid.className = "profile_picture_grid";
  host = document.createElement("div");
  grid.appendChild(host);
  document.body.appendChild(grid);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(GalleryThumb, { src }));
  });

  return grid;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.parentElement?.remove();
  root = null;
  host = null;
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe("GalleryThumb", () => {
  it("loads at once when the browser cannot observe visibility", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    mount_in_grid("/gallery/thumb/a.webp");

    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "/gallery/thumb/a.webp",
    );
  });

  it("waits until the tile nears the visible part of the grid", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const grid = mount_in_grid("/gallery/thumb/b.webp");
    const img = document.querySelector("img")!;

    expect(img.getAttribute("src")).toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0].options?.root).toBe(grid);
    expect(observers[0].options?.rootMargin).toBe(GALLERY_THUMB_ROOT_MARGIN);

    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(img.getAttribute("src")).toBeNull();

    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(img.getAttribute("src")).toBe("/gallery/thumb/b.webp");
    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
