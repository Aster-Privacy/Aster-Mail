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
import { hash_utf16 } from "@aster/ui";

import { PROFILE_COLORS } from "@/constants/profile";

export {
  AVATAR_COLORS,
  get_avatar_color,
  get_avatar_color_index,
  get_avatar_key,
  get_contrast_text,
} from "@aster/ui";

export function get_alias_color(address: string): string {
  return PROFILE_COLORS[Math.abs(hash_utf16(address)) % PROFILE_COLORS.length];
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
