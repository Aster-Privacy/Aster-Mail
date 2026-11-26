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
import type { ImageViewerRequest } from "@/lib/email_image_viewer";

import { afterEach, describe, expect, it, vi } from "vitest";

const open_external_mock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/open_link", () => ({ open_external: open_external_mock }));
vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "/api/images/v1/proxy",
}));

import { attach_iframe_interactions } from "./iframe_interactions";

import { LINK_MENU_EVENT, type LinkMenuDetail } from "@/lib/link_menu_event";

function proxied(name: string): string {
  return `${window.location.origin}/api/images/v1/proxy?url=${encodeURIComponent(`https://cdn.example.com/${name}.png`)}`;
}

function set_metrics(img: HTMLImageElement): void {
  const width = Number(img.getAttribute("width") ?? 400);
  const height = Number(img.getAttribute("height") ?? 200);

  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  Object.defineProperty(img, "complete", { value: true });
  img.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 10,
      left: 20,
      right: 20 + width,
      bottom: 10 + height,
    }) as DOMRect;
}

function mount_message(body_html: string) {
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);

  const frame_doc = document.implementation.createHTMLDocument("message");

  frame_doc.body.innerHTML = body_html;
  frame_doc.querySelectorAll("img").forEach(set_metrics);

  const requests: ImageViewerRequest[] = [];
  const viewer_ref = {
    current: (request: ImageViewerRequest) => {
      requests.push(request);
    },
  };

  attach_iframe_interactions(
    iframe,
    frame_doc,
    frame_doc.body,
    () => {},
    viewer_ref,
  );

  return { frame_doc, requests };
}

function click(element: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail: 1,
    ...init,
  });

  element.dispatchEvent(event);

  return event;
}

function context_menu(element: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 50,
    clientY: 60,
    ...init,
  });
  const details: LinkMenuDetail[] = [];
  const listener = (e: Event) => {
    details.push((e as CustomEvent<LinkMenuDetail>).detail);
  };

  window.addEventListener(LINK_MENU_EVENT, listener);
  element.dispatchEvent(event);
  window.removeEventListener(LINK_MENU_EVENT, listener);

  return { event, details };
}

function capture_external_links(run: () => void): string[] {
  const urls: string[] = [];
  const listener = (event: Event) => {
    urls.push((event as CustomEvent<{ url: string }>).detail.url);
  };

  window.addEventListener("aster-external-link", listener);
  run();
  window.removeEventListener("aster-external-link", listener);

  return urls;
}

afterEach(() => {
  document.body.innerHTML = "";
  open_external_mock.mockClear();
});

