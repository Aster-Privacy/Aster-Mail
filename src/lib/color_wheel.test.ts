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
  contrast_ratio,
  fill_text_color,
  hex_to_hsv,
  hex_to_rgb,
  hsv_to_hex,
  hue_saturation_to_wheel_point,
  is_preset_color,
  normalize_hex,
  readable_text_color,
  rgb_to_hex,
  wheel_point_to_hue_saturation,
} from "./color_wheel";

describe("normalize_hex", () => {
  it("lowercases and expands valid input", () => {
    expect(normalize_hex("#ABCDEF")).toBe("#abcdef");
    expect(normalize_hex("#F0a")).toBe("#ff00aa");
    expect(normalize_hex("  12ab9f ")).toBe("#12ab9f");
  });

  it("rejects invalid input", () => {
    expect(normalize_hex("")).toBeNull();
    expect(normalize_hex("#12")).toBeNull();
    expect(normalize_hex("#1234")).toBeNull();
    expect(normalize_hex("#gggggg")).toBeNull();
    expect(normalize_hex("blue")).toBeNull();
    expect(normalize_hex(null)).toBeNull();
    expect(normalize_hex(undefined)).toBeNull();
  });
});

describe("hex and hsv conversion", () => {
  it("converts primaries", () => {
    expect(hex_to_hsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hex_to_hsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hex_to_hsv("#0000ff")).toEqual({ h: 240, s: 1, v: 1 });
    expect(hex_to_hsv("#ffffff")).toEqual({ h: 0, s: 0, v: 1 });
    expect(hex_to_hsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsv_to_hex({ h: 60, s: 1, v: 1 })).toBe("#ffff00");
    expect(hsv_to_hex({ h: 300, s: 1, v: 1 })).toBe("#ff00ff");
    expect(hsv_to_hex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
  });

  it("round trips every sampled hex exactly", () => {
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = rgb_to_hex(r, g, b);

          expect(hsv_to_hex(hex_to_hsv(hex))).toBe(hex);
        }
      }
    }
  });

  it("always outputs lowercase six digit hex", () => {
    expect(rgb_to_hex(255.4, -3, 300)).toBe("#ff00ff");
    expect(hsv_to_hex({ h: 210, s: 0.5, v: 0.5 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(hex_to_rgb("#0af")).toEqual([0, 170, 255]);
  });
});

describe("wheel geometry", () => {
  it("maps the top edge to red and the right edge to hue 90", () => {
    expect(wheel_point_to_hue_saturation(0, -50, 50)).toEqual({ h: 0, s: 1 });
    const right = wheel_point_to_hue_saturation(50, 0, 50);

    expect(right.h).toBeCloseTo(90);
    expect(right.s).toBe(1);
    expect(wheel_point_to_hue_saturation(0, 0, 50)).toEqual({ h: 0, s: 0 });
    expect(wheel_point_to_hue_saturation(0, 200, 50).s).toBe(1);
  });

  it("inverts the thumb position", () => {
    for (const [h, s] of [
      [0, 1],
      [45, 0.3],
      [200, 0.75],
      [315, 1],
    ]) {
      const point = hue_saturation_to_wheel_point(h, s);
      const back = wheel_point_to_hue_saturation(
        (point.x - 0.5) * 100,
        (point.y - 0.5) * 100,
        50,
      );

      expect(back.h).toBeCloseTo(h);
      expect(back.s).toBeCloseTo(s);
    }
  });
});

describe("custom colors", () => {
  const presets = ["#3B82F6", "#ef4444", "#22c55e"];

  it("detects presets case-insensitively", () => {
    expect(is_preset_color("#3b82f6", presets)).toBe(true);
    expect(is_preset_color("#EF4444", presets)).toBe(true);
    expect(is_preset_color("#123456", presets)).toBe(false);
    expect(is_preset_color("", presets)).toBe(false);
  });

  it("keeps a non-preset color through an encode and decode round trip", () => {
    const custom = hsv_to_hex({ h: 173, s: 0.62, v: 0.71 });
    const stored = JSON.stringify({ name: "Projects", color: custom });
    const restored = JSON.parse(stored) as { color: string };

    expect(is_preset_color(custom, presets)).toBe(false);
    expect(normalize_hex(restored.color)).toBe(custom);
    expect(hsv_to_hex(hex_to_hsv(restored.color))).toBe(custom);
  });

  it("picks the text color with the higher WCAG contrast", () => {
    expect(readable_text_color("#ffffff")).toBe("#111827");
    expect(readable_text_color("#ffeb3b")).toBe("#111827");
    expect(readable_text_color("#000000")).toBe("#ffffff");
    expect(readable_text_color("#1e3a8a")).toBe("#ffffff");
    for (const hex of ["#ff0000", "#00aaff", "#7c3aed", "#84cc16"]) {
      const text = readable_text_color(hex);
      const other = text === "#ffffff" ? "#111827" : "#ffffff";

      expect(contrast_ratio(hex, text)).toBeGreaterThanOrEqual(
        contrast_ratio(hex, other),
      );
    }
  });
});

describe("fill_text_color", () => {
  it("keeps the preset text color and adapts for custom fills", () => {
    expect(fill_text_color("#ef4444", ["#ef4444"])).toBe("#ffffff");
    expect(fill_text_color("#fef08a", ["#ef4444"])).toBe("#111827");
    expect(fill_text_color("#1e1b4b", ["#ef4444"])).toBe("#ffffff");
    expect(fill_text_color("nope", ["#ef4444"], "#000000")).toBe("#000000");
  });
});
