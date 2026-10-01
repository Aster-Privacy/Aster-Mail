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
  html_has_renderable_content,
  readable_text_with_fallback,
  renderable_html_part,
} from "./message_markup";

const TEXT_PART = "Hi there,\n\nA clan is a group of players.";

describe("html_has_renderable_content", () => {
  it("accepts text and real images", () => {
    expect(html_has_renderable_content("<p>Hello</p>")).toBe(true);
    expect(
      html_has_renderable_content(`<img src="https://a.test/b.png" width="600">`),
    ).toBe(true);
  });

  it("rejects markup with nothing to show", () => {
    expect(html_has_renderable_content("")).toBe(false);
    expect(html_has_renderable_content(undefined)).toBe(false);
    expect(
      html_has_renderable_content(
        "<html><head><style>p{color:red}</style></head><body><div><br></div></body></html>",
      ),
    ).toBe(false);
    expect(
      html_has_renderable_content(
        `<div><img src="https://a.test/p.gif" width="1" height="1"></div>`,
      ),
    ).toBe(false);
  });
});

describe("renderable_html_part", () => {
  it("keeps the html part when it has content", () => {
    expect(renderable_html_part("<p>Hello</p>", TEXT_PART)).toBe(
      "<p>Hello</p>",
    );
  });

  it("drops an empty html part when the text part has the message", () => {
    expect(
      renderable_html_part("<html><body><div></div></body></html>", TEXT_PART),
    ).toBeUndefined();
    expect(
      renderable_html_part(
        `<img src="https://a.test/p.gif" width="1" height="1">`,
        TEXT_PART,
      ),
    ).toBeUndefined();
  });

  it("keeps the html part when there is no usable text part", () => {
    const empty_html = "<html><body><div></div></body></html>";

    expect(renderable_html_part(empty_html, "")).toBe(empty_html);
    expect(renderable_html_part(empty_html, undefined)).toBe(empty_html);
    expect(renderable_html_part(empty_html, empty_html)).toBe(empty_html);
    expect(renderable_html_part(empty_html, "<div><br></div>")).toBe(
      empty_html,
    );
    expect(renderable_html_part(undefined, TEXT_PART)).toBeUndefined();
  });
});

describe("readable_text_with_fallback", () => {
  it("returns the readable text when there is some", () => {
    expect(readable_text_with_fallback("<p>Hello</p>", TEXT_PART)).toBe(
      "Hello",
    );
  });

  it("falls back to the full text when a hidden wrapper holds the message", () => {
    expect(
      readable_text_with_fallback(
        `<div style="opacity:0"><p>Hi there</p></div>`,
      ),
    ).toBe("Hi there");
  });

  it("falls back to the text part when the html has no text", () => {
    expect(
      readable_text_with_fallback("<div><br></div>", TEXT_PART),
    ).toBe(TEXT_PART);
    expect(readable_text_with_fallback("<div><br></div>")).toBe("");
  });
});
