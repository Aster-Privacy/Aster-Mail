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
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const SHORT_OR_LONG_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const COLOR_WHEEL_RAINBOW =
  "conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";

export const READABLE_DARK_TEXT = "#111827";
export const READABLE_LIGHT_TEXT = "#ffffff";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalize_hex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const match = SHORT_OR_LONG_HEX.exec(value.trim());

  if (!match) return null;

  const digits = match[1].toLowerCase();
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;

  return `#${expanded}`;
}

export function hex_to_rgb(hex: string): [number, number, number] {
  const normalized = normalize_hex(hex) ?? "#000000";
  const int_value = parseInt(normalized.slice(1), 16);

  return [(int_value >> 16) & 255, (int_value >> 8) & 255, int_value & 255];
}

export function rgb_to_hex(r: number, g: number, b: number): string {
  const to_byte = (v: number) => clamp(Math.round(v), 0, 255);

  return `#${[r, g, b]
    .map((v) => to_byte(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function rgb_to_hsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsv_to_rgb(
  h: number,
  s: number,
  v: number,
): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hue < 60) [rp, gp, bp] = [c, x, 0];
  else if (hue < 120) [rp, gp, bp] = [x, c, 0];
  else if (hue < 180) [rp, gp, bp] = [0, c, x];
  else if (hue < 240) [rp, gp, bp] = [0, x, c];
  else if (hue < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

export function hex_to_hsv(hex: string): Hsv {
  const [r, g, b] = hex_to_rgb(hex);

  return rgb_to_hsv(r, g, b);
}

export function hsv_to_hex(hsv: Hsv): string {
  const [r, g, b] = hsv_to_rgb(hsv.h, hsv.s, hsv.v);

  return rgb_to_hex(r, g, b);
}

export function wheel_point_to_hue_saturation(
  dx: number,
  dy: number,
  radius: number,
): { h: number; s: number } {
  if (radius <= 0) return { h: 0, s: 0 };

  const distance = Math.sqrt(dx * dx + dy * dy);
  const s = clamp(distance / radius, 0, 1);
  let h = (Math.atan2(dx, -dy) * 180) / Math.PI;

  if (h < 0) h += 360;

  return { h: s === 0 ? 0 : h % 360, s };
}

export function hue_saturation_to_wheel_point(
  h: number,
  s: number,
): { x: number; y: number } {
  const radians = (h * Math.PI) / 180;
  const distance = clamp(s, 0, 1);

  return {
    x: 0.5 + (Math.sin(radians) * distance) / 2,
    y: 0.5 - (Math.cos(radians) * distance) / 2,
  };
}

export function is_preset_color(
  value: string | null | undefined,
  presets: readonly string[],
): boolean {
  const normalized = normalize_hex(value);

  if (!normalized) return false;

  return presets.some((preset) => normalize_hex(preset) === normalized);
}

function to_linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function relative_luminance(hex: string): number {
  const [r, g, b] = hex_to_rgb(hex);

  return (
    0.2126 * to_linear(r / 255) +
    0.7152 * to_linear(g / 255) +
    0.0722 * to_linear(b / 255)
  );
}

export function contrast_ratio(a: string, b: string): number {
  const la = relative_luminance(a);
  const lb = relative_luminance(b);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function readable_text_color(
  background: string,
): typeof READABLE_DARK_TEXT | typeof READABLE_LIGHT_TEXT {
  return contrast_ratio(background, READABLE_DARK_TEXT) >=
    contrast_ratio(background, READABLE_LIGHT_TEXT)
    ? READABLE_DARK_TEXT
    : READABLE_LIGHT_TEXT;
}

export function fill_text_color(
  fill: string | null | undefined,
  presets: readonly string[],
  preset_text: string = READABLE_LIGHT_TEXT,
): string {
  const normalized = normalize_hex(fill);

  if (!normalized || is_preset_color(normalized, presets)) return preset_text;

  return readable_text_color(normalized);
}
