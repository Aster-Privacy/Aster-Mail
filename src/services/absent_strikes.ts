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
export const ABSENT_STRIKES_BEFORE_REMOVAL = 2;

export function clear_strikes(
  strikes: Map<string, number>,
  ids: string[],
): void {
  for (const id of ids) {
    strikes.delete(id);
  }
}

export function record_absences(
  strikes: Map<string, number>,
  ids: string[],
  is_known: (id: string) => boolean,
): string[] {
  const confirmed: string[] = [];

  for (const id of ids) {
    if (!is_known(id)) {
      strikes.delete(id);
      continue;
    }

    const count = (strikes.get(id) ?? 0) + 1;

    if (count >= ABSENT_STRIKES_BEFORE_REMOVAL) {
      strikes.delete(id);
      confirmed.push(id);
      continue;
    }

    strikes.set(id, count);
  }

  return confirmed;
}
