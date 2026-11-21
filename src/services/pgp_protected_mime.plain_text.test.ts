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

import { html_to_plain_text } from "./pgp_protected_mime";

import { quotable_source } from "@/lib/html_text";

describe("html_to_plain_text", () => {
  it("leaves out style and script content", () => {
    const text = html_to_plain_text(
      '<html><head><title>subject</title></head><STYLE type="text/css">p { margin: 0; }</STYLE><body><p>hello</p><script>var a = 1;</script><div>world</div></body></html>',
    );

    expect(text).toContain("hello");
    expect(text).toContain("world");
    expect(text).not.toContain("margin");
    expect(text).not.toContain("var a");
    expect(text).not.toContain("subject");
  });

  it("drops an unclosed style block", () => {
    const text = html_to_plain_text("<p>hello</p><style>p{color:red}");

    expect(text).toContain("hello");
    expect(text).not.toContain("color");
  });

  it("keeps elements whose names only start like a hidden one", () => {
    const text = html_to_plain_text("<header>top</header><p>a</p>");

    expect(text).toContain("top");
    expect(text).toContain("a");
  });
});

describe("quotable_source", () => {
  it("prefers the HTML body", () => {
    expect(quotable_source({ body: "text", html_content: "<p>html</p>" })).toBe(
      "<p>html</p>",
    );
  });

  it("falls back to the text body", () => {
    expect(quotable_source({ body: "text" })).toBe("text");
    expect(quotable_source({})).toBe("");
  });
});
