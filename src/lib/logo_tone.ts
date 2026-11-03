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
export type LogoTone = "dark" | "light" | "none";

export const LOGO_FILL_STEPS = [
  100, 105, 110, 115, 120, 125, 130, 140, 150,
] as const;

export type LogoFill = (typeof LOGO_FILL_STEPS)[number];

export interface LogoLook {
  tone: LogoTone;
  fill: LogoFill;
}

const SAMPLE_SIZE = 32;
const COVERED_ALPHA = 0.5;
const TILE_COVERAGE = 0.9;
const OPAQUE_COVERAGE = 0.9;
const DARK_LUMINANCE = 0.13;
const LIGHT_LUMINANCE = 0.5;
const MIXED_SHARE = 0.25;

function linear_channel(value: number): number {
  const srgb = value / 255;

  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function classify_logo_pixels(data: ArrayLike<number>): LogoTone {
  const pixel_count = Math.floor(data.length / 4);
  let alpha_sum = 0;
  let luminance_sum = 0;
  let dark_weight = 0;
  let light_weight = 0;

  for (let i = 0; i < pixel_count; i++) {
    const offset = i * 4;
    const alpha = data[offset + 3] / 255;

    if (alpha === 0) continue;

    const luminance =
      0.2126 * linear_channel(data[offset]) +
      0.7152 * linear_channel(data[offset + 1]) +
      0.0722 * linear_channel(data[offset + 2]);

    alpha_sum += alpha;
    luminance_sum += alpha * luminance;
    if (luminance < DARK_LUMINANCE) dark_weight += alpha;
    if (luminance > LIGHT_LUMINANCE) light_weight += alpha;
  }

  if (pixel_count === 0 || alpha_sum === 0) return "none";
  if (alpha_sum / pixel_count >= OPAQUE_COVERAGE) return "none";
  if (
    dark_weight / alpha_sum >= MIXED_SHARE &&
    light_weight / alpha_sum >= MIXED_SHARE
  ) {
    return "none";
  }

  const mean_luminance = luminance_sum / alpha_sum;

  if (mean_luminance < DARK_LUMINANCE) return "dark";
  if (mean_luminance > LIGHT_LUMINANCE) return "light";

  return "none";
}

function is_covered(data: ArrayLike<number>, index: number): boolean {
  return data[index * 4 + 3] / 255 >= COVERED_ALPHA;
}

function floor_fill_step(scale: number): LogoFill {
  let step: LogoFill = LOGO_FILL_STEPS[0];

  for (const candidate of LOGO_FILL_STEPS) {
    if (candidate <= scale * 100 + 1e-6) step = candidate;
  }

  return step;
}

export function measure_logo_tile(
  data: ArrayLike<number>,
  width: number,
  height: number,
): LogoFill | null {
  if (!(width > 0) || !(height > 0) || data.length < width * height * 4) {
    return null;
  }

  let min_x = width;
  let min_y = height;
  let max_x = -1;
  let max_y = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!is_covered(data, y * width + x)) continue;
      if (x < min_x) min_x = x;
      if (x > max_x) max_x = x;
      if (y < min_y) min_y = y;
      if (y > max_y) max_y = y;
    }
  }

  if (max_x < 0) return null;

  const side = Math.max(max_x - min_x + 1, max_y - min_y + 1);
  const radius = side / 2;
  const center_x = width / 2;
  const center_y = height / 2;
  let inside = 0;
  let covered = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - center_x;
      const dy = y + 0.5 - center_y;

      if (dx * dx + dy * dy > radius * radius) continue;
      inside += 1;
      if (is_covered(data, y * width + x)) covered += 1;
    }
  }

  if (inside === 0 || covered / inside < TILE_COVERAGE) return null;

  return floor_fill_step(Math.min(width, height) / side);
}

export function analyze_logo_pixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
): LogoLook {
  const tile_fill = measure_logo_tile(data, width, height);

  if (tile_fill !== null) return { tone: "none", fill: tile_fill };

  return { tone: classify_logo_pixels(data), fill: 100 };
}

export async function read_logo_look(blob: Blob): Promise<LogoLook | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }

  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();

    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");

    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) return null;

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    return analyze_logo_pixels(
      context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
      SAMPLE_SIZE,
      SAMPLE_SIZE,
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
