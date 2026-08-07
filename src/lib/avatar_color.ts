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
const AVATAR_COLORS = [
  "#1e88e5",
  "#e53935",
  "#43a047",
  "#fb8c00",
  "#8e24aa",
  "#d81b60",
  "#00acc1",
  "#5e35b1",
  "#f4511e",
  "#00897b",
  "#3949ab",
  "#c0ca33",
  "#6d4c41",
  "#039be5",
  "#7cb342",
  "#ff6f00",
] as const;

export function get_avatar_color(identifier: string): string {
  let hash = 0;

  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function to_linear(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

const AVATAR_LUMINANCE_CROSSOVER = 0.55;
const SURFACE_LUMINANCE_CROSSOVER = 0.4;

function get_relative_luminance(hex: string): number | null {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  return 0.2126 * to_linear(r) + 0.7152 * to_linear(g) + 0.0722 * to_linear(b);
}

export function get_contrast_text(hex: string): "#ffffff" | "#111827" {
  const luminance = get_relative_luminance(hex);

  if (luminance === null) return "#ffffff";

  return luminance > AVATAR_LUMINANCE_CROSSOVER ? "#111827" : "#ffffff";
}

export function css_color_to_hex(color: string): string | null {
  const value = color.trim();

  if (value.startsWith("#")) return value;

  const channels = value.match(/-?\d*\.?\d+%?/g);

  if (!channels || channels.length < 3) return null;

  const [r, g, b] = channels.slice(0, 3).map((channel) => {
    const parsed = Number.parseFloat(channel);

    if (!Number.isFinite(parsed)) return 0;

    return Math.min(
      255,
      Math.max(0, channel.endsWith("%") ? (parsed / 100) * 255 : parsed),
    );
  });

  const to_hex = (channel: number) =>
    Math.round(channel).toString(16).padStart(2, "0");

  return `#${to_hex(r)}${to_hex(g)}${to_hex(b)}`;
}

export function get_contrast_text_for_css_color(
  color: string,
): "#ffffff" | "#111827" {
  const hex = css_color_to_hex(color);

  if (!hex) return "#ffffff";

  const luminance = get_relative_luminance(hex);

  if (luminance === null) return "#ffffff";

  return luminance > SURFACE_LUMINANCE_CROSSOVER ? "#111827" : "#ffffff";
}
