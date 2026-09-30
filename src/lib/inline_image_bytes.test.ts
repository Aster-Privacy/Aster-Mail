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
import { describe, expect, it } from "vitest";

import { inline_image_bytes } from "./inline_image_bytes";

function data_image(bytes: number[]): string {
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("inline_image_bytes", () => {
  it("returns zero for a body without pasted images", () => {
    expect(inline_image_bytes("<p>Hello</p>")).toBe(0);
    expect(inline_image_bytes("")).toBe(0);
  });

  it("sums the decoded size of every pasted image", () => {
    const html =
      `<p>One</p><img src="${data_image([1, 2, 3, 4, 5])}">` +
      `<img alt="x" src='${data_image([9])}'>` +
      `<img src="${data_image(Array.from({ length: 1000 }, (_, i) => i % 256))}">`;

    expect(inline_image_bytes(html)).toBe(5 + 1 + 1000);
  });

  it("ignores images that point at remote or cid sources", () => {
    const html =
      '<img src="https://example.com/a.png"><img src="cid:img_1@astermail.org">';

    expect(inline_image_bytes(html)).toBe(0);
  });
});
