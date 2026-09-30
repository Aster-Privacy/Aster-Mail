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

import { strip_html_tags, strip_html_tags_bounded } from "./html_text";

function marketing_html(target_bytes: number, lead = ""): string {
  const cell =
    '<td style="padding:8px"><a href="https://example.com/track/abcdef">Shop the new arrivals</a> and save up to 40% today.</td>';
  const row = `<tr>${cell}${cell}${cell}</tr>`;

  let body = "";

  while (body.length < target_bytes) {
    body += `<table role="presentation"><tbody>${row}${row}</tbody></table>`;
  }

  return `<!doctype html><html><head><style>.x{color:red}</style></head><body>${lead}${body}</body></html>`;
}

describe("strip_html_tags_bounded", () => {
  it("matches the unbounded strip for small documents", () => {
    const html = "<p>Hello <b>there</b></p><div>second line</div>";

    expect(strip_html_tags_bounded(html, 600)).toBe(strip_html_tags(html));
  });

  it("returns the same leading text as the unbounded strip for large documents", () => {
    const html = marketing_html(400 * 1024);
    const bounded = strip_html_tags_bounded(html, 600);
    const full = strip_html_tags(html);

    expect(bounded.length).toBeGreaterThanOrEqual(600);
    expect(full.startsWith(bounded.slice(0, 600))).toBe(true);
  });

  it("escalates past a large leading blob to reach real text", () => {
    const lead = `<img src="data:image/png;base64,${"A".repeat(200 * 1024)}">`;
    const html = `<!doctype html><html><body>${lead}<p>The actual message body starts here and is long enough to satisfy the bound. ${"words ".repeat(
      200,
    )}</p></body></html>`;
    const bounded = strip_html_tags_bounded(html, 600);

    expect(bounded.startsWith("The actual message body starts here")).toBe(
      true,
    );
    expect(strip_html_tags(html).startsWith(bounded.slice(0, 600))).toBe(true);
  });

  it("never yields attribute text when a document is cut inside a tag", () => {
    const attribute_value = "SECRETATTRIBUTE".repeat(2000);

    for (const cut_point of [8100, 8192, 8300, 32700, 33000]) {
      const filler = "<span>x</span>".repeat(Math.floor(cut_point / 14));
      const html = `<!doctype html><html><body>${filler}<img alt="${attribute_value}"><p>${"real body text ".repeat(
        100,
      )}</p></body></html>`;
      const bounded = strip_html_tags_bounded(html, 600);

      expect(bounded).not.toContain("SECRETATTRIBUTE");
      expect(strip_html_tags(html).startsWith(bounded.slice(0, 600))).toBe(
        true,
      );
    }
  });

  it("returns the full strip when the document has less text than the bound", () => {
    const html = `<!doctype html><html><body><p>short</p>${"<span></span>".repeat(
      20000,
    )}</body></html>`;

    expect(strip_html_tags_bounded(html, 600)).toBe(strip_html_tags(html));
  });

  it("handles empty and non-string input", () => {
    expect(strip_html_tags_bounded("", 600)).toBe("");
    expect(strip_html_tags_bounded(null as unknown as string, 600)).toBe("");
  });
});
