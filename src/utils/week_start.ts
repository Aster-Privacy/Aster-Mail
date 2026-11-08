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
export type WeekStartPreference = "sunday" | "monday" | "saturday";

export type WeekStartIndex = 0 | 1 | 6;

export const WEEK_START_PREFERENCES: readonly WeekStartPreference[] = [
  "sunday",
  "monday",
  "saturday",
];

export const DEFAULT_WEEK_START: WeekStartPreference = "sunday";

const WEEK_START_INDEX: Record<WeekStartPreference, WeekStartIndex> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

let display_week_start: WeekStartPreference | undefined;

export function is_week_start_preference(
  value: unknown,
): value is WeekStartPreference {
  return (
    typeof value === "string" &&
    (WEEK_START_PREFERENCES as readonly string[]).includes(value)
  );
}

export function normalize_week_start(value: unknown): WeekStartPreference {
  return is_week_start_preference(value) ? value : DEFAULT_WEEK_START;
}

export function week_start_index(value: unknown): WeekStartIndex {
  return WEEK_START_INDEX[normalize_week_start(value)];
}

export function set_display_week_start(value: unknown): void {
  display_week_start = is_week_start_preference(value) ? value : undefined;
}

export function app_week_start_index(): WeekStartIndex | undefined {
  return display_week_start === undefined
    ? undefined
    : WEEK_START_INDEX[display_week_start];
}

const WEEKDAY_REFERENCE_DATES: Record<WeekStartPreference, Date> = {
  sunday: new Date(Date.UTC(2023, 0, 1, 12)),
  monday: new Date(Date.UTC(2023, 0, 2, 12)),
  saturday: new Date(Date.UTC(2023, 0, 7, 12)),
};

export function week_start_label(
  value: WeekStartPreference,
  locale?: string,
): string {
  const reference = WEEKDAY_REFERENCE_DATES[value];

  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(reference);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      timeZone: "UTC",
    }).format(reference);
  }
}
