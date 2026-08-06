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
import type { TranslationKey } from "@/lib/i18n/types";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;
type DateFormatPreference = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
type TimeFormatPreference = "12h" | "24h";

export interface FormatOptions {
  date_format: DateFormatPreference;
  time_format: TimeFormatPreference;
}

const DEFAULT_OPTIONS: FormatOptions = {
  date_format: "MM/DD/YYYY",
  time_format: "12h",
};

let display_time_zone: string | undefined;

export function set_display_time_zone(zone: string | undefined): void {
  if (!zone || zone === "auto") {
    display_time_zone = undefined;
    return;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    display_time_zone = zone;
  } catch {
    display_time_zone = undefined;
  }
}

export function get_display_time_zone(): string | undefined {
  return display_time_zone;
}

function zoned(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return display_time_zone ? { ...opts, timeZone: display_time_zone } : opts;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

function get_zoned_parts(date: Date): ZonedParts {
  if (!display_time_zone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: display_time_zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hours: read("hour") % 24,
    minutes: read("minute"),
  };
}

function day_key(date: Date): string {
  const p = get_zoned_parts(date);

  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function format_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const parts = get_zoned_parts(date);
  const day = pad(parts.day);
  const month = pad(parts.month);
  const year = parts.year;

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "MM/DD/YYYY":
    default:
      return `${month}/${day}/${year}`;
  }
}

export function format_time(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const zoned_parts = get_zoned_parts(date);
  const hours = zoned_parts.hours;
  const minutes = pad(zoned_parts.minutes);

  if (options.time_format === "24h") {
    return `${pad(hours)}:${minutes}`;
  }

  const parts = new Intl.DateTimeFormat(undefined, zoned({
    hour: "numeric",
    hour12: true,
  })).formatToParts(date);
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? (hours >= 12 ? "PM" : "AM");
  const hours_12 = hours % 12 || 12;

  return `${hours_12}:${minutes} ${period}`;
}

export function format_date_short(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  include_year = false,
): string {
  const parts = get_zoned_parts(date);
  const day = parts.day;
  const month = new Intl.DateTimeFormat(undefined, zoned({ month: "short" })).format(date);
  const year = include_year ? ` ${parts.year}` : "";

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${day} ${month}${year}`;
    case "YYYY-MM-DD":
      return `${month} ${day}${year}`;
    case "MM/DD/YYYY":
    default:
      return `${month} ${day}${year}`;
  }
}

export function format_weekday_short(date: Date): string {
  return new Intl.DateTimeFormat(undefined, zoned({ weekday: "short" })).format(date);
}

export function format_full_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const weekday = new Intl.DateTimeFormat(undefined, zoned({ weekday: "long" })).format(date);
  const month = new Intl.DateTimeFormat(undefined, zoned({ month: "long" })).format(date);
  const parts = get_zoned_parts(date);
  const day = parts.day;
  const year = parts.year;

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${weekday}, ${day} ${month} ${year}`;
    case "YYYY-MM-DD":
      return `${weekday}, ${month} ${day}, ${year}`;
    case "MM/DD/YYYY":
    default:
      return `${weekday}, ${month} ${day}, ${year}`;
  }
}

export function format_full_datetime(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  t?: TranslateFn,
): string {
  if (t) {
    return t("common.date_at_time", {
      date: format_full_date(date, options),
      time: format_time(date, options),
    });
  }

  return new Intl.DateTimeFormat(undefined, zoned({
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: options.time_format === "12h",
  })).format(date);
}

export function format_timestamp_smart(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  t?: TranslateFn,
): string {
  const now = new Date();

  const is_today = day_key(date) === day_key(now);

  const yesterday = new Date(now.getTime() - 86400000);
  const is_yesterday = day_key(date) === day_key(yesterday);

  if (is_today) {
    return format_time(date, options);
  }

  if (is_yesterday) {
    return t ? t("common.yesterday") : "Yesterday";
  }

  return format_date_short(date, options);
}

export function format_email_list_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  if (!date || isNaN(date.getTime())) return "";

  const now = new Date();
  const is_today = day_key(date) === day_key(now);

  if (is_today) {
    return format_time(date, options);
  }

  const is_other_year = get_zoned_parts(date).year !== get_zoned_parts(now).year;

  return format_date_short(date, options, is_other_year);
}

export function format_email_detail_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  t?: TranslateFn,
): string {
  if (!date || isNaN(date.getTime())) return "";

  const now = new Date();
  const is_today = day_key(date) === day_key(now);

  const yesterday = new Date(now.getTime() - 86400000);
  const is_yesterday = day_key(date) === day_key(yesterday);

  const time_str = format_time(date, options);

  if (is_today) {
    return t
      ? t("common.today_at_time", { time: time_str })
      : `Today at ${time_str}`;
  }

  if (is_yesterday) {
    return t
      ? t("common.yesterday_at_time", { time: time_str })
      : `Yesterday at ${time_str}`;
  }

  const is_other_year = get_zoned_parts(date).year !== get_zoned_parts(now).year;
  const date_str = format_date_short(date, options, is_other_year);

  return t
    ? t("common.date_at_time", {
        date: date_str,
        time: time_str,
      })
    : `${date_str} at ${time_str}`;
}

export function format_email_popup_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  return format_full_datetime(date, options);
}

export function format_snooze_remaining(
  snooze_date: Date,
  t?: TranslateFn,
): string {
  const now = new Date();
  const diff_ms = snooze_date.getTime() - now.getTime();

  if (diff_ms <= 0) return t ? t("common.snooze_expired") : "Snooze expired";

  const diff_minutes = Math.floor(diff_ms / (1000 * 60));
  const diff_hours = Math.floor(diff_ms / (1000 * 60 * 60));
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

  if (diff_minutes < 60) {
    return t
      ? t("common.minutes_remaining", { count: diff_minutes })
      : `${diff_minutes} minute${diff_minutes !== 1 ? "s" : ""} remaining`;
  } else if (diff_hours < 24) {
    return t
      ? t("common.hours_remaining", { count: diff_hours })
      : `${diff_hours} hour${diff_hours !== 1 ? "s" : ""} remaining`;
  } else if (diff_days < 7) {
    return t
      ? t("common.days_remaining", { count: diff_days })
      : `${diff_days} day${diff_days !== 1 ? "s" : ""} remaining`;
  } else {
    const weeks = Math.floor(diff_days / 7);

    return t
      ? t("common.weeks_remaining", { count: weeks })
      : `${weeks} week${weeks !== 1 ? "s" : ""} remaining`;
  }
}

export function format_snooze_target(
  snooze_date: Date,
  t?: TranslateFn,
): string {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);

  const time_str = snooze_date.toLocaleTimeString([], zoned({
    hour: "numeric",
    minute: "2-digit",
  }));

  if (day_key(snooze_date) === day_key(now)) {
    return t
      ? t("common.today_at_time", { time: time_str })
      : `Today at ${time_str}`;
  } else if (day_key(snooze_date) === day_key(tomorrow)) {
    return t
      ? t("common.tomorrow_at_time", { time: time_str })
      : `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString([], zoned({
      weekday: "long",
      month: "short",
      day: "numeric",
    }));

    return t
      ? t("common.date_at_time", { date: date_str, time: time_str })
      : `${date_str} at ${time_str}`;
  }
}
