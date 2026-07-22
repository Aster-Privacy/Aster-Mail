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
export const DISPLAY_COUNT_CAP = 500;

export function format_capped_count(
  value: number,
  cap: number = DISPLAY_COUNT_CAP,
): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const floored = Math.floor(value);

  if (floored >= cap) return `${cap.toLocaleString()}+`;

  return floored.toLocaleString();
}

export function is_at_or_above_display_cap(
  value: number,
  cap: number = DISPLAY_COUNT_CAP,
): boolean {
  return Number.isFinite(value) && value >= cap;
}
