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

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "/api/images/v1/proxy",
}));

import {
  UnsafeImageSourceError,
  copy_viewer_image,
  load_viewer_image_blob,
  save_viewer_image,
  viewer_image_filename,
} from "./email_image_actions";

const PROXIED = `${window.location.origin}/api/images/v1/proxy?url=${encodeURIComponent("https://cdn.example.com/hero.jpg")}`;

function image_response(type: string): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type }), {
    status: 200,
    headers: { "content-type": type },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("load_viewer_image_blob", () => {
  it("reads the proxied source without a referrer", async () => {
    const fetch_mock = vi.fn(async () => image_response("image/jpeg"));

    vi.stubGlobal("fetch", fetch_mock);

    const blob = await load_viewer_image_blob(PROXIED);

    expect(blob.type).toBe("image/jpeg");
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock).toHaveBeenCalledWith(
      PROXIED,
      expect.objectContaining({
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("never fetches the original remote address", async () => {
    const fetch_mock = vi.fn(async () => image_response("image/png"));

    vi.stubGlobal("fetch", fetch_mock);

    await expect(
      load_viewer_image_blob("https://cdn.example.com/hero.jpg"),
    ).rejects.toBeInstanceOf(UnsafeImageSourceError);
    await expect(
      load_viewer_image_blob("javascript:alert(1)"),
    ).rejects.toBeInstanceOf(UnsafeImageSourceError);
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("rejects a response that is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => image_response("text/html")),
    );

    await expect(load_viewer_image_blob(PROXIED)).rejects.toThrow(
      "image_unavailable",
    );
  });
});

describe("save_viewer_image", () => {
  it("saves the loaded bytes with a matching file name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => image_response("image/webp")),
    );

    const saved: Blob[] = [];
    const create_url = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        saved.push(blob as Blob);

        return "blob:saved-image";
      });
    const clicks: { href: string; download: string }[] = [];
    const click_spy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ href: this.href, download: this.download });
      });

    await save_viewer_image(PROXIED);

    expect(create_url).toHaveBeenCalledTimes(1);
    expect(click_spy).toHaveBeenCalledTimes(1);
    expect(clicks[0]).toEqual({
      href: "blob:saved-image",
      download: "image.webp",
    });
    expect(saved[0].type).toBe("image/webp");
    expect(new Uint8Array(await saved[0].arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("refuses an unsafe source", async () => {
    const fetch_mock = vi.fn(async () => image_response("image/png"));
    const click_spy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    vi.stubGlobal("fetch", fetch_mock);

    await expect(
      save_viewer_image("https://cdn.example.com/hero.jpg"),
    ).rejects.toBeInstanceOf(UnsafeImageSourceError);
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(click_spy).not.toHaveBeenCalled();
  });
});

describe("copy_viewer_image", () => {
  it("refuses an unsafe source before touching the clipboard", async () => {
    const write = vi.fn();

    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, unknown>) {}
      },
    );
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write } });

    await expect(
      copy_viewer_image("https://cdn.example.com/hero.jpg"),
    ).rejects.toBeInstanceOf(UnsafeImageSourceError);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes a PNG of the proxied image to the clipboard", async () => {
    const write = vi.fn(async (items: { items: Record<string, unknown> }[]) => {
      await items[0].items["image/png"];
    });
    const fetch_mock = vi.fn(async () => image_response("image/png"));

    vi.stubGlobal("fetch", fetch_mock);
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, unknown>) {}
      },
    );
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write } });

    await copy_viewer_image(PROXIED);

    expect(write).toHaveBeenCalledTimes(1);
    expect(fetch_mock).toHaveBeenCalledWith(PROXIED, expect.anything());
  });
});

describe("viewer_image_filename", () => {
  it("names the file after the image type", () => {
    expect(viewer_image_filename("image/jpeg")).toBe("image.jpg");
    expect(viewer_image_filename("image/svg+xml; charset=utf-8")).toBe(
      "image.svg",
    );
    expect(viewer_image_filename("application/octet-stream")).toBe("image.png");
  });
});
