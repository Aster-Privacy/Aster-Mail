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
export const INACTIVITY_WARNING_FRACTIONS = [0.5, 20 / 24, 23 / 24] as const;

export function get_inactivity_warning_months(
  window_months: number,
): [number, number, number] {
  const [first, second, final] = INACTIVITY_WARNING_FRACTIONS.map(
    (fraction) => window_months * fraction,
  );

  return [first, second, final];
}

export function format_month_amount(months: number): string {
  const rounded = Math.round(months * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
