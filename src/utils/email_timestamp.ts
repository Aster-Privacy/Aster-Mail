//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export function email_timestamp_ms(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || value === "") return 0;

  const parsed = typeof value === "number" ? value : new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

export function compare_timestamps_desc(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  return email_timestamp_ms(b) - email_timestamp_ms(a);
}

export function compare_timestamps_asc(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  return email_timestamp_ms(a) - email_timestamp_ms(b);
}
