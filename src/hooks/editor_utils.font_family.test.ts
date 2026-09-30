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
  DEFAULT_FONT_FAMILY,
  FONT_FAMILY_OPTIONS,
  font_family_option_from_css,
  is_allowed_font_family,
} from "@/hooks/editor_utils";

describe("is_allowed_font_family", () => {
  it("accepts every listed stack and the default", () => {
    expect(is_allowed_font_family(DEFAULT_FONT_FAMILY)).toBe(true);
    for (const option of FONT_FAMILY_OPTIONS) {
      expect(is_allowed_font_family(option.stack)).toBe(true);
    }
  });

  it("rejects anything outside the list", () => {
    expect(is_allowed_font_family("Comic Sans MS")).toBe(false);
    expect(is_allowed_font_family("Arial; color: red")).toBe(false);
    expect(is_allowed_font_family("")).toBe(false);
  });
});

describe("font_family_option_from_css", () => {
  it("maps a computed stack back to its option", () => {
    expect(font_family_option_from_css("Georgia, serif")?.name).toBe(
      "Georgia",
    );
    expect(
      font_family_option_from_css('"Times New Roman", Times, serif')?.name,
    ).toBe("Times New Roman");
    expect(
      font_family_option_from_css("'courier new', Courier, monospace")?.name,
    ).toBe("Courier New");
  });

  it("returns null for the default or unknown fonts", () => {
    expect(font_family_option_from_css("")).toBeNull();
    expect(font_family_option_from_css("-apple-system, sans-serif")).toBeNull();
  });

  it("keeps every stack free of characters that could break a style", () => {
    for (const option of FONT_FAMILY_OPTIONS) {
      expect(option.stack).not.toMatch(/[;"<>]/);
    }
  });
});
