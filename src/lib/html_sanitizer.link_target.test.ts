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

import { sanitize_html } from "./html_sanitizer";

function first_anchor(html: string): HTMLAnchorElement {
  const container = document.createElement("div");

  container.innerHTML = sanitize_html(`<div><p>${html}</p></div>`).html;
  const anchor = container.querySelector("a");

  if (!anchor) throw new Error("no anchor survived sanitizing");

  return anchor;
}

describe("sanitize_html link targets", () => {
  it("marks an http link so activation becomes a new window request", () => {
    const anchor = first_anchor('<a href="https://example.com/a">go</a>');

    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("overrides a target the message supplied itself", () => {
    const anchor = first_anchor(
      '<a href="https://example.com/a" target="_self">go</a>',
    );

    expect(anchor.getAttribute("target")).toBe("_blank");
  });

  it("marks a mailto link so the desktop handler receives it", () => {
    const anchor = first_anchor('<a href="mailto:someone@example.com">go</a>');

    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("href")).toBe("mailto:someone@example.com");
  });

  it("keeps the destination of a tracked link after cleaning", () => {
    const anchor = first_anchor(
      '<a href="https://example.com/a?utm_source=x">go</a>',
    );

    expect(anchor.getAttribute("href")).toBe("https://example.com/a");
    expect(anchor.getAttribute("target")).toBe("_blank");
  });
});
