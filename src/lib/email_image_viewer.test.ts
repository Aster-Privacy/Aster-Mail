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
import { afterEach, describe, expect, it } from "vitest";

import {
  find_viewer_image,
  is_safe_viewer_src,
  viewer_gallery_for,
} from "./email_image_viewer";
import { DEFERRED_IMAGE_PLACEHOLDER } from "./deferred_proxy_images";

const PROXY = "/api/images/v1/proxy";

function proxied(name: string): string {
  return `${window.location.origin}${PROXY}?url=${encodeURIComponent(`https://cdn.example.com/${name}.png`)}`;
}

function loaded(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  Object.defineProperty(img, "complete", { value: true });
  img.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }) as DOMRect;

  return img;
}

function mount(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = html;
  document.body.appendChild(root);
  root.querySelectorAll("img").forEach((img) => {
    loaded(
      img,
      Number(img.getAttribute("width") ?? 400),
      Number(img.getAttribute("height") ?? 200),
    );
  });

  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("is_safe_viewer_src", () => {
  it("accepts the image proxy, same-origin blobs, and raster data images", () => {
    expect(is_safe_viewer_src(proxied("a"), PROXY)).toBe(true);
    expect(
      is_safe_viewer_src(`blob:${window.location.origin}/1234-abcd`, PROXY),
    ).toBe(true);
    expect(
      is_safe_viewer_src("data:image/png;base64,iVBORw0KGgo=", PROXY),
    ).toBe(true);
    expect(
      is_safe_viewer_src("data:image/svg+xml;base64,PHN2Zz4=", PROXY),
    ).toBe(true);
  });

  it("rejects script, html, foreign blob, and direct remote sources", () => {
    expect(is_safe_viewer_src("javascript:alert(1)", PROXY)).toBe(false);
    expect(
      is_safe_viewer_src("data:text/html;base64,PHNjcmlwdD4=", PROXY),
    ).toBe(false);
    expect(
      is_safe_viewer_src("blob:https://evil.example/1234-abcd", PROXY),
    ).toBe(false);
    expect(
      is_safe_viewer_src(
        `blob:${window.location.origin}.evil.example/1234-abcd`,
        PROXY,
      ),
    ).toBe(false);
    expect(is_safe_viewer_src(`blob:${window.location.origin}/`, PROXY)).toBe(
      false,
    );
    expect(is_safe_viewer_src("https://cdn.example.com/a.png", PROXY)).toBe(
      false,
    );
    expect(
      is_safe_viewer_src(
        `${window.location.origin}/api/other?url=https://cdn.example.com/a.png`,
        PROXY,
      ),
    ).toBe(false);
    expect(is_safe_viewer_src(` ${proxied("a")}`, PROXY)).toBe(false);
    expect(is_safe_viewer_src("", PROXY)).toBe(false);
    expect(is_safe_viewer_src(DEFERRED_IMAGE_PLACEHOLDER, PROXY)).toBe(false);
  });
});

describe("find_viewer_image", () => {
  it("returns a linked image with its link and alt text", () => {
    const root = mount(
      `<a href="https://track.example.com/c"><img id="i" alt=" Spring sale " src="${proxied("hero")}"></a>`,
    );
    const hit = find_viewer_image(root.querySelector("#i"), PROXY);

    expect(hit?.src).toBe(proxied("hero"));
    expect(hit?.alt).toBe("Spring sale");
    expect(hit?.link?.getAttribute("href")).toBe("https://track.example.com/c");
  });

  it("skips tracking pixels, spacers, and small icons", () => {
    const root = mount(
      `<img id="pixel" width="1" height="1" src="${proxied("p")}">` +
        `<img id="spacer" width="600" height="4" src="${proxied("s")}">` +
        `<img id="icon" width="32" height="32" src="${proxied("i")}">`,
    );

    expect(find_viewer_image(root.querySelector("#pixel"), PROXY)).toBeNull();
    expect(find_viewer_image(root.querySelector("#spacer"), PROXY)).toBeNull();
    expect(find_viewer_image(root.querySelector("#icon"), PROXY)).toBeNull();
  });

  it("skips images that act as navigation", () => {
    const root = mount(
      `<button><img id="b" src="${proxied("b")}"></button>` +
        `<a href="#top"><img id="anchor" src="${proxied("a")}"></a>` +
        `<a href="https://example.com"><img id="t" src="${proxied("t")}">Shop now</a>`,
    );

    expect(find_viewer_image(root.querySelector("#b"), PROXY)).toBeNull();
    expect(find_viewer_image(root.querySelector("#anchor"), PROXY)).toBeNull();
    expect(find_viewer_image(root.querySelector("#t"), PROXY)).toBeNull();
  });

  it("never offers blocked, deferred, or failed images", () => {
    const root = mount(
      `<img id="blocked" data-blocked="true" class="blocked-remote-image" src="data:image/svg+xml;base64,PHN2Zz4=">` +
        `<img id="deferred" data-deferred-src="${proxied("d")}" src="${DEFERRED_IMAGE_PLACEHOLDER}">` +
        `<img id="failed" data-load-failed="true" src="${proxied("f")}">`,
    );

    expect(find_viewer_image(root.querySelector("#blocked"), PROXY)).toBeNull();
    expect(
      find_viewer_image(root.querySelector("#deferred"), PROXY),
    ).toBeNull();
    expect(find_viewer_image(root.querySelector("#failed"), PROXY)).toBeNull();
  });

  it("rejects an image whose source bypasses the proxy", () => {
    const root = mount(`<img id="r" src="https://cdn.example.com/raw.png">`);

    expect(find_viewer_image(root.querySelector("#r"), PROXY)).toBeNull();
  });

  it("resolves a focused image-only link to its image", () => {
    const root = mount(
      `<a id="l" href="https://example.com"><img src="${proxied("k")}"></a>`,
    );

    expect(find_viewer_image(root.querySelector("#l"), PROXY)?.src).toBe(
      proxied("k"),
    );
  });
});

describe("viewer_gallery_for", () => {
  it("lists qualifying images in document order without duplicates", () => {
    const root = mount(
      `<img id="a" src="${proxied("a")}">` +
        `<img width="1" height="1" src="${proxied("pixel")}">` +
        `<img id="b" src="${proxied("b")}">` +
        `<img src="${proxied("a")}">`,
    );
    const hit = find_viewer_image(root.querySelector("#b"), PROXY)!;
    const gallery = viewer_gallery_for(hit, root, PROXY);

    expect(gallery.images.map((image) => image.src)).toEqual([
      proxied("a"),
      proxied("b"),
    ]);
    expect(gallery.index).toBe(1);
  });
});
