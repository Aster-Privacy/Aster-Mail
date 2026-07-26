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
export const MOBILE_WINDOW_MIN_ROWS = 200;
export const MOBILE_WINDOW_OVERSCAN_PX = 1200;
export const MOBILE_ROW_ESTIMATE_PX = 76;

export interface MobileListWindow {
  start: number;
  end: number;
  top_pad: number;
  bottom_pad: number;
}

export interface MobileListWindowInput {
  total: number;
  scroll_top: number;
  viewport_height: number;
  overscan_px?: number;
  average_height?: number;
  measured?: readonly number[];
}

export function full_list_window(total: number): MobileListWindow {
  return { start: 0, end: Math.max(0, total), top_pad: 0, bottom_pad: 0 };
}

export function average_measured_height(
  measured: readonly number[],
  fallback = MOBILE_ROW_ESTIMATE_PX,
): number {
  let sum = 0;
  let count = 0;

  for (const height of measured) {
    if (height > 0) {
      sum += height;
      count++;
    }
  }

  return count > 0 ? sum / count : fallback;
}

export function compute_mobile_list_window({
  total,
  scroll_top,
  viewport_height,
  overscan_px = MOBILE_WINDOW_OVERSCAN_PX,
  average_height = MOBILE_ROW_ESTIMATE_PX,
  measured,
}: MobileListWindowInput): MobileListWindow {
  if (total <= 0) return full_list_window(0);

  const fallback = average_height > 0 ? average_height : MOBILE_ROW_ESTIMATE_PX;
  const height_of = (index: number): number => {
    const height = measured?.[index];

    return height && height > 0 ? height : fallback;
  };

  const top_limit = Math.max(0, scroll_top - overscan_px);
  const bottom_limit = Math.max(
    top_limit + fallback,
    scroll_top + Math.max(0, viewport_height) + overscan_px,
  );

  let offset = 0;
  let index = 0;

  while (index < total) {
    const height = height_of(index);

    if (offset + height > top_limit) break;
    offset += height;
    index++;
  }

  const start = index;
  const top_pad = offset;

  while (index < total && offset < bottom_limit) {
    offset += height_of(index);
    index++;
  }

  const end = Math.max(start + 1, index);
  let bottom_pad = 0;

  for (let tail = end; tail < total; tail++) {
    bottom_pad += height_of(tail);
  }

  return { start, end: Math.min(end, total), top_pad, bottom_pad };
}
