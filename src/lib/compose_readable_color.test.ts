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
  build_compose_readable_css,
  compose_display_text_color,
  resolve_effective_background,
} from "./compose_readable_color";
import { build_compose_default_block } from "./compose_defaults";

describe("compose_display_text_color", () => {
  it("keeps a stored color that reads on the background", () => {
    expect(compose_display_text_color("#1a1a1a", "#ffffff", "#111827")).toBe(
      "#1a1a1a",
    );
    expect(compose_display_text_color("#ffd54f", "#121212", "#f5f5f5")).toBe(
      "#ffd54f",
    );
  });

  it("uses the theme text color when contrast is below 4.5", () => {
    expect(compose_display_text_color("#1a1a1a", "#121212", "#f5f5f5")).toBe(
      "#f5f5f5",
    );
    expect(compose_display_text_color("#ffffff", "#ffffff", "#111827")).toBe(
      "#111827",
    );
  });

  it("keeps the stored color when a color cannot be read", () => {
    expect(compose_display_text_color("#1a1a1a", "nope", "#f5f5f5")).toBe(
      "#1a1a1a",
    );
  });
});

describe("build_compose_readable_css", () => {
  it("writes nothing when the display color matches the stored color", () => {
    expect(build_compose_readable_css("#1a1a1a", "#1a1a1a")).toBe("");
  });

  it("overrides only inside compose editors, for hex and rgb forms", () => {
    const css = build_compose_readable_css("#1a1a1a", "#f5f5f5");

    expect(css).toContain('[data-compose-editor] [style*="color: #1a1a1a" i]');
    expect(css).toContain('[data-compose-editor] [style*="color: rgb(26, 26, 26)"]');
    expect(css).toContain("color: #f5f5f5 !important;");
  });

  it("matches the block compose writes and leaves the saved html alone", () => {
    const html = build_compose_default_block("normal", "#1a1a1a");
    const host = document.createElement("div");

    host.setAttribute("data-compose-editor", "");
    host.innerHTML = html;
    document.body.appendChild(host);

    const css = build_compose_readable_css("#1a1a1a", "#f5f5f5");
    const selector = css.slice(0, css.indexOf(" {"));
    const block = host.firstElementChild as HTMLElement;

    expect(block.matches(selector)).toBe(true);
    expect(host.innerHTML).toBe(html);
    host.remove();
  });
});

describe("resolve_effective_background", () => {
  it("uses the nearest painted ancestor", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");

    outer.style.backgroundColor = "rgb(18, 18, 18)";
    inner.style.backgroundColor = "transparent";
    outer.appendChild(inner);
    document.body.appendChild(outer);

    expect(resolve_effective_background(inner)).toBe("#121212");
    outer.remove();
  });
});
