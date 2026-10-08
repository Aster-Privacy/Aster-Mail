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

const h = vi.hoisted(() => ({ method: "direct" }));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => h.method },
}));

import {
  fetch_gallery_image,
  gallery_full_url,
  gallery_thumb_url,
  is_gallery_available,
  load_gallery_manifest,
  parse_gallery_manifest,
} from "./profile_picture_gallery";

describe("parse_gallery_manifest", () => {
  it("keeps well-formed items in known categories", () => {
    const items = parse_gallery_manifest({
      version: 1,
      items: [
        { slug: "aurora_01", category: "aurora" },
        { slug: "deep-space-2", category: "space", width: 1200 },
      ],
    });

    expect(items).toEqual([
      { slug: "aurora_01", category: "aurora", credit: null },
      { slug: "deep-space-2", category: "space", credit: null },
    ]);
  });

  it("drops unsafe slugs, unknown categories, and duplicates", () => {
    const items = parse_gallery_manifest({
      items: [
        { slug: "../secret", category: "space" },
        { slug: "a/b", category: "space" },
        { slug: "https://example.com/x", category: "space" },
        { slug: "", category: "space" },
        { slug: 42, category: "space" },
        { slug: "fine", category: "not_a_category" },
        { slug: "fine", category: "ocean" },
        { slug: "fine", category: "ocean" },
        null,
        "text",
      ],
    });

    expect(items).toEqual([{ slug: "fine", category: "ocean", credit: null }]);
  });

  it("returns an empty list for malformed payloads", () => {
    expect(parse_gallery_manifest(null)).toEqual([]);
    expect(parse_gallery_manifest("nope")).toEqual([]);
    expect(parse_gallery_manifest({})).toEqual([]);
    expect(parse_gallery_manifest({ items: "nope" })).toEqual([]);
  });

  it("keeps a clean credit line", () => {
    const items = parse_gallery_manifest({
      items: [
        { slug: "a", category: "space", credit: "  NASA,   public domain " },
        { slug: "b", category: "space", credit: "Name\u202eevil\nCC BY 4.0" },
        { slug: "c", category: "space", credit: "x".repeat(500) },
        { slug: "d", category: "space", credit: "   " },
        { slug: "e", category: "space", credit: 7 },
        { slug: "f", category: "space" },
      ],
    });

    expect(items.map((item) => item.credit)).toEqual([
      "NASA, public domain",
      "Name evil CC BY 4.0",
      "x".repeat(200),
      null,
      null,
      null,
    ]);
  });

  it("caps the number of items", () => {
    const items = parse_gallery_manifest({
      items: Array.from({ length: 2500 }, (_, index) => ({
        slug: `item_${index}`,
        category: "forest",
      })),
    });

    expect(items).toHaveLength(2000);
  });
});

describe("gallery_thumb_url", () => {
  it("points at the thumbnail for a slug", () => {
    expect(gallery_thumb_url("aurora_01")).toMatch(/\/thumb\/aurora_01\.webp$/);
  });
});

describe("gallery_full_url", () => {
  it("points at the full size image for a slug", () => {
    expect(gallery_full_url("aurora_01")).toBe(
      "https://aster-wallpapers.pages.dev/full/aurora_01.webp",
    );
  });
});

describe("gallery requests on a routed connection", () => {
  afterEach(() => {
    h.method = "direct";
    vi.unstubAllGlobals();
  });

  it.each(["tor", "tor_snowflake", "cdn_relay"])(
    "sends nothing to the gallery host in %s mode",
    async (method) => {
      const fetch_mock = vi.fn();

      vi.stubGlobal("fetch", fetch_mock);
      h.method = method;

      expect(is_gallery_available()).toBe(false);
      await expect(load_gallery_manifest()).rejects.toThrow();
      await expect(fetch_gallery_image("aurora_01")).rejects.toThrow();
      expect(fetch_mock).not.toHaveBeenCalled();
    },
  );

  it("loads the gallery on a direct connection", async () => {
    const fetch_mock = vi.fn(
      async () => new Response(new Blob(["x"]), { status: 200 }),
    );

    vi.stubGlobal("fetch", fetch_mock);

    expect(is_gallery_available()).toBe(true);

    const file = await fetch_gallery_image("aurora_01");

    expect(file.name).toBe("aurora_01.webp");
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock).toHaveBeenCalledWith(
      "https://aster-wallpapers.pages.dev/full/aurora_01.webp",
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
  });
});
