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

export const LIST_SELECT_CHECKBOX_PX = 18;
export const LIST_SELECT_CONTROL_PAD_PX = 8;

export interface ListSelectControlLayout {
  slot_px: number;
  inset_px: number;
  menu_offset_px: number;
}

export function list_select_control_layout(
  compact: boolean,
  show_profile_pictures: boolean,
): ListSelectControlLayout {
  const slot_px = !show_profile_pictures
    ? LIST_SELECT_CHECKBOX_PX
    : compact
      ? 28
      : 32;
  const slot_pad = (slot_px - LIST_SELECT_CHECKBOX_PX) / 2;

  return {
    slot_px,
    inset_px: Math.max(0, LIST_SELECT_CONTROL_PAD_PX - slot_pad),
    menu_offset_px: -slot_pad,
  };
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
