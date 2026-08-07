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
import { describe, expect, it } from "vitest";

import { set_print_content } from "./print_email";

function render(html: string): HTMLElement {
  const container = document.createElement("div");

  set_print_content(container, html);

  return container;
}

describe("set_print_content", () => {
  it("keeps the readable markup of an email body", () => {
    const container = render(
      '<div class="ap-body"><p>Hello <b>there</b></p><a href="https://example.com">link</a></div>',
    );

    expect(container.querySelector("b")?.textContent).toBe("there");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });

  it("removes inline event handlers", () => {
    const container = render(
      '<img src="https://example.com/a.png" onerror="alert(1)">',
    );

    const img = container.querySelector("img");

    expect(img).not.toBeNull();
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("removes executable url attributes", () => {
    const container = render(
      '<a href="javascript:alert(1)">a</a><a href="JaVaScRiPt&#9;:alert(2)">b</a>',
    );

    for (const anchor of Array.from(container.querySelectorAll("a"))) {
      expect(anchor.getAttribute("href")).toBeNull();
    }
  });

  it("removes script and frame elements", () => {
    const container = render(
      "<p>keep</p><script>alert(1)</script><iframe></iframe><object></object>",
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("object")).toBeNull();
    expect(container.textContent).toContain("keep");
  });

  it("replaces any previous content", () => {
    const container = document.createElement("div");

    set_print_content(container, "<p>first</p>");
    set_print_content(container, "<p>second</p>");

    expect(container.textContent).toBe("second");
  });
});
