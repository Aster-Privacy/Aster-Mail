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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { is_own_address } from "@/services/calendar/own_addresses";
import { CALENDAR_WEB_ORIGIN } from "@/lib/session_handoff/session_handoff_protocol";

export const AGENDA_DAY_COUNT = 7;
export const UP_NEXT_LOOKAHEAD_DAYS = 7;
export const UP_NEXT_SOON_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const EXCLUDED_UP_NEXT_KINDS = new Set(["task", "working_location"]);

export function start_of_day(date: Date): Date {
  const next = new Date(date);

  next.setHours(0, 0, 0, 0);

  return next;
}

export function end_of_day(date: Date): Date {
  const next = new Date(date);

  next.setHours(23, 59, 59, 999);

  return next;
}

export function add_days(date: Date, days: number): Date {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

export function add_months(date: Date, months: number): Date {
  const next = new Date(date);
  const target_day = next.getDate();

  next.setDate(1);
  next.setMonth(next.getMonth() + months);

  const days_in_target = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();

  next.setDate(Math.min(target_day, days_in_target));

  return next;
}

export function is_same_day(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function week_start_day_index(value: string | undefined): number {
  if (value === "monday") return 1;
  if (value === "saturday") return 6;

  return 0;
}

export function build_month_grid(anchor: Date, week_start_day: number): Date[] {
  const first_of_month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first_of_month.getDay() - week_start_day + 7) % 7;
  const grid_start = add_days(first_of_month, -offset);

  return Array.from({ length: 42 }, (_, index) => add_days(grid_start, index));
}

export function day_key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

export function compare_events_for_day(
  left: DecryptedCalendarEvent,
  right: DecryptedCalendarEvent,
): number {
  if (left.is_all_day !== right.is_all_day) return left.is_all_day ? -1 : 1;

  const start_gap =
    new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();

  if (start_gap !== 0) return start_gap;

  const end_gap =
    new Date(right.ends_at).getTime() - new Date(left.ends_at).getTime();

  if (end_gap !== 0) return end_gap;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function bucket_events_by_day(
  events: DecryptedCalendarEvent[],
  days: Date[],
): Map<string, DecryptedCalendarEvent[]> {
  const buckets = new Map<string, DecryptedCalendarEvent[]>();
  const slots = days.map((day) => ({
    key: day_key(day),
    start_ms: start_of_day(day).getTime(),
    end_ms: end_of_day(day).getTime(),
  }));

  for (const slot of slots) buckets.set(slot.key, []);

  for (const event of events) {
    const event_start = new Date(event.starts_at).getTime();
    const event_end = new Date(event.ends_at).getTime();

    if (!Number.isFinite(event_start) || !Number.isFinite(event_end)) continue;

    for (const slot of slots) {
      const overlaps =
        event_end <= event_start
          ? event_start >= slot.start_ms && event_start <= slot.end_ms
          : event_start <= slot.end_ms && event_end > slot.start_ms;

      if (overlaps) buckets.get(slot.key)?.push(event);
    }
  }

  for (const list of buckets.values()) list.sort(compare_events_for_day);

  return buckets;
}

function is_declined_by(event: DecryptedCalendarEvent, self_email: string) {
  if (self_email.length === 0) return false;

  return event.attendees.some(
    (attendee) =>
      attendee.response === "declined" &&
      is_own_address(attendee.email, self_email),
  );
}

export function is_up_next_candidate(
  event: DecryptedCalendarEvent,
  visible_ids: ReadonlySet<string>,
  self_email: string,
): boolean {
  return (
    visible_ids.has(event.calendar_id) &&
    !EXCLUDED_UP_NEXT_KINDS.has(event.event_kind) &&
    event.status !== "cancelled" &&
    !is_declined_by(event, self_email)
  );
}

export interface UpNextPick {
  event: DecryptedCalendarEvent;
  start_ms: number;
  end_ms: number;
}

export function pick_next_event(
  events: DecryptedCalendarEvent[],
  calendars: DecryptedCalendar[],
  now: Date,
  self_email: string,
): UpNextPick | null {
  const visible_ids = new Set(
    calendars
      .filter((calendar) => calendar.is_visible)
      .map((calendar) => calendar.id),
  );
  const now_ms = now.getTime();
  const today_ms = start_of_day(now).getTime();
  const horizon_ms = add_days(
    start_of_day(now),
    UP_NEXT_LOOKAHEAD_DAYS + 1,
  ).getTime();
  let timed: UpNextPick | null = null;
  let all_day: UpNextPick | null = null;

  for (const event of events) {
    if (!is_up_next_candidate(event, visible_ids, self_email)) continue;

    const start_ms = new Date(event.starts_at).getTime();
    const end_ms = new Date(event.ends_at).getTime();

    if (!Number.isFinite(start_ms) || !Number.isFinite(end_ms)) continue;

    if (event.is_all_day) {
      const end_day = start_of_day(new Date(end_ms)).getTime();
      const effective_end =
        end_ms === end_day && end_ms > start_ms ? end_ms : end_day + DAY_MS;

      if (effective_end <= today_ms || start_ms >= horizon_ms) continue;
      if (!all_day || start_ms < all_day.start_ms) {
        all_day = { event, start_ms, end_ms: effective_end };
      }

      continue;
    }

    if (
      end_ms <= now_ms ||
      start_ms >= now_ms + UP_NEXT_LOOKAHEAD_DAYS * DAY_MS
    ) {
      continue;
    }

    if (
      !timed ||
      start_ms < timed.start_ms ||
      (start_ms === timed.start_ms && end_ms < timed.end_ms)
    ) {
      timed = { event, start_ms, end_ms };
    }
  }

  return timed ?? all_day;
}

export function safe_color(value: string | null | undefined): string | null {
  return typeof value === "string" && SAFE_COLOR.test(value) ? value : null;
}

export function resolve_event_color(
  event: DecryptedCalendarEvent,
  calendars_by_id: ReadonlyMap<string, DecryptedCalendar>,
): string {
  return (
    safe_color(event.color) ??
    safe_color(calendars_by_id.get(event.calendar_id)?.color) ??
    "var(--accent-color)"
  );
}

function local_date_param(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");

  return `${day.getFullYear()}-${month}-${date}`;
}

export function build_event_link(
  event: DecryptedCalendarEvent,
  origin: string = CALENDAR_WEB_ORIGIN,
): string {
  const url = new URL("/", origin);
  const starts = new Date(event.starts_at);

  url.searchParams.set("event", event.id);
  if (!Number.isNaN(starts.getTime())) {
    url.searchParams.set("date", local_date_param(starts));
  }

  return url.toString();
}

export function plain_text(value: string): string {
  if (!value.includes("<")) return value.trim();

  try {
    const parsed = new DOMParser().parseFromString(value, "text/html");

    return (parsed.body.textContent ?? "").trim();
  } catch {
    return value.replace(/<[^>]*>/g, " ").trim();
  }
}
