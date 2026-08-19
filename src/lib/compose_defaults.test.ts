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
  DEFAULT_COMPOSE_FONT_COLOR,
  DEFAULT_COMPOSE_FONT_SIZE,
  build_compose_default_block,
  build_compose_default_style,
  normalize_compose_font_color,
  normalize_compose_font_size,
} from "@/lib/compose_defaults";
import { FONT_SIZE_MAP } from "@/hooks/editor_utils";

describe("normalize_compose_font_size", () => {
  it("keeps every size the editor offers", () => {
    expect(normalize_compose_font_size("small")).toBe("small");
    expect(normalize_compose_font_size("normal")).toBe("normal");
    expect(normalize_compose_font_size("large")).toBe("large");
    expect(normalize_compose_font_size("huge")).toBe("huge");
  });

  it("falls back to normal for an unknown label", () => {
    expect(normalize_compose_font_size("gigantic")).toBe(
      DEFAULT_COMPOSE_FONT_SIZE,
    );
    expect(normalize_compose_font_size("")).toBe(DEFAULT_COMPOSE_FONT_SIZE);
    expect(normalize_compose_font_size("14px")).toBe(DEFAULT_COMPOSE_FONT_SIZE);
  });

  it("falls back to normal for a value that is not a string", () => {
    expect(normalize_compose_font_size(undefined)).toBe(
      DEFAULT_COMPOSE_FONT_SIZE,
    );
    expect(normalize_compose_font_size(null)).toBe(DEFAULT_COMPOSE_FONT_SIZE);
    expect(normalize_compose_font_size(18)).toBe(DEFAULT_COMPOSE_FONT_SIZE);
    expect(normalize_compose_font_size({ size: "large" })).toBe(
      DEFAULT_COMPOSE_FONT_SIZE,
    );
  });

  it("rejects inherited object keys", () => {
    expect(normalize_compose_font_size("toString")).toBe(
      DEFAULT_COMPOSE_FONT_SIZE,
    );
    expect(normalize_compose_font_size("__proto__")).toBe(
      DEFAULT_COMPOSE_FONT_SIZE,
    );
  });
});

describe("normalize_compose_font_color", () => {
  it("accepts a six digit hex color", () => {
    expect(normalize_compose_font_color("#1a73e8")).toBe("#1a73e8");
    expect(normalize_compose_font_color("#1A73E8")).toBe("#1a73e8");
    expect(normalize_compose_font_color("  #ffffff  ")).toBe("#ffffff");
  });

  it("treats an empty value as the theme default", () => {
    expect(normalize_compose_font_color("")).toBe(DEFAULT_COMPOSE_FONT_COLOR);
    expect(normalize_compose_font_color("   ")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
  });

  it("rejects shorthand and alpha hex forms", () => {
    expect(normalize_compose_font_color("#fff")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color("#ffffffff")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color("1a73e8")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
  });

  it("rejects css injection attempts", () => {
    expect(normalize_compose_font_color("red;background:url(x)")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color("#000000;position:fixed")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color('#000000" onload="alert(1)')).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color("expression(alert(1))")).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
  });

  it("rejects a value that is not a string", () => {
    expect(normalize_compose_font_color(undefined)).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
    expect(normalize_compose_font_color(null)).toBe(DEFAULT_COMPOSE_FONT_COLOR);
    expect(normalize_compose_font_color(16711680)).toBe(
      DEFAULT_COMPOSE_FONT_COLOR,
    );
  });
});

describe("build_compose_default_style", () => {
  it("returns nothing when both defaults are neutral", () => {
    expect(build_compose_default_style("normal", "")).toBe("");
  });

  it("maps a size label to the editor pixel value", () => {
    expect(build_compose_default_style("large", "")).toBe(
      `font-size: ${FONT_SIZE_MAP.large}`,
    );
    expect(build_compose_default_style("huge", "")).toBe(
      `font-size: ${FONT_SIZE_MAP.huge}`,
    );
  });

  it("combines size and color", () => {
    expect(build_compose_default_style("small", "#1a73e8")).toBe(
      `font-size: ${FONT_SIZE_MAP.small}; color: #1a73e8`,
    );
  });

  it("drops a hostile color and keeps the valid size", () => {
    expect(build_compose_default_style("large", "red;background:url(x)")).toBe(
      `font-size: ${FONT_SIZE_MAP.large}`,
    );
  });

  it("drops a hostile size and keeps the valid color", () => {
    expect(
      build_compose_default_style("24px}body{display:none", "#112233"),
    ).toBe("color: #112233");
  });
});

describe("build_compose_default_block", () => {
  it("returns nothing when there is no style to apply", () => {
    expect(build_compose_default_block("normal", "")).toBe("");
    expect(build_compose_default_block("bogus", "not-a-color")).toBe("");
  });

  it("wraps an empty line in the styled block", () => {
    expect(build_compose_default_block("large", "#1a73e8")).toBe(
      `<div style="font-size: ${FONT_SIZE_MAP.large}; color: #1a73e8"><br></div>`,
    );
  });

  it("never emits a quote from a hostile color", () => {
    const block = build_compose_default_block("normal", '#000" onload="x');

    expect(block).toBe("");
  });
});
