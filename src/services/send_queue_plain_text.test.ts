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

import { plain_text_to_html } from "./send_queue_encryption";

describe("plain_text_to_html", () => {
  it("converts newlines to line breaks", () => {
    expect(plain_text_to_html("a\nb")).toBe("a<br>b");
  });

  it("escapes angle brackets so plain text cannot become markup", () => {
    expect(plain_text_to_html("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
  });

  it("keeps a mathematical comparison readable", () => {
    expect(plain_text_to_html("a < b > c")).toBe("a &lt; b &gt; c");
  });

  it("leaves an existing entity alone so escaped input is not escaped twice", () => {
    expect(plain_text_to_html("a &amp; b")).toBe("a &amp; b");
  });

  it("returns an empty string unchanged", () => {
    expect(plain_text_to_html("")).toBe("");
  });
});
