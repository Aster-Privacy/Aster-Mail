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

import { sanitize_html } from "./html_sanitizer";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REMOTE = "https://shop.example.com/products/lamp.jpg";

function sanitize(source: string, mode: "ask" | "never" | "always" = "ask") {
  const result = sanitize_html(source, {
    external_content_mode: mode,
    sandbox_mode: true,
  });

  return {
    result,
    doc: new DOMParser().parseFromString(result.html, "text/html"),
  };
}

describe("images without a source", () => {
  it.each([
    ["an empty src", '<img src="" alt="Image of " width="66">'],
    ["a whitespace src", '<img src="   " alt="Image of " width="66">'],
    ["no src", '<img alt="Image of " width="66">'],
    ["a rejected data url", '<img src="data:text/html,hi" alt="Image of ">'],
    ["a rejected scheme", '<img src="javascript:alert(1)" alt="Image of ">'],
  ])("drops an image with %s", (_label, img) => {
    for (const mode of ["ask", "never", "always"] as const) {
      const { result, doc } = sanitize(
        `<table><tr><td>${img}</td><td>Desk lamp</td></tr></table>`,
        mode,
      );

      expect(doc.querySelector("img")).toBeNull();
      expect(result.html).not.toContain("Image of");
      expect(result.html).toContain("Desk lamp");
      expect(result.external_content.blocked_count).toBe(0);
    }
  });

  it("keeps blocking real remote images next to a sourceless one", () => {
    const { result, doc } = sanitize(
      `<img src="${REMOTE}" alt="Image of " width="66"><img src="" alt="Image of " width="66">`,
    );
    const images = doc.querySelectorAll("img");

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("data-blocked")).toBe("true");
    expect(images[0].getAttribute("data-original-src")).toBe(REMOTE);
    expect(result.external_content.blocked_count).toBe(1);
  });

  it("keeps inline cid and data images", () => {
    const { doc } = sanitize(
      `<img src="cid:logo@example.com" alt="Logo"><img src="${PNG}" alt="Dot">`,
    );
    const images = doc.querySelectorAll("img");

    expect(images).toHaveLength(2);
    expect(images[0].getAttribute("src")).toBe("cid:logo@example.com");
    expect(images[1].getAttribute("src")).toBe(PNG);
  });

  it("keeps an image whose srcset provides the source", () => {
    const { doc } = sanitize(`<img src="" srcset="${PNG} 2x" alt="Dot">`);

    expect(doc.querySelector("img")?.getAttribute("srcset")).toBe(`${PNG} 2x`);
  });

  it("keeps an image whose picture source provides the source", () => {
    const { doc } = sanitize(
      '<picture><source srcset="cid:hero@example.com"><img src="" alt="Hero"></picture>',
    );

    expect(doc.querySelector("picture img")).not.toBeNull();
    expect(doc.querySelector("source")?.getAttribute("srcset")).toBe(
      "cid:hero@example.com",
    );
  });
});
