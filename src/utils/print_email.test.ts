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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

import { format_body, set_print_content } from "./print_email";

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

describe("format_body external content", () => {
  const remote_html =
    '<div><p>hi</p><img src="https://tracker.example/pixel.png" width="200" height="100"></div>';

  it("keeps remote images when the viewer loads them", () => {
    const html = format_body(remote_html, "always");

    expect(html).toContain("tracker.example");
    expect(html).toContain("<img");
  });

  it("blocks remote images when the viewer does not load them", () => {
    const html = format_body(remote_html, "never");

    expect(html).not.toContain("<img");
    expect(html).toContain("hi");
  });

  it("blocks remote images when the viewer would ask first", () => {
    const html = format_body(remote_html, "ask");

    expect(html).not.toContain(' src="https://tracker.example');
    expect(html).toContain('data-blocked="true"');
  });

  it("blocks remote images by default without cached preferences", () => {
    expect(format_body(remote_html)).not.toContain("<img");
  });
});
