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
import { describe, it, expect } from "vitest";

import { sanitize_html } from "./html_sanitizer";
import {
  BACKGROUND_IMAGE_MARK,
  selectors_with_background_image,
} from "./html_sanitizer_background_marks";

const OPTIONS = {
  external_content_mode: "always" as const,
  sandbox_mode: true,
};

describe("background images declared in a stylesheet", () => {
  it("collects the selectors that carry a background image", () => {
    const selectors = selectors_with_background_image(
      ".hero, .banner { background-image: url(cid:hero@aster); } .plain { color: red; }",
    );

    expect(selectors).toEqual([".hero", ".banner"]);
  });

  it("collects selectors from inside a media query", () => {
    const selectors = selectors_with_background_image(
      "@media (max-width: 600px) { .hero { background: url(cid:hero@aster) no-repeat; } }",
    );

    expect(selectors).toEqual([".hero"]);
  });

  it("ignores a rule whose background is only a color", () => {
    expect(
      selectors_with_background_image(".hero { background: #ffffff; }"),
    ).toEqual([]);
  });

  it("marks an element whose background image comes from a class", () => {
    const result = sanitize_html(
      '<html><head><style>.hero{background-image:url("cid:hero@aster")}</style></head><body><div class="hero">hi</div></body></html>',
      OPTIONS,
    );

    expect(result.html).toContain(BACKGROUND_IMAGE_MARK);
  });

  it("leaves an element without a background image unmarked", () => {
    const result = sanitize_html(
      '<html><head><style>.hero{color:#111}</style></head><body><div class="hero">hi</div></body></html>',
      OPTIONS,
    );

    expect(result.html).not.toContain(BACKGROUND_IMAGE_MARK);
  });

  it("survives a selector the browser cannot parse", () => {
    const result = sanitize_html(
      '<html><head><style>.hero:::bogus{background-image:url("cid:hero@aster")}</style></head><body><div class="hero">hi</div></body></html>',
      OPTIONS,
    );

    expect(result.html).toContain("hi");
  });

  it("keeps a nested at-rule selector rather than the wrapper", () => {
    expect(
      selectors_with_background_image(
        "@media screen { .hero { background-image: url(cid:a) } }",
      ),
    ).toEqual([".hero"]);
  });

  it("scans a large stylesheet in linear time", () => {
    const rule = ".hero { background-image: url(cid:a) }";
    const small = `${rule}${" ".repeat(20_000)}`;
    const large = `${rule}${" ".repeat(80_000)}`;

    const small_started = Date.now();

    selectors_with_background_image(small);

    const small_elapsed = Date.now() - small_started;
    const large_started = Date.now();

    expect(selectors_with_background_image(large)).toEqual([".hero"]);

    const large_elapsed = Date.now() - large_started;

    expect(large_elapsed).toBeLessThan(Math.max(small_elapsed * 8, 250));
  });
});
