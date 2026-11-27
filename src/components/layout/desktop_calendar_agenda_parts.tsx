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
import type {
  CalendarEventKind,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import {
  BoltIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";

import {
  end_of_day,
  start_of_day,
} from "@/components/layout/desktop_calendar_days";

const RELATIVE_LABEL_MAX_LENGTH = 9;
const DAY_PERIOD_PATTERN = /\s*(AM|PM|am|pm|a\.m\.|p\.m\.)$/;
const NOW_COLOR = "var(--calendar_now_line, var(--accent-color))";

export function relative_day_label(
  day: Date,
  today: Date,
  language: string,
): string {
  const locale = language || undefined;
  let weekday: string;

  try {
    weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day);
  } catch {
    weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      day,
    );
  }

  const offset = Math.round(
    (start_of_day(day).getTime() - start_of_day(today).getTime()) / 86_400_000,
  );

  if (offset !== 0 && offset !== 1) return weekday;

  try {
    const relative = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(offset, "day");

    if (/\d/.test(relative) || relative.length > RELATIVE_LABEL_MAX_LENGTH) {
      return weekday;
    }

    return relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1);
  } catch {
    return weekday;
  }
}

export function compact_time_range(
  start_text: string,
  end_text: string,
): string {
  const start_period = start_text.match(DAY_PERIOD_PATTERN)?.[1];
  const end_period = end_text.match(DAY_PERIOD_PATTERN)?.[1];
  const start =
    start_period && start_period === end_period
      ? start_text.replace(DAY_PERIOD_PATTERN, "")
      : start_text;

  return `${start} - ${end_text}`;
}

export interface DaySegment {
  is_all_day: boolean;
  starts_before: boolean;
  ends_after: boolean;
  start: Date;
  end: Date;
}

export function event_segment_for_day(
  event: DecryptedCalendarEvent,
  day: Date,
): DaySegment {
  const starts_at = new Date(event.starts_at);
  const ends_at = new Date(event.ends_at);
  const day_start = start_of_day(day);
  const day_end = end_of_day(day);
  const starts_before = starts_at.getTime() < day_start.getTime();
  const ends_after = ends_at.getTime() > day_end.getTime();

  return {
    is_all_day: event.is_all_day || (starts_before && ends_after),
    starts_before,
    ends_after,
    start: starts_before ? day_start : starts_at,
    end: ends_after ? day_end : ends_at,
  };
}

export function now_divider_index(
  day_events: DecryptedCalendarEvent[],
  now: Date,
): number {
  if (!day_events.some((event) => !event.is_all_day)) return -1;

  const first_upcoming = day_events.findIndex(
    (event) =>
      !event.is_all_day && new Date(event.starts_at).getTime() >= now.getTime(),
  );

  return first_upcoming === -1 ? day_events.length : first_upcoming;
}

export function NowDivider() {
  return (
    <li
      aria-hidden="true"
      className="flex items-center py-1 ps-2"
      data-testid="agenda_now_divider"
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: NOW_COLOR }}
      />
      <span
        className="h-[2px] flex-1 rounded-full"
        style={{ backgroundColor: NOW_COLOR }}
      />
    </li>
  );
}

interface EventKindIconProps {
  kind: CalendarEventKind;
  className?: string;
}

export function EventKindIcon({ kind, className }: EventKindIconProps) {
  const shared = className ?? "h-3 w-3 flex-shrink-0";

  if (kind === "task") {
    return (
      <CheckCircleIcon
        aria-hidden="true"
        className={shared}
        strokeWidth={1.75}
      />
    );
  }
  if (kind === "out_of_office") {
    return (
      <MoonIcon aria-hidden="true" className={shared} strokeWidth={1.75} />
    );
  }
  if (kind === "focus_time") {
    return (
      <BoltIcon aria-hidden="true" className={shared} strokeWidth={1.75} />
    );
  }
  if (kind === "working_location") {
    return (
      <BuildingOffice2Icon
        aria-hidden="true"
        className={shared}
        strokeWidth={1.75}
      />
    );
  }

  return null;
}
