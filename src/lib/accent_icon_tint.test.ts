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
  ACCENT_ICON_IDENTITY_MATRIX,
  accent_icon_matrix,
  parse_icon_color,
} from "@/lib/accent_icon_tint";

type Rgb = [number, number, number];

function apply_matrix(values: string, rgb: Rgb): number[] {
  const m = values.split(" ").map(Number);

  return [0, 1, 2].map((row) => {
    const value =
      m[row * 5] * rgb[0] + m[row * 5 + 1] * rgb[1] + m[row * 5 + 2] * rgb[2];

    return Math.round(Math.min(1, Math.max(0, value)) * 255);
  });
}

const ICON_BLUE: Rgb = [0x1d / 255, 0x58 / 255, 0xee / 255];
const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];

describe("accent_icon_matrix", () => {
  it("keeps the stock blue icons unchanged", () => {
    expect(accent_icon_matrix("#3b82f6", "#ffffff")).toBe(
      ACCENT_ICON_IDENTITY_MATRIX,
    );
  });

  it("paints the icon in the accent and the details in the on-accent color", () => {
    const values = accent_icon_matrix("#22c55e", "#111827");

    expect(apply_matrix(values, ICON_BLUE)).toEqual([0x22, 0xc5, 0x5e]);
    expect(apply_matrix(values, WHITE)).toEqual([0x11, 0x18, 0x27]);
    expect(apply_matrix(values, BLACK)).toEqual([0, 0, 0]);
  });

  it("keeps white details on a dark accent", () => {
    const values = accent_icon_matrix("#a855f7", "#ffffff");

    expect(apply_matrix(values, ICON_BLUE)).toEqual([0xa8, 0x55, 0xf7]);
    expect(apply_matrix(values, WHITE)).toEqual([255, 255, 255]);
  });

  it("uses dark details on the light high contrast accent", () => {
    const values = accent_icon_matrix("#f4f4f5", "#0a0a0a");

    expect(apply_matrix(values, ICON_BLUE)).toEqual([0xf4, 0xf4, 0xf5]);
    expect(apply_matrix(values, WHITE)).toEqual([0x0a, 0x0a, 0x0a]);
  });

  it("falls back to the identity matrix for unreadable colors", () => {
    expect(accent_icon_matrix("", "#ffffff")).toBe(ACCENT_ICON_IDENTITY_MATRIX);
    expect(accent_icon_matrix("var(--x)", "#ffffff")).toBe(
      ACCENT_ICON_IDENTITY_MATRIX,
    );
  });

  it("reads rgb() values", () => {
    expect(parse_icon_color("rgb(255, 0, 51)")).toEqual([1, 0, 0.2]);
  });
});
