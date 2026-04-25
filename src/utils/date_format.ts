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

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function format_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

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
  const hours = date.getHours();
  const minutes = pad(date.getMinutes());

  if (options.time_format === "24h") {
    return `${pad(hours)}:${minutes}`;
  }

  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: true,
  }).formatToParts(date);
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? (hours >= 12 ? "PM" : "AM");
  const hours_12 = hours % 12 || 12;

  return `${hours_12}:${minutes} ${period}`;
}

export function format_date_short(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const day = date.getDate();
  const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${day} ${month}`;
    case "YYYY-MM-DD":
      return `${month} ${day}`;
    case "MM/DD/YYYY":
    default:
      return `${month} ${day}`;
  }
}

export function format_weekday_short(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}

export function format_full_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
  const day = date.getDate();

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${weekday}, ${day} ${month}`;
    case "YYYY-MM-DD":
      return `${weekday}, ${month} ${day}`;
    case "MM/DD/YYYY":
    default:
      return `${weekday}, ${month} ${day}`;
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

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: options.time_format === "12h",
  }).format(date);
}

export function format_timestamp_smart(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  t?: TranslateFn,
): string {
  const now = new Date();

  const is_today = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);
  const is_yesterday = date.toDateString() === yesterday.toDateString();

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
  const is_today = date.toDateString() === now.toDateString();

  if (is_today) {
    return format_time(date, options);
  }

  return format_date_short(date, options);
}

export function format_email_detail_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
  t?: TranslateFn,
): string {
  if (!date || isNaN(date.getTime())) return "";

  const now = new Date();
  const is_today = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);
  const is_yesterday = date.toDateString() === yesterday.toDateString();

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

  return t
    ? t("common.date_at_time", {
        date: format_date_short(date, options),
        time: time_str,
      })
    : `${format_date_short(date, options)} at ${time_str}`;
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
  const tomorrow = new Date(now);

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const snooze_day = new Date(snooze_date);

  snooze_day.setHours(0, 0, 0, 0);

  const today = new Date(now);

  today.setHours(0, 0, 0, 0);

  const time_str = snooze_date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (snooze_day.getTime() === today.getTime()) {
    return t
      ? t("common.today_at_time", { time: time_str })
      : `Today at ${time_str}`;
  } else if (snooze_day.getTime() === tomorrow.getTime()) {
    return t
      ? t("common.tomorrow_at_time", { time: time_str })
      : `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return t
      ? t("common.date_at_time", { date: date_str, time: time_str })
      : `${date_str} at ${time_str}`;
  }
}
