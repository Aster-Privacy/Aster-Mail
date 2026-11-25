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
import { useSyncExternalStore } from "react";

import { use_resolved_accent } from "@/lib/resolved_accent";

export const STORAGE_PALETTE_SIZE = 6;
export const MIN_SEGMENT_CONTRAST = 3;
export const MIN_SEGMENT_CONTRAST_HIGH = 4.5;
export const MIN_NORMAL_DELTA = 0.1;
export const MIN_CVD_DELTA = 0.045;

type Rgb = [number, number, number];
type Lab = [number, number, number];

export type CvdKind = "protan" | "deutan" | "tritan";

interface SlotSpec {
  hue_offset: number;
  dark_lightness: number;
  light_lightness: number;
}

const SLOT_SPECS: SlotSpec[] = [
  { hue_offset: 35, dark_lightness: 0.84, light_lightness: 0.44 },
  { hue_offset: -40, dark_lightness: 0.7, light_lightness: 0.66 },
  { hue_offset: 180, dark_lightness: 0.86, light_lightness: 0.62 },
  { hue_offset: 110, dark_lightness: 0.72, light_lightness: 0.5 },
  { hue_offset: -110, dark_lightness: 0.8, light_lightness: 0.56 },
];

const HUE_STEPS = [0, -10, 10, -20, 20, -30, 30];
const LIGHTNESS_STEP = 0.03;
const LIGHTNESS_STEP_COUNT = 6;
const NEUTRAL_HUE = 259;

const CVD_MATRICES: Record<CvdKind, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const CVD_KINDS: CvdKind[] = ["protan", "deutan", "tritan"];

function clamp_unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function to_linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function from_linear(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function parse_hex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) return null;

  const value = match[1];

  return [0, 2, 4].map(
    (start) => parseInt(value.slice(start, start + 2), 16) / 255,
  ) as Rgb;
}

