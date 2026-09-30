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

import {
  FONT_SIZE_MAP,
  FONT_SIZE_INDEX_MAP,
  font_size_label_from_px,
  replace_font_element,
} from "@/hooks/editor_utils";

function build_font(html: string): HTMLElement {
  const host = document.createElement("div");

  host.innerHTML = html;

  return host.firstElementChild as HTMLElement;
}

describe("replace_font_element", () => {
  it("keeps the color when a size is applied to already colored text", () => {
    const font = build_font('<font color="#ff0000" size="5">hello</font>');
    const host = font.parentElement as HTMLElement;

    replace_font_element(font, "18px");

    const span = host.firstElementChild as HTMLElement;

    expect(span.tagName).toBe("SPAN");
    expect(span.style.fontSize).toBe("18px");
    expect(span.style.color).not.toBe("");
    expect(span.textContent).toBe("hello");
    expect(host.querySelector("font")).toBeNull();
  });

  it("keeps the typeface from a face attribute", () => {
    const font = build_font('<font face="Georgia" size="3">hello</font>');

    const span = replace_font_element(font, "14px");

    expect(span.style.fontFamily).toContain("Georgia");
    expect(span.style.fontSize).toBe("14px");
  });

  it("lets an inline style win over the legacy attribute", () => {
    const font = build_font(
      '<font color="#ff0000" size="5" style="color: rgb(0, 0, 255);">hello</font>',
    );

    const span = replace_font_element(font, "18px");

    expect(span.style.color).toBe("rgb(0, 0, 255)");
  });

  it("carries unrelated attributes across", () => {
    const font = build_font('<font class="quoted" size="1">hello</font>');

    const span = replace_font_element(font, "12px");

    expect(span.getAttribute("class")).toBe("quoted");
  });

  it("moves every child node, not just text", () => {
    const font = build_font(
      '<font color="#ff0000" size="5">a<b>b</b><i>c</i></font>',
    );

    const span = replace_font_element(font, "24px");

    expect(span.querySelector("b")?.textContent).toBe("b");
    expect(span.querySelector("i")?.textContent).toBe("c");
    expect(span.style.color).not.toBe("");
  });
});

describe("font_size_label_from_px", () => {
  it("maps every mapped size back to its label", () => {
    expect(font_size_label_from_px(FONT_SIZE_MAP.small)).toBe("small");
    expect(font_size_label_from_px(FONT_SIZE_MAP.normal)).toBe("normal");
    expect(font_size_label_from_px(FONT_SIZE_MAP.large)).toBe("large");
    expect(font_size_label_from_px(FONT_SIZE_MAP.huge)).toBe("huge");
  });

  it("returns null for a size the editor does not offer", () => {
    expect(font_size_label_from_px("15px")).toBeNull();
    expect(font_size_label_from_px("")).toBeNull();
  });
});

describe("FONT_SIZE_INDEX_MAP", () => {
  it("covers every offered size", () => {
    expect(Object.keys(FONT_SIZE_INDEX_MAP).sort()).toEqual(
      Object.keys(FONT_SIZE_MAP).sort(),
    );
  });
});
