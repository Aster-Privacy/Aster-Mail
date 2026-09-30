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

const LEAD = "<p>lead</p>";
const IMAGE = "https://cdn.example.com/hero.png";
const OPTIONS = { external_content_mode: "always" as const };

describe("image dimensions carried over from html attributes", () => {
  it("keeps the shape of an image that has both dimensions", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${IMAGE}" width="600" height="400" alt="hero">`,
      OPTIONS,
    );

    expect(result.html).toContain("width:600px");
    expect(result.html).toContain("height:auto");
    expect(result.html).toContain("aspect-ratio:600 / 400");
    expect(result.html).not.toContain("height:400px");
  });

  it("still reserves a pixel height when only the height is given", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${IMAGE}" height="12" alt="">`,
      OPTIONS,
    );

    expect(result.html).toContain("height:12px");
    expect(result.html).not.toContain("aspect-ratio");
  });

  it("does not pin a tall height only image to a fixed height", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${IMAGE}" height="400" alt="hero">`,
      OPTIONS,
    );

    expect(result.html).toContain("height:auto");
    expect(result.html).toContain("max-height:400px");
    expect(result.html).not.toMatch(/(?<!max-)height:400px/);
  });

  it("leaves an inline height from the message untouched", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${IMAGE}" width="600" height="400" style="height:400px" alt="hero">`,
      OPTIONS,
    );

    expect(result.html).toContain("height: 400px");
    expect(result.html).not.toContain("aspect-ratio");
  });
});
