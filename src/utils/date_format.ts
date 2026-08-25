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
export type DateFormatPreference = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type TimeFormatPreference = "12h" | "24h";

export interface FormatOptions {
  date_format: DateFormatPreference;
  time_format: TimeFormatPreference;
}

let display_time_zone: string | undefined;

let display_time_format: TimeFormatPreference | undefined;

let display_date_format: DateFormatPreference | undefined;

export function set_display_time_format(
  value: TimeFormatPreference | undefined,
): void {
  display_time_format = value === "12h" || value === "24h" ? value : undefined;
}

export function app_hour12(): boolean | undefined {
  if (display_time_format) return display_time_format === "12h";
  if (typeof window === "undefined") return undefined;

  try {
    const stored = localStorage.getItem("astermail_time_format");

    if (stored === "12h" || stored === "24h") {
      display_time_format = stored;

      return stored === "12h";
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function is_date_format(value: unknown): value is DateFormatPreference {
  return (
    value === "MM/DD/YYYY" || value === "DD/MM/YYYY" || value === "YYYY-MM-DD"
  );
}

export function set_display_date_format(value: string | undefined): void {
  display_date_format = is_date_format(value) ? value : undefined;
}

export function app_date_format(): DateFormatPreference {
  if (display_date_format) return display_date_format;
  if (typeof window === "undefined") return "MM/DD/YYYY";

  try {
    const stored = localStorage.getItem("astermail_date_format");

    if (is_date_format(stored)) {
      display_date_format = stored;

      return stored;
    }
  } catch {
    return "MM/DD/YYYY";
  }

  return "MM/DD/YYYY";
}

function default_options(): FormatOptions {
  return {
    date_format: app_date_format(),
    time_format: app_hour12() === false ? "24h" : "12h",
  };
}

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

let display_locale: string | undefined;

export function set_display_locale(code: string | undefined): void {
  if (!code) {
    display_locale = undefined;

    return;
  }

  try {
    new Intl.DateTimeFormat(code);
    display_locale = code;
  } catch {
    display_locale = undefined;
  }
}

export function app_locale(): string | undefined {
  return active_locale();
}

export function format_datetime_hint(
  date: Date,
  with_weekday = false,
  with_year = false,
): string {
  return new Intl.DateTimeFormat(app_locale(), {
    weekday: with_weekday ? "short" : undefined,
    year: with_year ? "numeric" : undefined,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: app_hour12(),
    timeZone: get_display_time_zone(),
  }).format(date);
}

export function format_weekday_time(date: Date): string {
  return new Intl.DateTimeFormat(app_locale(), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: app_hour12(),
    timeZone: get_display_time_zone(),
  }).format(date);
}

export function format_weekday_date(date: Date): string {
  return new Intl.DateTimeFormat(app_locale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: get_display_time_zone(),
  }).format(date);
}

export function format_hour_choice(
  hour: number,
  am: string,
  pm: string,
): string {
  if (app_hour12() === false) {
    return `${hour.toString().padStart(2, "0")}`;
  }

  return `${hour % 12 || 12} ${hour >= 12 ? pm : am}`;
}

export function local_date_key(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: get_display_time_zone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function zone_offset_ms(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);

    return found ? Number(found.value) : 0;
  };

  const hour = read("hour") % 24;
  const as_utc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second"),
  );

  return as_utc - instant;
}

export function date_from_zoned_parts(parts: ZonedParts): Date {
  const zone = get_display_time_zone();

  if (!zone) {
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours,
      parts.minutes,
      0,
      0,
    );
  }

  try {
    const wall = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours,
      parts.minutes,
      0,
      0,
    );
    let instant = wall - zone_offset_ms(wall, zone);

    instant = wall - zone_offset_ms(instant, zone);

    return new Date(instant);
  } catch {
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours,
      parts.minutes,
      0,
      0,
    );
  }
}

export function zoned_with_time(
  date: Date,
  hours: number,
  minutes: number,
): Date {
  const parts = get_zoned_parts(date);

  return date_from_zoned_parts({ ...parts, hours, minutes });
}

export function zoned_start_of_day(date: Date): Date {
  return zoned_with_time(date, 0, 0);
}

export function zoned_add_days(date: Date, days: number): Date {
  const parts = get_zoned_parts(date);

  return date_from_zoned_parts({ ...parts, day: parts.day + days });
}

