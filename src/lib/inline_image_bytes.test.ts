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

import {
  create_inline_image_bytes_counter,
  inline_image_bytes,
} from "./inline_image_bytes";

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

describe("create_inline_image_bytes_counter", () => {
  const one = data_image([1, 2, 3, 4, 5]);
  const two = data_image(Array.from({ length: 1000 }, (_, i) => i % 256));
  const bodies = [
    "",
    "<p>Hello</p>",
    `<p>One</p><img src="${one}">`,
    `<img src="${one}"><img alt="x" src='${two}'><img src="${one}">`,
    `<img SRC = "${two}"><p>typed</p>`,
    `<a href="${one}">link</a><p>${one}</p><img src="${two}">`,
    `<img src="data:image/png;base64,AA*A"><img src="${one}">`,
    `<img src="${one}`,
    '<img src="https://example.com/a.png"><img src="cid:img_1@astermail.org">',
  ];

  it("counts the same bytes as a full scan of the body", () => {
    const count = create_inline_image_bytes_counter();

    for (const html of [...bodies, ...bodies.slice().reverse()]) {
      expect(count(html)).toBe(inline_image_bytes(html));
    }
  });

  it("follows edits that add and remove images", () => {
    const count = create_inline_image_bytes_counter();

    expect(count(`<img src="${two}"><p>a</p>`)).toBe(1000);
    expect(count(`<img src="${two}"><p>ab</p><img src="${one}">`)).toBe(1005);
    expect(count("<p>ab</p>")).toBe(0);
    expect(count(`<p>ab</p><img src="${two}">`)).toBe(1000);
  });
});