describe("images inside a message", () => {
  it("opens a linked image in the viewer instead of the link warning", () => {
    const start_href = window.location.href;
    const { frame_doc, requests } = mount_message(
      `<a href="https://track.example.com/c?id=1"><img id="hero" alt="Spring sale" src="${proxied("hero")}"></a>`,
    );
    const events: MouseEvent[] = [];
    const urls = capture_external_links(() => {
      events.push(click(frame_doc.getElementById("hero")!));
    });

    expect(events[0].defaultPrevented).toBe(true);
    expect(urls).toEqual([]);
    expect(window.location.href).toBe(start_href);
    expect(requests).toHaveLength(1);
    expect(requests[0].index).toBe(0);
    expect(requests[0].items[0].src).toBe(proxied("hero"));
    expect(requests[0].items[0].alt).toBe("Spring sale");
    expect(typeof requests[0].items[0].open_link).toBe("function");
  });

  it("sends Open link through the external link warning", () => {
    const { frame_doc, requests } = mount_message(
      `<a href="https://track.example.com/c?id=1"><img id="hero" src="${proxied("hero")}"></a>`,
    );

    click(frame_doc.getElementById("hero")!);

    const urls = capture_external_links(() => {
      requests[0].items[0].open_link!();
    });

    expect(urls).toEqual(["https://track.example.com/c?id=1"]);
    expect(open_external_mock).not.toHaveBeenCalled();
  });

  it("keeps the link flow for a tracking pixel", () => {
    const { frame_doc, requests } = mount_message(
      `<a href="https://track.example.com/p"><img id="pixel" width="1" height="1" src="${proxied("p")}"></a>`,
    );
    const urls = capture_external_links(() => {
      click(frame_doc.getElementById("pixel")!);
    });

    expect(requests).toHaveLength(0);
    expect(urls).toEqual(["https://track.example.com/p"]);
  });

  it("keeps the link flow for modifier clicks on a linked image", () => {
    const { frame_doc, requests } = mount_message(
      `<a href="https://example.com/a"><img id="hero" src="${proxied("hero")}"></a>`,
    );
    const urls = capture_external_links(() => {
      click(frame_doc.getElementById("hero")!, { ctrlKey: true });
      click(frame_doc.getElementById("hero")!, { metaKey: true });
    });

    expect(requests).toHaveLength(0);
    expect(urls).toEqual(["https://example.com/a", "https://example.com/a"]);
  });

  it("does not open blocked or deferred images", () => {
    const { frame_doc, requests } = mount_message(
      `<img id="blocked" data-blocked="true" class="blocked-remote-image" src="data:image/svg+xml;base64,PHN2Zz4=">` +
        `<img id="deferred" data-deferred-src="${proxied("d")}" src="${proxied("d")}">`,
    );

    click(frame_doc.getElementById("blocked")!);
    click(frame_doc.getElementById("deferred")!);

    expect(requests).toHaveLength(0);
  });

  it("does not open an image whose source skips the proxy", () => {
    const { frame_doc, requests } = mount_message(
      `<img id="raw" src="https://cdn.example.com/raw.png">`,
    );

    click(frame_doc.getElementById("raw")!);

    expect(requests).toHaveLength(0);
  });

  it("collects every viewable image so the viewer can move between them", () => {
    const { frame_doc, requests } = mount_message(
      `<img id="a" src="${proxied("a")}"><img width="1" height="1" src="${proxied("px")}"><img id="b" alt="Second" src="${proxied("b")}">`,
    );

    click(frame_doc.getElementById("b")!);

    expect(requests[0].items.map((item) => item.src)).toEqual([
      proxied("a"),
      proxied("b"),
    ]);
    expect(requests[0].index).toBe(1);
    expect(requests[0].items[0].open_link).toBeUndefined();
  });

  it("marks viewable images for the zoom cursor on hover", () => {
    const { frame_doc } = mount_message(
      `<img id="big" src="${proxied("big")}"><img id="tiny" width="1" height="1" src="${proxied("t")}">`,
    );
    const big = frame_doc.getElementById("big")!;
    const tiny = frame_doc.getElementById("tiny")!;

    big.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    tiny.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));

    expect(big.hasAttribute("data-aster-viewable")).toBe(true);
    expect(tiny.hasAttribute("data-aster-viewable")).toBe(false);
  });
});

describe("image context menu inside a message", () => {
  it("offers image actions and the link for a linked image", () => {
    const { frame_doc, requests } = mount_message(
      `<a href="https://track.example.com/c"><img id="hero" src="${proxied("hero")}"></a>`,
    );
    const { event, details } = context_menu(frame_doc.getElementById("hero")!);

    expect(event.defaultPrevented).toBe(true);
    expect(details).toHaveLength(1);
    expect(details[0].url).toBe("https://track.example.com/c");
    expect(details[0].image?.src).toBe(proxied("hero"));

    details[0].image!.on_view();

    expect(requests).toHaveLength(1);
    expect(requests[0].items[0].src).toBe(proxied("hero"));
  });

  it("offers only image actions for an unlinked image", () => {
    const { frame_doc } = mount_message(`<img id="i" src="${proxied("i")}">`);
    const { details } = context_menu(frame_doc.getElementById("i")!);

    expect(details).toHaveLength(1);
    expect(details[0].url).toBeUndefined();
    expect(details[0].image?.src).toBe(proxied("i"));
  });

  it("leaves out mail links from the image menu", () => {
    const { frame_doc } = mount_message(
      `<a href="mailto:ada@example.com"><img id="i" src="${proxied("i")}"></a>`,
    );
    const { details } = context_menu(frame_doc.getElementById("i")!);

    expect(details[0].url).toBeUndefined();
    expect(details[0].image).toBeDefined();
  });

  it("anchors a keyboard-opened menu to the image", () => {
    const { frame_doc } = mount_message(`<img id="i" src="${proxied("i")}">`);
    const { details } = context_menu(frame_doc.getElementById("i")!, {
      clientX: 0,
      clientY: 0,
    });

    expect(details[0].x).toBe(20);
    expect(details[0].y).toBe(210);
  });

  it("keeps the native menu for skipped images and plain text", () => {
    const { frame_doc } = mount_message(
      `<img id="tiny" width="1" height="1" src="${proxied("t")}"><p id="p">Hello</p>`,
    );
    const tiny = context_menu(frame_doc.getElementById("tiny")!);
    const text = context_menu(frame_doc.getElementById("p")!);

    expect(tiny.event.defaultPrevented).toBe(false);
    expect(tiny.details).toHaveLength(0);
    expect(text.event.defaultPrevented).toBe(false);
    expect(text.details).toHaveLength(0);
  });
});
