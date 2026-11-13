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
import {
  DATED_ICON_PANEL_FILL,
  DATED_ICON_TEXT_FILL,
} from "@/lib/dated_calendar_icon";

type Rgb = [number, number, number];
type Matrix3 = [Rgb, Rgb, Rgb];

export const ACCENT_ICON_IDENTITY_MATRIX =
  "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";

const STOCK_ACCENT: Rgb = [59 / 255, 130 / 255, 246 / 255];
const MIN_CROSS_LENGTH = 1e-4;
const MIN_DETERMINANT = 1e-9;

export function parse_icon_color(value: string): Rgb | null {
  const trimmed = value.trim().toLowerCase();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);

  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex[1];

    return [0, 2, 4].map(
      (offset) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255,
    ) as Rgb;
  }

  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);

  if (!rgb) return null;

  const channels = [rgb[1], rgb[2], rgb[3]].map((channel) =>
    Math.min(1, Math.max(0, Number.parseFloat(channel) / 255)),
  );

  if (channels.some((channel) => !Number.isFinite(channel))) return null;

  return channels as Rgb;
}

function cross(a: Rgb, b: Rgb): Rgb {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vector_length(v: Rgb): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function scale(v: Rgb, factor: number): Rgb {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function from_columns(a: Rgb, b: Rgb, c: Rgb): Matrix3 {
  return [
    [a[0], b[0], c[0]],
    [a[1], b[1], c[1]],
    [a[2], b[2], c[2]],
  ];
}

function invert(m: Matrix3): Matrix3 | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const co_a = e * i - f * h;
  const co_b = f * g - d * i;
  const co_c = d * h - e * g;
  const det = a * co_a + b * co_b + c * co_c;

  if (Math.abs(det) < MIN_DETERMINANT) return null;

  return [
    [co_a / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [co_b / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [co_c / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

function multiply(x: Matrix3, y: Matrix3): Matrix3 {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].map(
      (col) =>
        x[row][0] * y[0][col] + x[row][1] * y[1][col] + x[row][2] * y[2][col],
    ),
  ) as Matrix3;
}

function same_color(a: Rgb, b: Rgb): boolean {
  return a.every((channel, index) => Math.abs(channel - b[index]) < 0.5 / 255);
}

function format_value(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

export function accent_icon_matrix(accent: string, on_accent: string): string {
  const accent_rgb = parse_icon_color(accent);
  const on_accent_rgb = parse_icon_color(on_accent);
  const source = parse_icon_color(DATED_ICON_PANEL_FILL);
  const detail = parse_icon_color(DATED_ICON_TEXT_FILL);

  if (!accent_rgb || !on_accent_rgb || !source || !detail) {
    return ACCENT_ICON_IDENTITY_MATRIX;
  }

  if (
    same_color(accent_rgb, STOCK_ACCENT) &&
    same_color(on_accent_rgb, detail)
  ) {
    return ACCENT_ICON_IDENTITY_MATRIX;
  }

  const source_normal = cross(source, detail);
  const target_cross = cross(accent_rgb, on_accent_rgb);
  const target_normal =
    vector_length(target_cross) < MIN_CROSS_LENGTH
      ? source_normal
      : scale(
          target_cross,
          vector_length(source_normal) / vector_length(target_cross),
        );
  const inverse = invert(from_columns(source, detail, source_normal));

  if (!inverse) return ACCENT_ICON_IDENTITY_MATRIX;

  const m = multiply(
    from_columns(accent_rgb, on_accent_rgb, target_normal),
    inverse,
  );

  return [
    ...m.flatMap((row) => [...row.map(format_value), "0", "0"]),
    "0",
    "0",
    "0",
    "1",
    "0",
  ].join(" ");
}
