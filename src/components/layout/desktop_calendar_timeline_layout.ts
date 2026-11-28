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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { event_segment_for_day } from "@/components/layout/desktop_calendar_agenda_parts";
import { start_of_day } from "@/components/layout/desktop_calendar_days";

export const HOUR_HEIGHT = 48;
export const MINUTES_PER_DAY = 24 * 60;
export const SNAP_MINUTES = 15;
export const DEFAULT_DRAFT_MINUTES = 30;
export const MIN_EVENT_MINUTES = 20;
export const DEFAULT_SCROLL_HOUR = 8;

export interface TimedPlacement {
  event: DecryptedCalendarEvent;
  start_minute: number;
  end_minute: number;
  column: number;
  column_count: number;
  starts_before: boolean;
  ends_after: boolean;
}

export interface DayLayout {
  all_day: DecryptedCalendarEvent[];
  timed: TimedPlacement[];
}

export function minutes_into_day(date: Date, day: Date): number {
  return Math.round((date.getTime() - start_of_day(day).getTime()) / 60_000);
}

export function clamp_minute(value: number): number {
  return Math.min(MINUTES_PER_DAY, Math.max(0, value));
}

export function snap_minute(value: number): number {
  return clamp_minute(Math.floor(value / SNAP_MINUTES) * SNAP_MINUTES);
}

export function minute_to_offset(minute: number): number {
  return (minute / 60) * HOUR_HEIGHT;
}

export function offset_to_minute(offset: number): number {
  return clamp_minute((offset / HOUR_HEIGHT) * 60);
}

export function date_at_minute(day: Date, minute: number): Date {
  const result = start_of_day(day);

  result.setMinutes(minute);

  return result;
}

interface PendingPlacement {
  event: DecryptedCalendarEvent;
  start_minute: number;
  end_minute: number;
  visual_end: number;
  starts_before: boolean;
  ends_after: boolean;
  column: number;
}

function assign_columns(cluster: PendingPlacement[]): TimedPlacement[] {
  const column_ends: number[] = [];

  for (const item of cluster) {
    let column = column_ends.findIndex((end) => end <= item.start_minute);

    if (column === -1) {
      column = column_ends.length;
      column_ends.push(item.visual_end);
    } else {
      column_ends[column] = item.visual_end;
    }
    item.column = column;
  }

  const column_count = Math.max(1, column_ends.length);

  return cluster.map((item) => ({
    event: item.event,
    start_minute: item.start_minute,
    end_minute: item.end_minute,
    column: item.column,
    column_count,
    starts_before: item.starts_before,
    ends_after: item.ends_after,
  }));
}

export function layout_day(
  events: DecryptedCalendarEvent[],
  day: Date,
): DayLayout {
  const all_day: DecryptedCalendarEvent[] = [];
  const pending: PendingPlacement[] = [];

  for (const event of events) {
    const segment = event_segment_for_day(event, day);

    if (segment.is_all_day) {
      all_day.push(event);
      continue;
    }

    const start = Number.isNaN(segment.start.getTime())
      ? 0
      : clamp_minute(minutes_into_day(segment.start, day));
    const raw_end = Number.isNaN(segment.end.getTime())
      ? start
      : clamp_minute(minutes_into_day(segment.end, day));
    const end = Math.max(start, raw_end);
    const visual_end = Math.min(
      MINUTES_PER_DAY,
      Math.max(end, start + MIN_EVENT_MINUTES),
    );

    pending.push({
      event,
      start_minute: start,
      end_minute: end,
      visual_end,
      starts_before: segment.starts_before,
      ends_after: segment.ends_after,
      column: 0,
    });
  }

  pending.sort(
    (left, right) =>
      left.start_minute - right.start_minute ||
      right.visual_end - left.visual_end ||
      (left.event.id < right.event.id ? -1 : 1),
  );

  const timed: TimedPlacement[] = [];
  let cluster: PendingPlacement[] = [];
  let cluster_end = -1;

  for (const item of pending) {
    if (cluster.length > 0 && item.start_minute >= cluster_end) {
      timed.push(...assign_columns(cluster));
      cluster = [];
      cluster_end = -1;
    }
    cluster.push(item);
    cluster_end = Math.max(cluster_end, item.visual_end);
  }
  if (cluster.length > 0) timed.push(...assign_columns(cluster));

  return { all_day, timed };
}

export function initial_scroll_minute(
  layout: DayLayout,
  is_today: boolean,
  now: Date,
  day: Date,
): number {
  if (is_today) return Math.max(0, minutes_into_day(now, day) - 90);

  const first = layout.timed[0];

  if (first) return Math.max(0, first.start_minute - 30);

  return DEFAULT_SCROLL_HOUR * 60;
}

export function next_draft_start(now: Date, day: Date, is_today: boolean) {
  if (!is_today) return 9 * 60;

  const minute = minutes_into_day(now, day);
  const rounded = Math.ceil((minute + 1) / 30) * 30;

  return Math.min(MINUTES_PER_DAY - DEFAULT_DRAFT_MINUTES, rounded);
}
