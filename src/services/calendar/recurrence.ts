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
  DecryptedCalendarEvent,
  RecurrenceFrequency,
  RecurrenceRule,
} from "@/types/calendar";

export const OCCURRENCE_ID_SEPARATOR = "::";

const MAX_INTERVAL = 365;
const MAX_COUNT = 10_000;
const MAX_PERIODS = 20_000;
const MAX_WINDOW_RESULTS = 10_000;
const MAX_CANDIDATES = 200_000;
const MAX_EXTRA_DATES = 500;
const MAX_SET_POS = 366;
const DAY_MS = 86_400_000;
export const MAX_OCCURRENCE_SPAN_MS = 366 * DAY_MS;
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DEFAULT_WEEK_START = 1;
const FREQUENCIES = new Set<RecurrenceFrequency>([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function clamp_int_list(
  value: unknown,
  min: number,
  max: number,
  allow_zero: boolean,
): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (entry): entry is number =>
          Number.isInteger(entry) &&
          entry >= min &&
          entry <= max &&
          (allow_zero || entry !== 0),
      ),
    ),
  ).sort((left, right) => left - right);
}

function normalize_iso_list(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "string") {
      continue;
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      seen.add(parsed.toISOString());
    }
  }

  return Array.from(seen).sort().slice(0, limit);
}

export function is_valid_time_zone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

export function normalize_recurrence(
  value: RecurrenceRule | null | undefined,
): RecurrenceRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (!FREQUENCIES.has(value.frequency)) {
    return null;
  }

  const interval = Number.isFinite(value.interval)
    ? Math.min(MAX_INTERVAL, Math.max(1, Math.floor(value.interval)))
    : 1;
  const by_weekday =
    value.frequency === "daily"
      ? []
      : clamp_int_list(value.by_weekday, 0, 6, true);
  const by_month_day =
    value.frequency === "monthly" || value.frequency === "yearly"
      ? clamp_int_list(value.by_month_day, -31, 31, false)
      : [];
  const by_month =
    value.frequency === "yearly"
      ? clamp_int_list(value.by_month, 1, 12, true)
      : [];
  const by_set_pos =
    by_weekday.length > 0 || by_month_day.length > 0 || by_month.length > 0
      ? clamp_int_list(value.by_set_pos, -MAX_SET_POS, MAX_SET_POS, false)
      : [];
  const count =
    typeof value.count === "number" && Number.isFinite(value.count)
      ? Math.min(MAX_COUNT, Math.max(1, Math.floor(value.count)))
      : null;
  const until =
    typeof value.until === "string" &&
    value.until.length > 0 &&
    !Number.isNaN(Date.parse(value.until))
      ? value.until
      : null;
  const week_start =
    Number.isInteger(value.week_start) &&
    (value.week_start as number) >= 0 &&
    (value.week_start as number) <= 6
      ? (value.week_start as number)
      : null;
  const extra_dates = normalize_iso_list(value.extra_dates, MAX_EXTRA_DATES);
  const time_zone = is_valid_time_zone(value.time_zone)
    ? value.time_zone
    : null;

  const normalized: RecurrenceRule = {
    frequency: value.frequency,
    interval,
    by_weekday,
    count: until ? null : count,
    until,
  };

  if (by_month_day.length > 0) {
    normalized.by_month_day = by_month_day;
  }

  if (by_month.length > 0) {
    normalized.by_month = by_month;
  }

  if (by_set_pos.length > 0) {
    normalized.by_set_pos = by_set_pos;
  }

  if (week_start !== null && week_start !== DEFAULT_WEEK_START) {
    normalized.week_start = week_start;
  }

  if (extra_dates.length > 0) {
    normalized.extra_dates = extra_dates;
  }

  if (time_zone) {
    normalized.time_zone = time_zone;
  }

  return normalized;
}

export function build_occurrence_id(
  master_id: string,
  occurrence_start: string,
): string {
  return `${master_id}${OCCURRENCE_ID_SEPARATOR}${occurrence_start}`;
}

