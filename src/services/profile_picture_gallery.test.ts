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
import { describe, expect, it } from "vitest";

import {
  gallery_thumb_url,
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
      { slug: "aurora_01", category: "aurora" },
      { slug: "deep-space-2", category: "space" },
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

    expect(items).toEqual([{ slug: "fine", category: "ocean" }]);
  });

  it("returns an empty list for malformed payloads", () => {
    expect(parse_gallery_manifest(null)).toEqual([]);
    expect(parse_gallery_manifest("nope")).toEqual([]);
    expect(parse_gallery_manifest({})).toEqual([]);
    expect(parse_gallery_manifest({ items: "nope" })).toEqual([]);
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