function format_hex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((channel) =>
        Math.round(clamp_unit(channel) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function linear_of(hex: string): Rgb {
  const rgb = parse_hex(hex) ?? [0, 0, 0];

  return rgb.map(to_linear) as Rgb;
}

function linear_to_oklab([r, g, b]: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklab_to_linear([lightness, a, b]: Lab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function hex_to_oklab(hex: string): Lab {
  return linear_to_oklab(linear_of(hex));
}

export function hex_to_oklch(hex: string): [number, number, number] {
  const [lightness, a, b] = hex_to_oklab(hex);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

  return [lightness, Math.hypot(a, b), hue];
}

function in_gamut(rgb: Rgb): boolean {
  return rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
}

function linear_to_hex(rgb: Rgb): string {
  return format_hex(
    rgb.map((channel) => from_linear(clamp_unit(channel))) as Rgb,
  );
}

export function oklch_to_hex(
  lightness: number,
  chroma: number,
  hue: number,
): string {
  const radians = (hue * Math.PI) / 180;

  for (let step = 0; step < 60; step++) {
    const current = chroma - (chroma / 60) * step;
    const rgb = oklab_to_linear([
      lightness,
      current * Math.cos(radians),
      current * Math.sin(radians),
    ]);

    if (in_gamut(rgb)) return linear_to_hex(rgb);
  }

  return linear_to_hex(oklab_to_linear([lightness, 0, 0]));
}

function relative_luminance(hex: string): number {
  const [r, g, b] = linear_of(hex);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast_of(first: string, second: string): number {
  const x = relative_luminance(first);
  const y = relative_luminance(second);

  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function simulate_cvd(hex: string, kind: CvdKind): string {
  const [r, g, b] = linear_of(hex);
  const simulated = CVD_MATRICES[kind].map((row) =>
    clamp_unit(row[0] * r + row[1] * g + row[2] * b),
  ) as Rgb;

  return linear_to_hex(simulated);
}

export function color_delta(first: string, second: string): number {
  const x = hex_to_oklab(first);
  const y = hex_to_oklab(second);

  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function cvd_delta(first: string, second: string): number {
  let lowest = Infinity;

  for (const kind of CVD_KINDS) {
    lowest = Math.min(
      lowest,
      color_delta(simulate_cvd(first, kind), simulate_cvd(second, kind)),
    );
  }

  return lowest;
}

function separation(first: string, second: string): number {
  return Math.min(
    color_delta(first, second) / MIN_NORMAL_DELTA,
    cvd_delta(first, second) / MIN_CVD_DELTA,
  );
}

export interface StoragePaletteInput {
  accent: string;
  surface: string;
  is_dark: boolean;
  high_contrast: boolean;
}

function readable_accent(
  accent: string,
  surface: string,
  is_dark: boolean,
  minimum: number,
): string {
  const [start_lightness, chroma, hue] = hex_to_oklch(accent);
  let lightness = start_lightness;
  let color = accent;

  for (
    let step = 0;
    step < 100 && contrast_of(color, surface) < minimum;
    step++
  ) {
    lightness += is_dark ? 0.01 : -0.01;
    color = oklch_to_hex(lightness, chroma, hue);
  }

  return color;
}

export function build_storage_palette(input: StoragePaletteInput): string[] {
  const accent = parse_hex(input.accent)
    ? input.accent.toLowerCase()
    : "#3b82f6";
  const surface = parse_hex(input.surface)
    ? input.surface.toLowerCase()
    : input.is_dark
      ? "#121212"
      : "#ffffff";
  const minimum = input.high_contrast
    ? MIN_SEGMENT_CONTRAST_HIGH
    : MIN_SEGMENT_CONTRAST;
  const [, accent_chroma, accent_hue] = hex_to_oklch(accent);
  const base_hue = accent_chroma < 0.02 ? NEUTRAL_HUE : accent_hue;
  const near_gray = accent_chroma < 0.06;
  const chroma = near_gray
    ? input.is_dark
      ? 0.11
      : 0.12
    : input.is_dark
      ? 0.15
      : 0.17;
  const palette = [readable_accent(accent, surface, input.is_dark, minimum)];

  for (const spec of SLOT_SPECS) {
    const target = input.is_dark ? spec.dark_lightness : spec.light_lightness;
    let best: string | null = null;
    let best_score = -Infinity;

    for (const hue_step of HUE_STEPS) {
      for (
        let index = -LIGHTNESS_STEP_COUNT;
        index <= LIGHTNESS_STEP_COUNT;
        index++
      ) {
        const lightness_step = index * LIGHTNESS_STEP;
        const lightness = target + lightness_step;

        if (lightness < 0.3 || lightness > 0.94) continue;

        const hue = (base_hue + spec.hue_offset + hue_step + 720) % 360;
        const candidate = oklch_to_hex(lightness, chroma, hue);

        if (contrast_of(candidate, surface) < minimum) continue;

        let closest = Infinity;

        for (const chosen of palette) {
          closest = Math.min(closest, separation(candidate, chosen));
        }

        const score =
          Math.min(1, closest) -
          0.002 * Math.abs(hue_step) -
          0.8 * Math.abs(lightness_step);

        if (score > best_score) {
          best_score = score;
          best = candidate;
        }
      }
    }

    palette.push(
      best ??
        oklch_to_hex(target, chroma, (base_hue + spec.hue_offset + 720) % 360),
    );
  }

  return palette;
}

function read_high_contrast(): boolean {
  if (typeof document === "undefined") return false;

  return document.documentElement.classList.contains("high-contrast");
}

function subscribe_high_contrast(listener: () => void): () => void {
  if (
    typeof document === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return () => {};
  }

  const observer = new MutationObserver(listener);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}

const palette_cache = new Map<string, string[]>();

export function use_storage_palette(): string[] {
  const { accent, surface, is_dark } = use_resolved_accent();
  const high_contrast = useSyncExternalStore(
    subscribe_high_contrast,
    read_high_contrast,
    read_high_contrast,
  );
  const key = `${accent}|${surface}|${is_dark}|${high_contrast}`;
  const cached = palette_cache.get(key);

  if (cached) return cached;

  const palette = build_storage_palette({
    accent,
    surface,
    is_dark,
    high_contrast,
  });

  palette_cache.set(key, palette);

  return palette;
}
