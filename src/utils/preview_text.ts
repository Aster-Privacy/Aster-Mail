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
export const PREVIEW_SOURCE_CHAR_CAP = 600;

export const ELLIPSIS = "…";

export function truncate_with_ellipsis(value: string, cap: number): string {
  if (!value) return "";

  const normalized = value.replace(/\s+/g, " ").trim();

  if (cap <= 0) return "";
  if (normalized.length <= cap) return normalized;

  const clipped = normalized.slice(0, cap);
  const last_space = clipped.lastIndexOf(" ");
  const cut = last_space > cap * 0.6 ? clipped.slice(0, last_space) : clipped;

  return cut.trimEnd() + ELLIPSIS;
}

export function build_list_preview(value: string): string {
  return truncate_with_ellipsis(value, PREVIEW_SOURCE_CHAR_CAP);
}
