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
export const SECOND_FACTOR_CODE_MAX_LENGTH = 20;

export function normalize_second_factor_code(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, SECOND_FACTOR_CODE_MAX_LENGTH);
}

export function is_valid_second_factor_code(code: string): boolean {
  if (/^\d{6}$/.test(code)) return true;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return normalized.length === 8 || normalized.length === 12;
}
