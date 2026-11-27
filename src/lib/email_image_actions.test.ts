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

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(async (_command: string, _args: unknown) => undefined),
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "/api/images/v1/proxy",
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));

import {
  UnsafeImageSourceError,
  copy_viewer_image,
  decode_image_data_url,
  image_blob_to_png,
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

const CANVAS_PNG = new Uint8Array([137, 80, 78, 71, 9, 9]);
const BLOB_SRC = `blob:${window.location.origin}/0f1e2d3c-inline`;

interface CanvasStub {
  draws: { width: number; height: number }[];
  image_sources: string[];
  bitmap: ReturnType<typeof vi.fn>;
}

function stub_canvas(options: { bitmap_fails?: boolean } = {}): CanvasStub {
  const stub: CanvasStub = {
    draws: [],
    image_sources: [],
    bitmap: vi.fn(async (_blob: Blob) => {
      if (options.bitmap_fails) throw new Error("decode_failed");

      return { width: 30, height: 20, close: vi.fn() };
    }),
  };

  vi.stubGlobal("createImageBitmap", stub.bitmap);
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = "";
      referrerPolicy = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        stub.image_sources.push(value);
        this.naturalWidth = 40;
        this.naturalHeight = 25;
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const width = this.width;
      const height = this.height;

      return {
        drawImage: () => {
          stub.draws.push({ width, height });
        },
      } as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement["getContext"],
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback, type?: string) => {
      callback(new Blob([CANVAS_PNG], { type: type ?? "image/png" }));
    },
  );

  return stub;
}

interface ClipboardStub {
  write: ReturnType<typeof vi.fn>;
  written: Blob[];
}

function stub_clipboard(): ClipboardStub {
  const written: Blob[] = [];
  const write = vi.fn(async (items: { items: Record<string, unknown> }[]) => {
    written.push(await (items[0].items["image/png"] as Promise<Blob>));
  });

  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(public items: Record<string, unknown>) {}
    },
  );
  vi.stubGlobal("navigator", { ...navigator, clipboard: { write } });

  return { write, written };
}

async function bytes_of(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tauri.invoke.mockReset();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
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

describe("decode_image_data_url", () => {
  it("decodes base64 image bytes with their type", async () => {
    const blob = decode_image_data_url("data:image/jpeg;base64,/9j/4A==");

    expect(blob.type).toBe("image/jpeg");
    expect(await bytes_of(blob)).toEqual(new Uint8Array([255, 216, 255, 224]));
  });

  it("decodes percent-encoded payloads", async () => {
    const blob = decode_image_data_url(
      "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E",
    );

    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).toBe("<svg></svg>");
  });

  it("rejects non-image and malformed payloads", () => {
    expect(() => decode_image_data_url("data:text/html,<b>")).toThrow(
      "image_unavailable",
    );
    expect(() => decode_image_data_url("data:image/png;base64,%%%")).toThrow(
      "image_unavailable",
    );
    expect(() => decode_image_data_url("data:image/png")).toThrow(
      "image_unavailable",
    );
  });
});

describe("image_blob_to_png", () => {
  it("passes PNG bytes through unchanged", async () => {
    const stub = stub_canvas();
    const source = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    });

    const png = await image_blob_to_png(source);

    expect(png).toBe(source);
    expect(stub.bitmap).not.toHaveBeenCalled();
  });

  it.each(["image/jpeg", "image/gif", "image/webp"])(
    "converts %s to PNG through a canvas",
    async (type) => {
      const stub = stub_canvas();

      const png = await image_blob_to_png(
        new Blob([new Uint8Array([7, 7])], { type }),
      );

      expect(png.type).toBe("image/png");
      expect(await bytes_of(png)).toEqual(CANVAS_PNG);
      expect(stub.draws).toEqual([{ width: 30, height: 20 }]);
    },
  );

  it("falls back to an image element when bitmap decoding fails", async () => {
    const stub = stub_canvas({ bitmap_fails: true });
    const create_url = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fallback-image");
    const revoke_url = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const png = await image_blob_to_png(
      new Blob([new Uint8Array([7])], { type: "image/bmp" }),
    );

    expect(png.type).toBe("image/png");
    expect(create_url).toHaveBeenCalledTimes(1);
    expect(stub.image_sources).toEqual(["blob:fallback-image"]);
    expect(stub.draws).toEqual([{ width: 40, height: 25 }]);
    expect(revoke_url).toHaveBeenCalledWith("blob:fallback-image");
  });
});

