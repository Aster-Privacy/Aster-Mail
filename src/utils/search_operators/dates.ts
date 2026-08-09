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
import type { } from "@/lib/i18n/types";
import { format_date_for_operator } from "./query";
import { DateShortcut } from "./types";

export function get_today_start(): Date {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

export function get_today_end(): Date {
  const today = new Date();

  today.setHours(23, 59, 59, 999);

  return today;
}

export function get_week_start(): Date {
  const today = new Date();
  const day_of_week = today.getDay();
  const diff = today.getDate() - day_of_week + (day_of_week === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));

  monday.setHours(0, 0, 0, 0);

  return monday;
}

export function get_week_end(): Date {
  const week_start = get_week_start();
  const sunday = new Date(week_start);

  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return sunday;
}

export function get_month_start(): Date {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export function get_month_end(): Date {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  end.setHours(23, 59, 59, 999);

  return end;
}

export function get_last_week_start(): Date {
  const week_start = get_week_start();
  const last_week = new Date(week_start);

  last_week.setDate(last_week.getDate() - 7);

  return last_week;
}

export function get_last_week_end(): Date {
  const week_start = get_week_start();
  const last_week_end = new Date(week_start);

  last_week_end.setDate(last_week_end.getDate() - 1);
  last_week_end.setHours(23, 59, 59, 999);

  return last_week_end;
}

export function get_last_month_start(): Date {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth() - 1, 1);
}

export function get_last_month_end(): Date {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), 0);

  end.setHours(23, 59, 59, 999);

  return end;
}

export function get_yesterday_start(): Date {
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  return yesterday;
}

export function get_yesterday_end(): Date {
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);

  return yesterday;
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

