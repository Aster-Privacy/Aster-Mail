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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clear_blocked_image,
  paint_blocked_images,
  prepare_blocked_image,
} from "./blocked_image_placeholder";

import { pt } from "@/lib/i18n/translations/pt";

const pt_labels = {
  image: pt.common.image_blocked,
  tracking_pixel: pt.common.tracking_pixel_blocked,
};

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }

  fire(targets: Element[]) {
    this.callback(
      targets.map((target) => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver,
    );
  }
}

function blocked_doc(markup: string): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = markup;
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const tracking = img.getAttribute("width") === "1";

    img.setAttribute("data-blocked", "true");
    img.setAttribute("data-tracking-pixel", String(tracking));
    prepare_blocked_image(img, tracking);
  }

  return doc;
}

function svg_of(img: Element): string {
  return decodeURIComponent(img.getAttribute("src")!.split(",")[1]);
}

describe("paint_blocked_images", () => {
  let doc: Document;

  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.useFakeTimers();
    doc = document;
    doc.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function mount(markup: string): HTMLImageElement[] {
    const prepared = blocked_doc(markup);

    doc.body.innerHTML = prepared.body.innerHTML;

    return Array.from(doc.querySelectorAll("img"));
  }

  it("relabels sanitizer output in the reader's language", () => {
    const [photo, pixel] = mount(
      '<img src="x" width="320" height="120" alt="Farol"><img src="x" width="1" height="1">',
    );

    expect(photo.getAttribute("aria-label")).toBe("Image blocked: Farol");

    const dispose = paint_blocked_images(doc, pt_labels);

    expect(photo.getAttribute("aria-label")).toBe("Imagem bloqueada: Farol");
    expect(photo.getAttribute("title")).toBe("Imagem bloqueada: Farol");
    expect(svg_of(photo)).toContain(">Imagem bloqueada</text>");
    expect(pixel.getAttribute("aria-label")).toBe(
      "Píxel de rastreio bloqueado",
    );
    expect(svg_of(pixel)).not.toContain("<text");
    dispose();
  });

  it("coalesces resize repaints and drops images that were loaded", () => {
    const [first, second] = mount(
      '<img src="x" width="320" height="120"><img src="x" width="320" height="120">',
    );
    const dispose = paint_blocked_images(doc, pt_labels);
    const observer = FakeResizeObserver.instances[0];
    const set_attribute = vi.spyOn(first, "setAttribute");

    expect(observer.observed.size).toBe(2);
    first.getBoundingClientRect = () => ({ width: 200, height: 80 }) as DOMRect;
    observer.fire([first]);
    observer.fire([first]);
    observer.fire([first, second]);
    expect(set_attribute).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(
      set_attribute.mock.calls.filter(([name]) => name === "src"),
    ).toHaveLength(1);
    expect(svg_of(first)).toContain('viewBox="0 0 200 80"');

    second.removeAttribute("data-blocked");
    clear_blocked_image(second);
    observer.fire([second]);
    vi.advanceTimersByTime(200);
    expect(observer.observed.has(second)).toBe(false);
    dispose();
  });

  it("stops observing when disposed or when the frame unloads", () => {
    mount('<img src="x" width="320" height="120">');

    const dispose = paint_blocked_images(doc, pt_labels);
    const observer = FakeResizeObserver.instances[0];

    observer.fire(Array.from(doc.querySelectorAll("img")));
    window.dispatchEvent(new Event("pagehide"));
    expect(observer.disconnected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    dispose();
  });

  it("restores sender attributes and removes all placeholder metadata", () => {
    const [img] = mount(
      '<img src="x" width="320" height="120" alt="Farol" title="Original">',
    );

    clear_blocked_image(img);
    expect(img.getAttribute("title")).toBe("Original");
    expect(img.hasAttribute("aria-label")).toBe(false);
    expect(
      img
        .getAttributeNames()
        .filter(
          (name) =>
            name.startsWith("data-placeholder-") ||
            name.startsWith("data-original-title") ||
            name.startsWith("data-original-aria"),
        ),
    ).toEqual([]);
  });
});