export function parse_occurrence_id(id: string): {
  master_id: string;
  occurrence_start: string | null;
} {
  const index = id.indexOf(OCCURRENCE_ID_SEPARATOR);

  if (index < 0) {
    return { master_id: id, occurrence_start: null };
  }

  return {
    master_id: id.slice(0, index),
    occurrence_start: id.slice(index + OCCURRENCE_ID_SEPARATOR.length),
  };
}

const zone_formatters = new Map<string, Intl.DateTimeFormat>();

export function zone_formatter(time_zone: string): Intl.DateTimeFormat {
  const cached = zone_formatters.get(time_zone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: time_zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  zone_formatters.set(time_zone, formatter);

  return formatter;
}

export function zone_offset_ms(
  time_zone: string,
  instant_ms: number,
): number | null {
  try {
    const formatter = zone_formatter(time_zone);
    const fields: Record<string, number> = {};

    for (const part of formatter.formatToParts(new Date(instant_ms))) {
      if (part.type !== "literal") {
        fields[part.type] = Number(part.value);
      }
    }

    const as_utc = Date.UTC(
      fields.year,
      fields.month - 1,
      fields.day,
      fields.hour % 24,
      fields.minute,
      fields.second,
    );

    return as_utc - Math.floor(instant_ms / 1000) * 1000;
  } catch {
    return null;
  }
}

export function zoned_wall_to_utc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  time_zone: string,
  millisecond = 0,
): Date | null {
  const wall_as_utc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const first_offset = zone_offset_ms(time_zone, wall_as_utc);

  if (first_offset === null) {
    return null;
  }

  const refined_offset = zone_offset_ms(time_zone, wall_as_utc - first_offset);

  return new Date(wall_as_utc - (refined_offset ?? first_offset));
}

export function wall_clock_of(
  instant_ms: number,
  time_zone: string | null,
): WallClock {
  if (time_zone) {
    const offset = zone_offset_ms(time_zone, instant_ms);

    if (offset !== null) {
      const shifted = new Date(instant_ms + offset);

      return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        millisecond: shifted.getUTCMilliseconds(),
      };
    }
  }

  const local = new Date(instant_ms);

  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    minute: local.getMinutes(),
    second: local.getSeconds(),
    millisecond: local.getMilliseconds(),
  };
}

export function instant_of(wall: WallClock, time_zone: string | null): number {
  if (time_zone) {
    const zoned = zoned_wall_to_utc(
      wall.year,
      wall.month,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      time_zone,
      wall.millisecond,
    );

    if (zoned) {
      return zoned.getTime();
    }
  }

  return new Date(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  ).getTime();
}

function wall_date_key(wall: WallClock): string {
  return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
}

export function exception_key(
  value: string | number | Date,
  is_all_day: boolean,
  time_zone: string | null = null,
): string | null {
  const instant_ms =
    typeof value === "number" ? value : new Date(value).getTime();

  if (Number.isNaN(instant_ms)) {
    return null;
  }

  if (!is_all_day) {
    return String(instant_ms);
  }

  return wall_date_key(wall_clock_of(instant_ms, time_zone));
}

export function exception_key_set(
  exceptions: string[],
  is_all_day: boolean,
  time_zone: string | null = null,
): Set<string> {
  const keys = new Set<string>();

  for (const entry of exceptions) {
    const key = exception_key(entry, is_all_day, time_zone);

    if (key !== null) {
      keys.add(key);
    }
  }

  return keys;
}

export function is_exception(
  event: Pick<DecryptedCalendarEvent, "recurrence_exceptions" | "is_all_day">,
  occurrence_start: string | number | Date,
  time_zone: string | null = null,
): boolean {
  const key = exception_key(occurrence_start, event.is_all_day, time_zone);

  if (key === null) {
    return false;
  }

  return exception_key_set(
    event.recurrence_exceptions,
    event.is_all_day,
    time_zone,
  ).has(key);
}

