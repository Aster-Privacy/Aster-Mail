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

const SAMPLE_SIZE = 16;
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

export async function read_logo_tone(blob: Blob): Promise<LogoTone | null> {
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

    return classify_logo_pixels(
      context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
