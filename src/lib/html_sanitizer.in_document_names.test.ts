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

function render(html: string, sandbox_mode: boolean): HTMLDivElement {
  const container = document.createElement("div");

  container.innerHTML = sanitize_html(`<div><p>${html}</p></div>`, {
    sandbox_mode,
  }).html;

  return container;
}

describe("sanitize_html anchor names in the main document", () => {
  it("prefixes anchor names so they cannot shadow window globals", () => {
    const container = render('<a name="__TAURI_INTERNALS__">a</a>', false);

    expect(container.querySelector("a")?.getAttribute("name")).toBe(
      "aster_anchor___TAURI_INTERNALS__",
    );
  });

  it("prefixes fragment links to match their anchors", () => {
    const container = render(
      '<a href="#part-2">Jump</a><a name="part-2">Part</a>',
      false,
    );

    expect(container.querySelector('a[href="#aster_anchor_part-2"]')).not.toBe(
      null,
    );
    expect(container.querySelector('a[name="aster_anchor_part-2"]')).not.toBe(
      null,
    );
  });

  it("prefixes fragment links that start with whitespace", () => {
    const container = render('<a href="  #part-2">Jump</a>', false);

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "#aster_anchor_part-2",
    );
  });

  it("does not prefix twice when quoted mail is quoted again", () => {
    const container = render(
      '<a href="#aster_anchor_x">Jump</a><a name="aster_anchor_x">X</a>',
      false,
    );

    expect(container.querySelector('a[href="#aster_anchor_x"]')).not.toBe(null);
    expect(container.querySelector('a[name="aster_anchor_x"]')).not.toBe(null);
  });

  it("leaves names and fragments alone inside the sandboxed frame", () => {
    const container = render(
      '<a href="#part-2">Jump</a><a name="part-2">Part</a>',
      true,
    );

    expect(container.querySelector('a[href="#part-2"]')).not.toBe(null);
    expect(container.querySelector('a[name="part-2"]')).not.toBe(null);
  });

  it("prefixes ids so table-of-contents links keep their targets", () => {
    const container = render(
      '<a href="#news">Jump</a><h2 id="news">News</h2><div id="__TAURI_INTERNALS__">x</div>',
      false,
    );

    expect(container.querySelector("h2")?.getAttribute("id")).toBe(
      "aster_anchor_news",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "#aster_anchor_news",
    );
    expect(container.querySelector('[id="__TAURI_INTERNALS__"]')).toBe(null);
    expect(
      container.querySelector('[id="aster_anchor___TAURI_INTERNALS__"]'),
    ).not.toBe(null);
  });

  it("leaves ids alone inside the sandboxed frame", () => {
    const container = render('<h2 id="news">News</h2>', true);

    expect(container.querySelector("h2")?.getAttribute("id")).toBe("news");
  });
});
