//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";
import {
  strip_css_comments,
  strip_css_urls,
  sanitize_style,
} from "./html_sanitizer_css";

describe("strip_css_comments", () => {
  it("returns the input untouched when there is no comment", () => {
    expect(strip_css_comments("color: red")).toBe("color: red");
  });

  it("replaces a comment with a space so tokens do not glue together", () => {
    expect(strip_css_comments("color/*x*/: red")).toBe("color : red");
  });

  it("keeps a comment-like sequence inside a double quoted string", () => {
    expect(strip_css_comments('content: "/*not a comment*/"')).toBe(
      'content: "/*not a comment*/"',
    );
  });

  it("keeps a comment-like sequence inside a single quoted string", () => {
    expect(strip_css_comments("content: '/*keep*/'")).toBe(
      "content: '/*keep*/'",
    );
  });

  it("respects a backslash escaped quote inside a string", () => {
    expect(strip_css_comments('content: "a\\"/*b*/"')).toBe(
      'content: "a\\"/*b*/"',
    );
  });

  it("drops the remainder when a comment is never closed", () => {
    expect(strip_css_comments("color: red; /*unclosed")).toBe("color: red;  ");
  });
});

describe("strip_css_urls", () => {
  it("removes a remote url", () => {
    expect(strip_css_urls("background: url(https://evil.example/p.png)")).toBe(
      "background: none",
    );
  });

  it("removes a remote url hidden behind a comment inside the parens", () => {
    expect(
      strip_css_urls('background: url(/*c*/"https://evil.example/p.png")'),
    ).not.toContain("evil.example");
  });

  it("removes a remote url hidden behind a comment before the parens", () => {
    expect(
      strip_css_urls('background: url/*c*/("https://evil.example/p.png")'),
    ).not.toContain("evil.example");
  });

  it("keeps a cid url so inline attachment images still render", () => {
    expect(strip_css_urls("background: url(cid:logo@aster)")).toContain(
      "cid:logo@aster",
    );
  });

  it("keeps a quoted cid url", () => {
    expect(strip_css_urls('background: url("cid:logo@aster")')).toContain(
      "cid:logo@aster",
    );
  });

  it("keeps a blob url produced by the cid resolver", () => {
    expect(
      strip_css_urls("background: url(blob:https://app.example/abc)"),
    ).toContain("blob:https://app.example/abc");
  });

  it("keeps a fragment url so svg gradients and filters still resolve", () => {
    expect(strip_css_urls("fill: url(#gradient)")).toBe("fill: url(#gradient)");
  });

  it("keeps a safe image data url", () => {
    expect(
      strip_css_urls("background: url(data:image/png;base64,AAAA)"),
    ).toContain("data:image/png");
  });

  it("removes a non image data url", () => {
    expect(
      strip_css_urls("background: url(data:text/html;base64,AAAA)"),
    ).toBe("background: none");
  });
});

describe("sanitize_style", () => {
  it("keeps a cid background outside sandbox mode", () => {
    expect(
      sanitize_style("background-image: url(cid:logo@aster)", false),
    ).toContain("cid:logo@aster");
  });

  it("removes a commented remote background outside sandbox mode", () => {
    expect(
      sanitize_style(
        'background-image: url(/*c*/"https://evil.example/p.png")',
        false,
      ),
    ).not.toContain("evil.example");
  });
});