function day_number(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function date_of_day_number(value: number): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const date = new Date(value * DAY_MS);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function days_in_month(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekday_of(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function resolve_month_days(
  year: number,
  month: number,
  rule: RecurrenceRule,
  anchor_day: number,
): number[] {
  const length = days_in_month(year, month);
  const by_month_day = rule.by_month_day ?? [];

  if (by_month_day.length > 0) {
    const days = new Set<number>();

    for (const entry of by_month_day) {
      const resolved = entry > 0 ? entry : length + entry + 1;

      if (
        resolved >= 1 &&
        resolved <= length &&
        (rule.by_weekday.length === 0 ||
          rule.by_weekday.includes(weekday_of(year, month, resolved)))
      ) {
        days.add(resolved);
      }
    }

    return Array.from(days).sort((left, right) => left - right);
  }

  if (rule.by_weekday.length > 0) {
    const days: number[] = [];

    for (let day = 1; day <= length; day += 1) {
      if (rule.by_weekday.includes(weekday_of(year, month, day))) {
        days.push(day);
      }
    }

    return days;
  }

  return [Math.min(anchor_day, length)];
}

function apply_set_pos(days: number[], rule: RecurrenceRule): number[] {
  const positions = rule.by_set_pos ?? [];

  if (positions.length === 0) {
    return days;
  }

  const picked = new Set<number>();

  for (const position of positions) {
    const index = position > 0 ? position - 1 : days.length + position;

    if (index >= 0 && index < days.length) {
      picked.add(days[index]);
    }
  }

  return Array.from(picked).sort((left, right) => left - right);
}

function week_start_day_number(day: number, week_start: number): number {
  const weekday = date_of_day_number(day).weekday;

  return day - ((weekday - week_start + 7) % 7);
}

function period_candidates(
  index: number,
  rule: RecurrenceRule,
  start: WallClock,
  week_start: number,
): number[] {
  const anchor_day_number = day_number(start.year, start.month, start.day);

  if (rule.frequency === "daily") {
    const day = anchor_day_number + index * rule.interval;
    const date = date_of_day_number(day);
    const by_month_day = rule.by_month_day ?? [];
    const by_month = rule.by_month ?? [];

    if (by_month.length > 0 && !by_month.includes(date.month)) {
      return [];
    }

    if (by_month_day.length > 0) {
      const length = days_in_month(date.year, date.month);
      const matches = by_month_day.some(
        (entry) => (entry > 0 ? entry : length + entry + 1) === date.day,
      );

      if (!matches) {
        return [];
      }
    }

    return [day];
  }

  if (rule.frequency === "weekly") {
    const first =
      week_start_day_number(anchor_day_number, week_start) +
      index * rule.interval * 7;
    const allowed =
      rule.by_weekday.length > 0
        ? rule.by_weekday
        : [date_of_day_number(anchor_day_number).weekday];
    const days: number[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const day = first + offset;

      if (allowed.includes(date_of_day_number(day).weekday)) {
        days.push(day);
      }
    }

    return apply_set_pos(days, rule);
  }

  if (rule.frequency === "monthly") {
    const month_index =
      start.year * 12 + (start.month - 1) + index * rule.interval;
    const year = Math.floor(month_index / 12);
    const month = (month_index % 12) + 1;
    const days = resolve_month_days(year, month, rule, start.day).map((day) =>
      day_number(year, month, day),
    );

    return apply_set_pos(days, rule);
  }

  const year = start.year + index * rule.interval;
  const by_month = rule.by_month ?? [];
  const by_month_day = rule.by_month_day ?? [];
  const months =
    by_month.length > 0
      ? by_month
      : by_month_day.length > 0 || rule.by_weekday.length > 0
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [start.month];
  const days: number[] = [];

  for (const month of months) {
    for (const day of resolve_month_days(year, month, rule, start.day)) {
      days.push(day_number(year, month, day));
    }
  }

  return apply_set_pos(days, rule);
}

function period_index_at(
  target_ms: number,
  rule: RecurrenceRule,
  start: WallClock,
  week_start: number,
  time_zone: string | null,
): number {
  const target = wall_clock_of(target_ms, time_zone);
  const start_day = day_number(start.year, start.month, start.day);
  const target_day = day_number(target.year, target.month, target.day);

  let index = 0;

  if (rule.frequency === "daily") {
    index = Math.floor((target_day - start_day) / rule.interval);
  } else if (rule.frequency === "weekly") {
    const weeks =
      (week_start_day_number(target_day, week_start) -
        week_start_day_number(start_day, week_start)) /
      7;

    index = Math.floor(weeks / rule.interval);
  } else if (rule.frequency === "monthly") {
    const months =
      (target.year - start.year) * 12 + (target.month - start.month);

    index = Math.floor(months / rule.interval);
  } else {
    index = Math.floor((target.year - start.year) / rule.interval);
  }

  return Math.max(0, index - 1);
}

function period_floor_ms(
  index: number,
  rule: RecurrenceRule,
  start: WallClock,
  week_start: number,
  time_zone: string | null,
): number {
  const date = date_of_day_number(
    period_floor_day(index, rule, start, week_start),
  );

  return instant_of(
    {
      year: date.year,
      month: date.month,
      day: date.day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    time_zone,
  );
}

function period_floor_day(
  index: number,
  rule: RecurrenceRule,
  start: WallClock,
  week_start: number,
): number {
  const anchor_day_number = day_number(start.year, start.month, start.day);

  let day = anchor_day_number;

  if (rule.frequency === "daily") {
    day = anchor_day_number + index * rule.interval;
  } else if (rule.frequency === "weekly") {
    day =
      week_start_day_number(anchor_day_number, week_start) +
      index * rule.interval * 7;
  } else if (rule.frequency === "monthly") {
    const month_index =
      start.year * 12 + (start.month - 1) + index * rule.interval;

    day = day_number(Math.floor(month_index / 12), (month_index % 12) + 1, 1);
  } else {
    day = day_number(start.year + index * rule.interval, 1, 1);
  }

  return day;
}

export interface ExpansionBudget {
  remaining: number;
}

function spend_budget(budget: ExpansionBudget | undefined): boolean {
  if (!budget) {
    return true;
  }

  budget.remaining -= 1;

  return budget.remaining >= 0;
}

export function occurrence_starts(
  event: DecryptedCalendarEvent,
  range_start: Date,
  range_end: Date,
  budget?: ExpansionBudget,
): Date[] {
  const rule = normalize_recurrence(event.recurrence);

  if (!rule) {
    return [];
  }

  const start_ms = new Date(event.starts_at).getTime();

  if (Number.isNaN(start_ms)) {
    return [];
  }

  const time_zone = rule.time_zone ?? null;
  const week_start = rule.week_start ?? DEFAULT_WEEK_START;
  const duration_ms = Math.min(
    MAX_OCCURRENCE_SPAN_MS,
    Math.max(0, new Date(event.ends_at).getTime() - start_ms) || 0,
  );
  const until_ms = rule.until ? new Date(rule.until).getTime() : null;
  const exceptions = exception_key_set(
    event.recurrence_exceptions,
    event.is_all_day,
    time_zone,
  );
  const range_start_ms = range_start.getTime();
  const range_end_ms = range_end.getTime();
  const earliest_visible_ms = range_start_ms - duration_ms;
  const start = wall_clock_of(start_ms, time_zone);
  const emitted = new Map<number, Date>();

  const push_visible = (instant_ms: number) => {
    if (
      instant_ms + duration_ms < range_start_ms ||
      instant_ms > range_end_ms
    ) {
      return;
    }

    if (
      exceptions.has(
        exception_key(instant_ms, event.is_all_day, time_zone) ?? "",
      )
    ) {
      return;
    }

    if (!emitted.has(instant_ms)) {
      emitted.set(instant_ms, new Date(instant_ms));
    }
  };

  let index =
    rule.count === null
      ? period_index_at(earliest_visible_ms, rule, start, week_start, time_zone)
      : 0;
  let counted = 0;
  let periods = 0;
  let done = false;
  const wall_day = (instant_ms: number) => {
    const wall = wall_clock_of(instant_ms, time_zone);

    return day_number(wall.year, wall.month, wall.day);
  };
  const fast_after_day = day_number(start.year, start.month, start.day) + 2;
  const fast_before_day = wall_day(earliest_visible_ms) - 2;
  const fast_until_day = until_ms === null ? null : wall_day(until_ms) - 2;
  const range_end_day = wall_day(range_end_ms);

  let candidates_seen = 0;

  while (
    !done &&
    periods < MAX_PERIODS &&
    emitted.size < MAX_WINDOW_RESULTS &&
    candidates_seen < MAX_CANDIDATES
  ) {
    periods += 1;

    if (!spend_budget(budget)) {
      break;
    }

    const floor_day = period_floor_day(index, rule, start, week_start);

    if (
      floor_day > range_end_day + 2 ||
      (floor_day >= range_end_day - 2 &&
        period_floor_ms(index, rule, start, week_start, time_zone) >
          range_end_ms)
    ) {
      break;
    }

    for (const day of period_candidates(index, rule, start, week_start)) {
      candidates_seen += 1;

      if (candidates_seen > MAX_CANDIDATES || !spend_budget(budget)) {
        done = true;
        break;
      }

      if (
        rule.count !== null &&
        day >= fast_after_day &&
        day <= fast_before_day &&
        (fast_until_day === null || day <= fast_until_day)
      ) {
        counted += 1;

        if (counted > rule.count) {
          done = true;
          break;
        }

        continue;
      }

      const date = date_of_day_number(day);
      const instant_ms = instant_of(
        {
          year: date.year,
          month: date.month,
          day: date.day,
          hour: start.hour,
          minute: start.minute,
          second: start.second,
          millisecond: start.millisecond,
        },
        time_zone,
      );

      if (instant_ms < start_ms) {
        continue;
      }

      if (until_ms !== null && instant_ms > until_ms) {
        done = true;
        break;
      }

      counted += 1;

      if (rule.count !== null && counted > rule.count) {
        done = true;
        break;
      }

      if (instant_ms > range_end_ms) {
        done = true;
        break;
      }

      push_visible(instant_ms);
    }

    index += 1;
  }

  for (const extra of rule.extra_dates ?? []) {
    const extra_ms = new Date(extra).getTime();

    if (!Number.isNaN(extra_ms)) {
      push_visible(extra_ms);
    }
  }

  return Array.from(emitted.values()).sort(
    (left, right) => left.getTime() - right.getTime(),
  );
}

function start_of_local_day(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function all_day_span_days(start: Date, end: Date): number {
  const diff =
    start_of_local_day(end).getTime() - start_of_local_day(start).getTime();
  return Math.max(0, Math.round(diff / DAY_MS));
}

function all_day_occurrence_end(occurrence: Date, span_days: number): Date {
  const day = start_of_local_day(occurrence);
  day.setDate(day.getDate() + span_days);
  day.setHours(23, 59, 59, 999);
  return day;
}

export function expand_event(
  event: DecryptedCalendarEvent,
  range_start: Date,
  range_end: Date,
  budget?: ExpansionBudget,
): DecryptedCalendarEvent[] {
  const rule = normalize_recurrence(event.recurrence);

  if (!rule) {
    return [event];
  }

  const start = new Date(event.starts_at);
  const original_end = new Date(event.ends_at);
  const duration_ms = Math.min(
    MAX_OCCURRENCE_SPAN_MS,
    Math.max(0, original_end.getTime() - start.getTime()) || 0,
  );
  const span_days = Math.min(
    MAX_OCCURRENCE_SPAN_MS / DAY_MS,
    all_day_span_days(start, original_end),
  );

  return occurrence_starts(event, range_start, range_end, budget).map(
    (occurrence) => {
      const occurrence_iso = occurrence.toISOString();
      const ends = event.is_all_day
        ? all_day_occurrence_end(occurrence, span_days)
        : new Date(occurrence.getTime() + duration_ms);

      return {
        ...event,
        id: build_occurrence_id(event.id, occurrence_iso),
        starts_at: occurrence_iso,
        ends_at: ends.toISOString(),
        recurrence_master_id: event.id,
        occurrence_start: occurrence_iso,
      };
    },
  );
}

export interface ExpandEventsOptions {
  candidate_budget?: number;
}

export function expand_events(
  events: DecryptedCalendarEvent[],
  range_start: Date,
  range_end: Date,
  options: ExpandEventsOptions = {},
): DecryptedCalendarEvent[] {
  const expanded: DecryptedCalendarEvent[] = [];
  const budget =
    options.candidate_budget === undefined
      ? undefined
      : { remaining: options.candidate_budget };

  for (const event of events) {
    for (const occurrence of expand_event(
      event,
      range_start,
      range_end,
      budget,
    )) {
      expanded.push(occurrence);
    }
  }

  return expanded.sort(
    (left, right) =>
      new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
  );
}

export function is_recurring(event: DecryptedCalendarEvent): boolean {
  return normalize_recurrence(event.recurrence) !== null;
}

function format_until(until: string, all_day: boolean): string | null {
  const date = new Date(until);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (all_day) {
    return (
      `${date.getFullYear()}` +
      `${String(date.getMonth() + 1).padStart(2, "0")}` +
      `${String(date.getDate()).padStart(2, "0")}`
    );
  }

  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export interface RruleOptions {
  all_day?: boolean;
}

export function rule_to_rrule(
  rule: RecurrenceRule,
  options: RruleOptions = {},
): string {
  const normalized = normalize_recurrence(rule);

  if (!normalized) {
    return "";
  }

  const parts = [`FREQ=${normalized.frequency.toUpperCase()}`];

  if (normalized.interval > 1) {
    parts.push(`INTERVAL=${normalized.interval}`);
  }

  if (normalized.by_month && normalized.by_month.length > 0) {
    parts.push(`BYMONTH=${normalized.by_month.join(",")}`);
  }

  if (normalized.by_month_day && normalized.by_month_day.length > 0) {
    parts.push(`BYMONTHDAY=${normalized.by_month_day.join(",")}`);
  }

  if (normalized.by_weekday.length > 0) {
    parts.push(
      `BYDAY=${normalized.by_weekday.map((day) => WEEKDAY_CODES[day]).join(",")}`,
    );
  }

  if (normalized.by_set_pos && normalized.by_set_pos.length > 0) {
    parts.push(`BYSETPOS=${normalized.by_set_pos.join(",")}`);
  }

  if (normalized.count !== null) {
    parts.push(`COUNT=${normalized.count}`);
  }

  if (normalized.until) {
    const until = format_until(normalized.until, options.all_day === true);

    if (until) {
      parts.push(`UNTIL=${until}`);
    }
  }

  if (normalized.week_start !== undefined) {
    parts.push(`WKST=${WEEKDAY_CODES[normalized.week_start]}`);
  }

  return parts.join(";");
}

function parse_int_list(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry));
}

function parse_by_day(raw: string | undefined): {
  weekdays: number[];
  ordinals: number[];
  plain_count: number;
} {
  const weekdays: number[] = [];
  const ordinals: number[] = [];
  let plain_count = 0;

  if (!raw) {
    return { weekdays, ordinals, plain_count };
  }

  for (const chunk of raw.split(",")) {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(chunk.trim());

    if (!match) {
      continue;
    }

    const weekday = WEEKDAY_CODES.indexOf(match[2].toUpperCase());

    if (weekday < 0) {
      continue;
    }

    weekdays.push(weekday);

    if (match[1]) {
      ordinals.push(Number.parseInt(match[1], 10));
    } else {
      plain_count += 1;
    }
  }

  return { weekdays, ordinals, plain_count };
}

export function parse_until(raw: string): string | null {
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/[^0-9TZ]/g, "");
  const date_only = /^(\d{4})(\d{2})(\d{2})$/.exec(compact);

  if (date_only) {
    const parsed = new Date(
      Number(date_only[1]),
      Number(date_only[2]) - 1,
      Number(date_only[3]),
      23,
      59,
      59,
      999,
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(
    compact,
  );

  if (!full) {
    return null;
  }

  const [, year, month, day, hour, minute, second, zulu] = full;
  const parsed =
    zulu === "Z"
      ? new Date(
          Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
          ),
        )
      : new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        );

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function rrule_to_rule(value: string): RecurrenceRule | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const fields = new Map<string, string>();

  for (const chunk of value.split(";")) {
    const index = chunk.indexOf("=");

    if (index > 0) {
      fields.set(
        chunk.slice(0, index).trim().toUpperCase(),
        chunk.slice(index + 1).trim(),
      );
    }
  }

  let freq = (fields.get("FREQ") ?? "").toLowerCase() as RecurrenceFrequency;

  if (!FREQUENCIES.has(freq)) {
    return null;
  }

  const until_raw = fields.get("UNTIL");
  const until = until_raw ? parse_until(until_raw) : null;
  const by_day = parse_by_day(fields.get("BYDAY"));
  const explicit_set_pos = parse_int_list(fields.get("BYSETPOS"));
  const by_month_day = parse_int_list(fields.get("BYMONTHDAY"));
  const by_month = parse_int_list(fields.get("BYMONTH"));
  const interval = Number.parseInt(fields.get("INTERVAL") ?? "1", 10);
  const has_ordinals =
    by_day.ordinals.length > 0 && (freq === "monthly" || freq === "yearly");
  let by_weekday = by_day.weekdays;
  let by_set_pos = explicit_set_pos;

  if (freq === "daily" && by_weekday.length > 0) {
    if (
      (Number.isFinite(interval) && interval > 1) ||
      by_month_day.length > 0 ||
      by_month.length > 0 ||
      explicit_set_pos.length > 0
    ) {
      return null;
    }

    freq = "weekly";
  }

  if (freq === "daily" && (by_month_day.length > 0 || by_month.length > 0)) {
    return null;
  }

  if (freq === "weekly" && (by_month_day.length > 0 || by_month.length > 0)) {
    return null;
  }

  if (freq === "monthly" && by_month.length > 0) {
    return null;
  }

  if (freq === "daily" && explicit_set_pos.length > 0) {
    return null;
  }

  if (has_ordinals) {
    const single_weekday = by_day.weekdays.every(
      (entry) => entry === by_day.weekdays[0],
    );

    if (
      by_day.plain_count > 0 ||
      !single_weekday ||
      explicit_set_pos.length > 0 ||
      by_month_day.length > 0 ||
      (freq === "yearly" && by_month.length > 1)
    ) {
      return null;
    }

    by_weekday = [by_day.weekdays[0]];
    by_set_pos = Array.from(new Set(by_day.ordinals));
  }

  const wkst = fields.get("WKST");
  const week_start = wkst
    ? WEEKDAY_CODES.indexOf(wkst.trim().toUpperCase())
    : -1;

  return normalize_recurrence({
    frequency: freq,
    interval,
    by_weekday,
    count: fields.has("COUNT")
      ? Number.parseInt(fields.get("COUNT") ?? "0", 10)
      : null,
    until,
    by_month_day,
    by_month,
    by_set_pos,
    week_start: week_start >= 0 ? week_start : undefined,
  });
}
