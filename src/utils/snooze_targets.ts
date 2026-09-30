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
import {
  date_from_zoned_parts,
  zoned_add_days,
  get_zoned_parts,
  zoned_weekday,
  zoned_with_time,
} from "@/utils/date_format";

export type SnoozeTargetId =
  | "later_today"
  | "tomorrow"
  | "this_weekend"
  | "next_week"
  | "next_month";

export const SNOOZE_MORNING_HOUR = 9;

const LATER_TODAY_OFFSET_HOURS = 4;

const SATURDAY = 6;

function days_until_weekend(day_of_week: number): number {
  return day_of_week === SATURDAY ? 7 : (SATURDAY - day_of_week + 7) % 7;
}

function days_in_month(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function at_morning(date: Date): Date {
  return zoned_with_time(date, SNOOZE_MORNING_HOUR, 0);
}

export function compute_snooze_target(
  id: SnoozeTargetId,
  now: Date = new Date(),
): Date {
  switch (id) {
    case "later_today":
      return new Date(
        now.getTime() + LATER_TODAY_OFFSET_HOURS * 60 * 60 * 1000,
      );
    case "tomorrow":
      return at_morning(zoned_add_days(now, 1));
    case "this_weekend":
      return at_morning(
        zoned_add_days(now, days_until_weekend(zoned_weekday(now))),
      );
    case "next_week":
      return at_morning(zoned_add_days(now, 7));
    case "next_month": {
      const parts = get_zoned_parts(now);
      const year = parts.month === 12 ? parts.year + 1 : parts.year;
      const month = parts.month === 12 ? 1 : parts.month + 1;

      return date_from_zoned_parts({
        year,
        month,
        day: Math.min(parts.day, days_in_month(year, month)),
        hours: SNOOZE_MORNING_HOUR,
        minutes: 0,
      });
    }
  }
}
