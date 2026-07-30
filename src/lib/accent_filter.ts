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
const BRAND_ASSET_HUE = 221;
const GRAYSCALE_SATURATION_THRESHOLD = 0.12;

function parse_css_color_channels(color: string): [number, number, number] | null {
  const value = color.trim();

  if (value.startsWith("#")) {
    const normalized = value.slice(1);
    const full =
      normalized.length === 3
        ? normalized
            .split("")
            .map((channel) => channel + channel)
            .join("")
        : normalized;

    if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;

    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }

  const channels = value.match(/-?\d*\.?\d+%?/g);

  if (!channels || channels.length < 3) return null;

  const parsed = channels.slice(0, 3).map((channel) => {
    const amount = Number.parseFloat(channel);

    if (!Number.isFinite(amount)) return 0;

    return Math.min(
      255,
      Math.max(0, channel.endsWith("%") ? (amount / 100) * 255 : amount),
    );
  });

  return [parsed[0], parsed[1], parsed[2]];
}

function get_hue_and_saturation(
  r: number,
  g: number,
  b: number,
): { hue: number; saturation: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { hue: 0, saturation: 0 };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;

  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue *= 60;

  if (hue < 0) hue += 360;

  return { hue, saturation };
}

export function get_brand_asset_filter(accent_css_color: string): string {
  const channels = parse_css_color_channels(accent_css_color);

  if (!channels) return "none";

  const { hue, saturation } = get_hue_and_saturation(...channels);

  if (saturation < GRAYSCALE_SATURATION_THRESHOLD) {
    return "grayscale(1)";
  }

  let rotation = hue - BRAND_ASSET_HUE;

  if (rotation > 180) rotation -= 360;
  if (rotation < -180) rotation += 360;

  if (Math.abs(rotation) < 1) return "none";

  return `hue-rotate(${Math.round(rotation)}deg)`;
}