describe("copy_viewer_image sources", () => {
  it("copies an inline blob image without fetching it", async () => {
    const stub = stub_canvas();
    const clipboard = stub_clipboard();
    const fetch_mock = vi.fn();

    vi.stubGlobal("fetch", fetch_mock);

    await copy_viewer_image(BLOB_SRC);

    expect(fetch_mock).not.toHaveBeenCalled();
    expect(stub.image_sources).toEqual([BLOB_SRC]);
    expect(clipboard.written).toHaveLength(1);
    expect(clipboard.written[0].type).toBe("image/png");
    expect(await bytes_of(clipboard.written[0])).toEqual(CANVAS_PNG);
  });

  it("copies an inline data image without fetching it", async () => {
    const stub = stub_canvas();
    const clipboard = stub_clipboard();
    const fetch_mock = vi.fn();

    vi.stubGlobal("fetch", fetch_mock);

    await copy_viewer_image("data:image/gif;base64,R0lGODlhAQABAAAAACw=");

    expect(fetch_mock).not.toHaveBeenCalled();
    expect(stub.bitmap).toHaveBeenCalledTimes(1);
    expect(clipboard.written[0].type).toBe("image/png");
  });

  it("copies a PNG data image byte for byte", async () => {
    stub_canvas();
    const clipboard = stub_clipboard();

    await copy_viewer_image("data:image/png;base64,iVBORw0KGgo=");

    expect(await bytes_of(clipboard.written[0])).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it("converts a proxied JPEG before writing it", async () => {
    stub_canvas();
    const clipboard = stub_clipboard();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => image_response("image/jpeg")),
    );

    await copy_viewer_image(PROXIED);

    expect(clipboard.written[0].type).toBe("image/png");
    expect(await bytes_of(clipboard.written[0])).toEqual(CANVAS_PNG);
  });

  it("hands the clipboard a pending image so activation is kept", async () => {
    stub_canvas();
    const items: Record<string, unknown>[] = [];
    const write = vi.fn(
      async (entries: { items: Record<string, unknown> }[]) => {
        items.push(entries[0].items);
        await entries[0].items["image/png"];
      },
    );

    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, unknown>) {}
      },
    );
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => image_response("image/webp")),
    );

    const pending = copy_viewer_image(PROXIED);

    expect(write).toHaveBeenCalledTimes(1);
    expect(items[0]["image/png"]).toBeInstanceOf(Promise);
    await pending;
  });

  it("reports a failure when the image cannot be loaded", async () => {
    stub_canvas();
    stub_clipboard();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );

    await expect(copy_viewer_image(PROXIED)).rejects.toThrow(
      "image_unavailable",
    );
  });
});

describe("copy_viewer_image on desktop", () => {
  it("writes the PNG through the native clipboard", async () => {
    stub_canvas();
    const clipboard = stub_clipboard();

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    await copy_viewer_image("data:image/png;base64,iVBORw0KGgo=");

    expect(tauri.invoke).toHaveBeenCalledWith(
      "plugin:clipboard-manager|write_image",
      { image: [137, 80, 78, 71, 13, 10, 26, 10] },
    );
    expect(clipboard.write).not.toHaveBeenCalled();
  });

  it("falls back to the web clipboard when the native write fails", async () => {
    stub_canvas();
    const clipboard = stub_clipboard();

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    tauri.invoke.mockRejectedValueOnce(new Error("denied"));

    await copy_viewer_image(BLOB_SRC);

    expect(tauri.invoke).toHaveBeenCalledTimes(1);
    expect(clipboard.written[0].type).toBe("image/png");
  });
});

describe("save_viewer_image inline sources", () => {
  function capture_download() {
    const saved: Blob[] = [];
    const clicks: string[] = [];

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      saved.push(blob as Blob);

      return "blob:saved-image";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      },
    );

    return { saved, clicks };
  }

  it("saves a data image with its own bytes and extension", async () => {
    const fetch_mock = vi.fn();
    const download = capture_download();

    vi.stubGlobal("fetch", fetch_mock);

    await save_viewer_image("data:image/jpeg;base64,/9j/4A==");

    expect(fetch_mock).not.toHaveBeenCalled();
    expect(download.clicks).toEqual(["image.jpg"]);
    expect(await bytes_of(download.saved[0])).toEqual(
      new Uint8Array([255, 216, 255, 224]),
    );
  });

  it("saves a blob image as PNG without fetching it", async () => {
    stub_canvas();
    const fetch_mock = vi.fn();
    const download = capture_download();

    vi.stubGlobal("fetch", fetch_mock);

    await save_viewer_image(BLOB_SRC);

    expect(fetch_mock).not.toHaveBeenCalled();
    expect(download.clicks).toEqual(["image.png"]);
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
