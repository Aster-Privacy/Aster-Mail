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
export type ListDensity = "compact" | "comfortable";

export function resolve_list_density(value: string | undefined): ListDensity {
  return value === "comfortable" || value === "spacious"
    ? "comfortable"
    : "compact";
}

export function is_compact_density(
  density: string,
  compact_mode: boolean,
): boolean {
  return compact_mode || density === "compact" || density === "Compact";
}

export function list_select_slot_class(
  compact: boolean,
  show_profile_pictures: boolean,
): string {
  if (!show_profile_pictures) return "w-[18px] h-[18px]";

  return compact ? "w-7 h-7" : "w-8 h-8";
}

// The select slot is as wide as the avatars below it, so the 18px checkbox
// has the rest of the slot as padding on both sides. The menu arrow after it
// takes that padding back, keeping it 4px from the checkbox whatever the
// density or profile picture setting.
export function list_select_menu_offset_class(
  compact: boolean,
  show_profile_pictures: boolean,
): string {
  if (!show_profile_pictures) return "ms-1";

  return compact ? "-ms-px" : "-ms-[3px]";
}

export function list_row_intrinsic_height(
  density: string,
  compact_mode: boolean,
  has_attachment: boolean,
): number {
  if (is_compact_density(density, compact_mode)) {
    return has_attachment ? 69 : 41;
  }

  return has_attachment ? 77 : 49;
}