export function zoned_calendar_day(date: Date): Date {
  const parts = get_zoned_parts(date);

  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

export function zoned_instant_from_calendar_day(
  day: Date,
  hours: number,
  minutes: number,
): Date {
  return date_from_zoned_parts({
    year: day.getFullYear(),
    month: day.getMonth() + 1,
    day: day.getDate(),
    hours,
    minutes,
  });
}

export function zoned_weekday(date: Date): number {
  const parts = get_zoned_parts(date);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function zoned_next_weekday(date: Date, weekday: number): Date {
  const ahead = (weekday - zoned_weekday(date) + 7) % 7 || 7;

  return zoned_add_days(zoned_start_of_day(date), ahead);
}

function active_locale(): string | undefined {
  if (display_locale) return display_locale;
  if (typeof window === "undefined") return undefined;

  try {
    const stored = localStorage.getItem("astermail_language");

    if (!stored) return undefined;
    new Intl.DateTimeFormat(stored);
    display_locale = stored;

    return stored;
  } catch {
    return undefined;
  }
}

export function locale_date_format(): DateFormatPreference {
  try {
    const order = new Intl.DateTimeFormat(active_locale(), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(Date.UTC(2026, 0, 2)))
      .filter((part) => part.type !== "literal")
      .map((part) => part.type)
      .join("-");

    if (order === "year-month-day") return "YYYY-MM-DD";
    if (order === "day-month-year") return "DD/MM/YYYY";

    return "MM/DD/YYYY";
  } catch {
    return "MM/DD/YYYY";
  }
}

export function locale_time_format(): TimeFormatPreference {
  try {
    const resolved = new Intl.DateTimeFormat(active_locale(), {
      hour: "numeric",
    }).resolvedOptions() as Intl.ResolvedDateTimeFormatOptions & {
      hourCycle?: string;
    };

    if (resolved.hourCycle === "h23" || resolved.hourCycle === "h24") {
      return "24h";
    }
    if (resolved.hourCycle === "h11" || resolved.hourCycle === "h12") {
      return "12h";
    }

    return resolved.hour12 === false ? "24h" : "12h";
  } catch {
    return "12h";
  }
}

function zoned(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return display_time_zone ? { ...opts, timeZone: display_time_zone } : opts;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

export function get_zoned_parts(date: Date): ZonedParts {
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

function shifted_day_key(from: Date, day_offset: number): string {
  const p = get_zoned_parts(from);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + day_offset));

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

export function calendar_day_diff(from: Date, to: Date): number {
  const a = get_zoned_parts(from);
  const b = get_zoned_parts(to);

  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) -
      Date.UTC(a.year, a.month - 1, a.day)) /
      86400000,
  );
}

export function format_date(
  date: Date,
  options: FormatOptions = default_options(),
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

export function format_iso_date(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) return value;

  const [, year, month, day] = match;

  switch (app_date_format()) {
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
  options: FormatOptions = default_options(),
): string {
  const zoned_parts = get_zoned_parts(date);
  const hours = zoned_parts.hours;
  const minutes = pad(zoned_parts.minutes);

  if (options.time_format === "24h") {
    return `${pad(hours)}:${minutes}`;
  }

  const parts = new Intl.DateTimeFormat(
    active_locale(),
    zoned({
      hour: "numeric",
      hour12: true,
    }),
  ).formatToParts(date);
  const period =
    parts.find((p) => p.type === "dayPeriod")?.value ??
    (hours >= 12 ? "PM" : "AM");
  const hours_12 = hours % 12 || 12;

  return `${hours_12}:${minutes} ${period}`;
}

export function format_date_short(
  date: Date,
  options: FormatOptions = default_options(),
  include_year = false,
): string {
  const parts = get_zoned_parts(date);
  const day = parts.day;
  const month = new Intl.DateTimeFormat(
    active_locale(),
    zoned({ month: "short" }),
  ).format(date);
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
  return new Intl.DateTimeFormat(
    active_locale(),
    zoned({ weekday: "short" }),
  ).format(date);
}

export function format_full_date(
  date: Date,
  options: FormatOptions = default_options(),
): string {
  const weekday = new Intl.DateTimeFormat(
    active_locale(),
    zoned({ weekday: "long" }),
  ).format(date);
  const month = new Intl.DateTimeFormat(
    active_locale(),
    zoned({ month: "long" }),
  ).format(date);
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
  options: FormatOptions = default_options(),
  t?: TranslateFn,
): string {
  if (t) {
    return t("common.date_at_time", {
      date: format_full_date(date, options),
      time: format_time(date, options),
    });
  }

  return new Intl.DateTimeFormat(
    active_locale(),
    zoned({
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: options.time_format === "12h",
    }),
  ).format(date);
}

export function format_timestamp_smart(
  date: Date,
  options: FormatOptions = default_options(),
  t?: TranslateFn,
): string {
  const now = new Date();

  const is_today = day_key(date) === day_key(now);

  const is_yesterday = day_key(date) === shifted_day_key(now, -1);

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
  options: FormatOptions = default_options(),
): string {
  if (!date || isNaN(date.getTime())) return "";

  const now = new Date();
  const is_today = day_key(date) === day_key(now);

  if (is_today) {
    return format_time(date, options);
  }

  const is_other_year =
    get_zoned_parts(date).year !== get_zoned_parts(now).year;

  return format_date_short(date, options, is_other_year);
}

export function format_email_detail_timestamp(
  date: Date,
  options: FormatOptions = default_options(),
  t?: TranslateFn,
): string {
  if (!date || isNaN(date.getTime())) return "";

  const now = new Date();
  const is_today = day_key(date) === day_key(now);

  const is_yesterday = day_key(date) === shifted_day_key(now, -1);

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

  const is_other_year =
    get_zoned_parts(date).year !== get_zoned_parts(now).year;
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
  options: FormatOptions = default_options(),
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

  const diff_minutes = Math.max(1, Math.floor(diff_ms / (1000 * 60)));
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

  const time_str = snooze_date.toLocaleTimeString(
    app_locale(),
    zoned({
      hour: "numeric",
      hour12: app_hour12(),
      minute: "2-digit",
    }),
  );

  if (day_key(snooze_date) === day_key(now)) {
    return t
      ? t("common.today_at_time", { time: time_str })
      : `Today at ${time_str}`;
  } else if (day_key(snooze_date) === shifted_day_key(now, 1)) {
    return t
      ? t("common.tomorrow_at_time", { time: time_str })
      : `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString(
      app_locale(),
      zoned({
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    );

    return t
      ? t("common.date_at_time", { date: date_str, time: time_str })
      : `${date_str} at ${time_str}`;
  }
}
