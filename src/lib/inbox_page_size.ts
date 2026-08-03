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
export const MIN_INBOX_PAGE_SIZE = 10;
export const MAX_INBOX_PAGE_SIZE = 100;
export const DEFAULT_INBOX_PAGE_SIZE = 50;
export const INBOX_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export function clamp_inbox_page_size(
  value: unknown,
  fallback: number = DEFAULT_INBOX_PAGE_SIZE,
): number {
  const parsed = typeof value === "number" ? value : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(
    MAX_INBOX_PAGE_SIZE,
    Math.max(MIN_INBOX_PAGE_SIZE, Math.round(parsed)),
  );
}
