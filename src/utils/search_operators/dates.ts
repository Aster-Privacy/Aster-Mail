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
import type {} from "@/lib/i18n/types";
import { format_date_for_operator } from "./query";
import { DateShortcut } from "./types";

import {
  app_locale,
  date_from_zoned_parts,
  get_zoned_parts,
  zoned_add_days,
  zoned_start_of_day,
  zoned_weekday,
} from "@/utils/date_format";

const END_OF_DAY_MS = 24 * 60 * 60 * 1000 - 1;

function end_of_zoned_day(date: Date): Date {
  return new Date(zoned_start_of_day(date).getTime() + END_OF_DAY_MS);
}

export function get_today_start(): Date {
  return zoned_start_of_day(new Date());
}

export function get_today_end(): Date {
  return end_of_zoned_day(new Date());
}

type WeekInfo = { firstDay: number };

type LocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
};

const DEFAULT_FIRST_WEEK_DAY = 1;

export function get_first_week_day(): number {
  try {
    const code =
      app_locale() ?? new Intl.DateTimeFormat().resolvedOptions().locale;
    const locale = new Intl.Locale(code).maximize() as LocaleWithWeekInfo;
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;

    if (info && Number.isInteger(info.firstDay)) {
      return info.firstDay % 7;
    }
  } catch {
    return DEFAULT_FIRST_WEEK_DAY;
  }

  return DEFAULT_FIRST_WEEK_DAY;
}

export function get_week_start(): Date {
  const now = new Date();
  const offset = (zoned_weekday(now) - get_first_week_day() + 7) % 7;

  return zoned_start_of_day(zoned_add_days(now, -offset));
}

export function get_week_end(): Date {
  return end_of_zoned_day(zoned_add_days(get_week_start(), 6));
}

export function get_month_start(): Date {
  const parts = get_zoned_parts(new Date());

  return date_from_zoned_parts({ ...parts, day: 1, hours: 0, minutes: 0 });
}

export function get_month_end(): Date {
  const parts = get_zoned_parts(new Date());
  const next_month_start = date_from_zoned_parts({
    ...parts,
    month: parts.month + 1,
    day: 1,
    hours: 0,
    minutes: 0,
  });

  return end_of_zoned_day(zoned_add_days(next_month_start, -1));
}

export function get_last_week_start(): Date {
  return zoned_add_days(get_week_start(), -7);
}

export function get_last_week_end(): Date {
  return end_of_zoned_day(zoned_add_days(get_week_start(), -1));
}

export function get_last_month_start(): Date {
  const parts = get_zoned_parts(new Date());

  return date_from_zoned_parts({
    ...parts,
    month: parts.month - 1,
    day: 1,
    hours: 0,
    minutes: 0,
  });
}

export function get_last_month_end(): Date {
  return end_of_zoned_day(zoned_add_days(get_month_start(), -1));
}

export function get_yesterday_start(): Date {
  return zoned_start_of_day(zoned_add_days(new Date(), -1));
}

export function get_yesterday_end(): Date {
  return end_of_zoned_day(zoned_add_days(new Date(), -1));
}

export function is_valid_date_shortcut(value: string): boolean {
  const shortcuts: DateShortcut[] = [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
  ];

  return shortcuts.includes(value.toLowerCase() as DateShortcut);
}

export function expand_date_shortcut(
  shortcut: string,
): { date_from: string; date_to: string } | null {
  const lower = shortcut.toLowerCase() as DateShortcut;

  switch (lower) {
    case "today":
      return {
        date_from: format_date_for_operator(get_today_start()),
        date_to: format_date_for_operator(get_today_end()),
      };
    case "yesterday":
      return {
        date_from: format_date_for_operator(get_yesterday_start()),
        date_to: format_date_for_operator(get_yesterday_end()),
      };
    case "this_week":
      return {
        date_from: format_date_for_operator(get_week_start()),
        date_to: format_date_for_operator(get_week_end()),
      };
    case "last_week":
      return {
        date_from: format_date_for_operator(get_last_week_start()),
        date_to: format_date_for_operator(get_last_week_end()),
      };
    case "this_month":
      return {
        date_from: format_date_for_operator(get_month_start()),
        date_to: format_date_for_operator(get_month_end()),
      };
    case "last_month":
      return {
        date_from: format_date_for_operator(get_last_month_start()),
        date_to: format_date_for_operator(get_last_month_end()),
      };
    default:
      return null;
  }
}
