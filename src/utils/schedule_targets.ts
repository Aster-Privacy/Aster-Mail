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
  zoned_next_weekday,
  zoned_with_time,
} from "./date_format";

export function is_future_instant(
  value: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!value || Number.isNaN(value.getTime())) return false;

  return value.getTime() > now.getTime();
}

export const SCHEDULE_MINIMUM_LEAD_MS = 60 * 1000;

export function is_schedulable_instant(
  value: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!value || Number.isNaN(value.getTime())) return false;

  return value.getTime() >= now.getTime() + SCHEDULE_MINIMUM_LEAD_MS;
}

export const SCHEDULE_MORNING_HOUR = 8;

export const SCHEDULE_EVENING_HOUR = 21;

export const SCHEDULE_AFTERNOON_HOUR = 13;

export function get_in_one_hour(now: Date = new Date()): Date {
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export function get_tonight(now: Date = new Date()): Date {
  return zoned_with_time(now, SCHEDULE_EVENING_HOUR, 0);
}

export function get_tomorrow_morning(now: Date = new Date()): Date {
  return zoned_with_time(zoned_add_days(now, 1), SCHEDULE_MORNING_HOUR, 0);
}

export function get_tomorrow_afternoon(now: Date = new Date()): Date {
  return zoned_with_time(zoned_add_days(now, 1), SCHEDULE_AFTERNOON_HOUR, 0);
}

export function get_next_monday_morning(now: Date = new Date()): Date {
  return zoned_with_time(zoned_next_weekday(now, 1), SCHEDULE_MORNING_HOUR, 0);
}

export function build_zoned_datetime(
  date_value: string,
  time_value: string,
): Date | null {
  if (!date_value) return null;

  const [year, month, day] = date_value.split("-").map(Number);
  const [hours, minutes] = time_value.split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return null;
  }

  return date_from_zoned_parts({ year, month, day, hours, minutes });
}
