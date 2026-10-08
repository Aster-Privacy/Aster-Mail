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
  FEATURED_GALLERY_SLUGS,
  HIDDEN_GALLERY_SLUGS,
  curate_gallery_items,
} from "@/services/profile_picture_curation";

describe("curate_gallery_items", () => {
  it("puts featured slugs first in rank order and keeps the rest in place", () => {
    const items = [
      { slug: "zeta" },
      { slug: "jupiter" },
      { slug: "alpha" },
      { slug: "blue_marble" },
    ];

    expect(curate_gallery_items(items).map((item) => item.slug)).toEqual([
      "blue_marble",
      "jupiter",
      "zeta",
      "alpha",
    ]);
  });

  it("drops hidden slugs", () => {
    const items = [{ slug: "deep_field" }, { slug: "mars" }];

    expect(curate_gallery_items(items).map((item) => item.slug)).toEqual([
      "mars",
    ]);
  });

  it("never features a hidden slug", () => {
    for (const slug of FEATURED_GALLERY_SLUGS) {
      expect(HIDDEN_GALLERY_SLUGS.has(slug)).toBe(false);
    }
  });
});
