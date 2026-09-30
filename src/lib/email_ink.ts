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
export const BODY_TEXT_CONTRAST = 4.5;
export const LARGE_TEXT_CONTRAST = 3;

const ACHROMATIC_SATURATION = 0.08;
const NEUTRAL_LINK_HUE = 220;
const NEUTRAL_LINK_SATURATION = 0.32;
const INK_SATURATION_FLOOR = 0.45;
const INK_SATURATION_CEILING = 0.85;
const HOVER_LIGHTNESS_STEP = 0.14;

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalize_hex(value: string | undefined | null): string | null {
  if (!value) return null;

  const raw = value.trim();

  if (!HEX_PATTERN.test(raw)) return null;

  const body = raw.slice(1);

  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
  }

  return `#${body.toLowerCase()}`;
}

function hex_to_rgb(hex: string): [number, number, number] {
  const value = normalize_hex(hex) ?? "#000000";
  const n = Number.parseInt(value.slice(1), 16);

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb_to_hex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function relative_luminance(hex: string): number {
  const [r, g, b] = hex_to_rgb(hex).map((channel) => {
    const srgb = channel / 255;

    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast_ratio(a: string, b: string): number {
  const la = relative_luminance(a);
  const lb = relative_luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hex_to_hsl(hex: string): Hsl {
  const [r255, g255, b255] = hex_to_rgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;

  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);

  if (h < 0) h += 360;

  return { h, s, l };
}

export function hsl_to_hex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor(hp) % 6] ?? [0, 0, 0];

  return rgb_to_hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function adjust_lightness_for_contrast(
  color: string,
  background: string,
  target = BODY_TEXT_CONTRAST,
): string {
  const source = normalize_hex(color);
  const surface = normalize_hex(background);

  if (!source || !surface) return source ?? color;
  if (contrast_ratio(source, surface) >= target) return source;

  const hsl = hex_to_hsl(source);
  const lighten = relative_luminance(surface) < 0.5;
  const step = 0.01;
  let best = source;

  for (let l = hsl.l; lighten ? l <= 1 : l >= 0; l += lighten ? step : -step) {
    const candidate = hsl_to_hex({ ...hsl, l: Math.max(0, Math.min(1, l)) });

    best = candidate;

    if (contrast_ratio(candidate, surface) >= target) return candidate;
  }

  return best;
}

function seed_ink_hsl(accent: string): Hsl {
  const hsl = hex_to_hsl(accent);

  if (hsl.s < ACHROMATIC_SATURATION) {
    return { h: NEUTRAL_LINK_HUE, s: NEUTRAL_LINK_SATURATION, l: hsl.l };
  }

  return {
    ...hsl,
    s: Math.min(INK_SATURATION_CEILING, Math.max(INK_SATURATION_FLOOR, hsl.s)),
  };
}

export function derive_link_ink(
  accent: string,
  background: string,
  target = BODY_TEXT_CONTRAST,
): string {
  const seed = hsl_to_hex(seed_ink_hsl(accent));

  return adjust_lightness_for_contrast(seed, background, target);
}

export function derive_link_hover_ink(
  ink: string,
  background: string,
  target = BODY_TEXT_CONTRAST,
): string {
  const hsl = hex_to_hsl(ink);
  const lighten = relative_luminance(background) < 0.5;
  const shifted = hsl_to_hex({
    ...hsl,
    l: Math.max(
      0,
      Math.min(
        1,
        hsl.l + (lighten ? HOVER_LIGHTNESS_STEP : -HOVER_LIGHTNESS_STEP),
      ),
    ),
  });

  return adjust_lightness_for_contrast(shifted, background, target);
}

export function derive_visited_ink(
  ink: string,
  background: string,
  target = BODY_TEXT_CONTRAST,
): string {
  const hsl = hex_to_hsl(ink);
  const muted = hsl_to_hex({
    ...hsl,
    s: Math.max(0, hsl.s * 0.55),
    l: relative_luminance(background) < 0.5 ? hsl.l - 0.08 : hsl.l + 0.08,
  });

  return adjust_lightness_for_contrast(muted, background, target);
}

export function derive_rail_color(
  accent: string,
  background: string,
  target = LARGE_TEXT_CONTRAST,
): string {
  return derive_link_ink(accent, background, target);
}
