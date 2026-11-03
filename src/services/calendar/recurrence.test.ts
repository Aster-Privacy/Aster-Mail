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
import type { DecryptedCalendarEvent, RecurrenceRule } from "@/types/calendar";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  build_occurrence_id,
  exception_key,
  expand_event,
  expand_events,
  is_exception,
  is_recurring,
  normalize_recurrence,
  occurrence_starts,
  parse_occurrence_id,
  rrule_to_rule,
  rule_to_rrule,
  zone_formatter,
  zone_offset_ms,
} from "@/services/calendar/recurrence";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "event_1",
    calendar_id: "calendar_1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: new Date(2026, 0, 5, 9, 0, 0, 0).toISOString(),
    ends_at: new Date(2026, 0, 5, 9, 30, 0, 0).toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: true,
    guests_can_see_guests: true,
    reminder_minutes: null,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: new Date(2026, 0, 1).toISOString(),
    updated_at: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    frequency: "daily",
    interval: 1,
    by_weekday: [],
    count: null,
    until: null,
    ...overrides,
  };
}

describe("normalize_recurrence", () => {
  it("returns null for missing or invalid rules", () => {
    expect(normalize_recurrence(null)).toBeNull();
    expect(normalize_recurrence(undefined)).toBeNull();
    expect(
      normalize_recurrence({ ...rule(), frequency: "hourly" as never }),
    ).toBeNull();
  });

  it("clamps interval into range", () => {
    expect(normalize_recurrence(rule({ interval: 0 }))?.interval).toBe(1);
    expect(normalize_recurrence(rule({ interval: 9999 }))?.interval).toBe(365);
    expect(normalize_recurrence(rule({ interval: 2.7 }))?.interval).toBe(2);
  });

  it("drops by_weekday for daily rules and keeps it elsewhere", () => {
    expect(
      normalize_recurrence(rule({ frequency: "daily", by_weekday: [1, 3] }))
        ?.by_weekday,
    ).toEqual([]);
    expect(
      normalize_recurrence(rule({ frequency: "weekly", by_weekday: [3, 1, 1] }))
        ?.by_weekday,
    ).toEqual([1, 3]);
    expect(
      normalize_recurrence(rule({ frequency: "monthly", by_weekday: [5] }))
        ?.by_weekday,
    ).toEqual([5]);
  });

  it("keeps the stored five field shape when no extended field is set", () => {
    expect(normalize_recurrence(rule())).toEqual({
      frequency: "daily",
      interval: 1,
      by_weekday: [],
      count: null,
      until: null,
    });
    expect(
      Object.keys(normalize_recurrence(rule({ by_month_day: [] })) ?? {}),
    ).toEqual(["frequency", "interval", "by_weekday", "count", "until"]);
  });

  it("validates the extended fields additively", () => {
    const normalized = normalize_recurrence(
      rule({
        frequency: "monthly",
        by_month_day: [31, -1, 0, 32, -32, 15, 15],
        by_set_pos: [0, -1, 400],
        week_start: 0,
        extra_dates: ["nonsense", "2026-02-01T09:00:00Z"],
        time_zone: "Europe/Berlin",
      }),
    );

    expect(normalized?.by_month_day).toEqual([-1, 15, 31]);
    expect(normalized?.by_set_pos).toEqual([-1]);
    expect(normalized?.week_start).toBe(0);
    expect(normalized?.extra_dates).toEqual(["2026-02-01T09:00:00.000Z"]);
    expect(normalized?.time_zone).toBe("Europe/Berlin");
  });

  it("drops an unknown time zone, a monday week start and by_set_pos without a by filter", () => {
    const normalized = normalize_recurrence(
      rule({
        frequency: "monthly",
        by_set_pos: [-1],
        week_start: 1,
        time_zone: "Not/AZone",
      }),
    );

    expect(normalized).not.toHaveProperty("by_set_pos");
    expect(normalized).not.toHaveProperty("week_start");
    expect(normalized).not.toHaveProperty("time_zone");
  });

  it("limits by_month_day to monthly and yearly and by_month to yearly", () => {
    expect(
      normalize_recurrence(rule({ frequency: "weekly", by_month_day: [1] })),
    ).not.toHaveProperty("by_month_day");
    expect(
      normalize_recurrence(rule({ frequency: "monthly", by_month: [1] })),
    ).not.toHaveProperty("by_month");
    expect(
      normalize_recurrence(rule({ frequency: "yearly", by_month: [12, 1, 13] }))
        ?.by_month,
    ).toEqual([1, 12]);
  });

  it("rejects out of range weekdays", () => {
    expect(
      normalize_recurrence(
        rule({ frequency: "weekly", by_weekday: [-1, 7, 2] }),
      )?.by_weekday,
    ).toEqual([2]);
  });

  it("prefers until over count", () => {
    const normalized = normalize_recurrence(
      rule({ count: 5, until: new Date(2026, 5, 1).toISOString() }),
    );

    expect(normalized?.count).toBeNull();
    expect(normalized?.until).not.toBeNull();
  });
});

describe("occurrence identifiers", () => {
  it("round trips", () => {
    const iso = new Date(2026, 0, 5, 9).toISOString();
    const id = build_occurrence_id("abc", iso);

    expect(parse_occurrence_id(id)).toEqual({
      master_id: "abc",
      occurrence_start: iso,
    });
  });

  it("treats plain ids as masters", () => {
    expect(parse_occurrence_id("abc")).toEqual({
      master_id: "abc",
      occurrence_start: null,
    });
  });
});

describe("occurrence_starts", () => {
  it("returns nothing for non recurring events", () => {
    expect(
      occurrence_starts(
        make_event(),
        new Date(2026, 0, 1),
        new Date(2026, 0, 31),
      ),
    ).toEqual([]);
  });

  it("caps the visible span of an occurrence that lasts for centuries", () => {
    const event = make_event({
      starts_at: "1970-01-01T00:00:00.000Z",
      ends_at: "9999-12-31T00:00:00.000Z",
      recurrence: rule(),
    });
    const range_start = new Date(Date.UTC(2026, 0, 5));
    const range_end = new Date(Date.UTC(2026, 0, 6));

    expect(
      occurrence_starts(event, range_start, range_end).length,
    ).toBeLessThanOrEqual(368);
    expect(() => expand_event(event, range_start, range_end)).not.toThrow();
  });

  it("expands a daily rule across the range", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule() }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 11, 23, 59),
    );

    expect(starts).toHaveLength(7);
    expect(starts[0].getDate()).toBe(5);
    expect(starts[6].getDate()).toBe(11);
  });

  it("honours interval on daily rules", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ interval: 3 }) }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 15, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 8, 11, 14]);
  });

  it("expands weekly rules on selected weekdays", () => {
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ frequency: "weekly", by_weekday: [1, 3, 5] }),
      }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 11, 23, 59),
    );

    expect(starts.map((date) => date.getDay())).toEqual([1, 3, 5]);
  });

  it("skips weeks when weekly interval is greater than one", () => {
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ frequency: "weekly", interval: 2, by_weekday: [1] }),
      }),
      new Date(2026, 0, 5),
      new Date(2026, 1, 2, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 19, 2]);
  });

  it("defaults weekly rules to the start weekday", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "weekly" }) }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 26, 23, 59),
    );

    expect(starts.map((date) => date.getDay())).toEqual([1, 1, 1, 1]);
  });

  it("expands monthly rules and clamps short months", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 31, 9).toISOString(),
        ends_at: new Date(2026, 0, 31, 10).toISOString(),
        recurrence: rule({ frequency: "monthly" }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 3, 30, 23, 59),
    );

    expect(starts.map((date) => date.getMonth())).toEqual([0, 1, 2, 3]);
    expect(starts[1].getDate()).toBe(28);
  });

  it("keeps the anchor day when a clamped month is followed by a long month", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 31, 9).toISOString(),
        ends_at: new Date(2026, 0, 31, 10).toISOString(),
        recurrence: rule({ frequency: "monthly" }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 4, 31, 23, 59),
    );

    expect(starts.map((date) => [date.getMonth(), date.getDate()])).toEqual([
      [0, 31],
      [1, 28],
      [2, 31],
      [3, 30],
      [4, 31],
    ]);
  });

  it("clamps a day 30 monthly rule per month without drifting", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 30, 9).toISOString(),
        ends_at: new Date(2026, 0, 30, 10).toISOString(),
        recurrence: rule({ frequency: "monthly" }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 3, 30, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([30, 28, 30, 30]);
  });

  it("clamps a leap-day yearly rule to february without drifting to march", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2024, 1, 29, 9).toISOString(),
        ends_at: new Date(2024, 1, 29, 10).toISOString(),
        recurrence: rule({ frequency: "yearly" }),
      }),
      new Date(2024, 0, 1),
      new Date(2028, 2, 1, 23, 59),
    );

    expect(starts.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
      [2024, 1, 29],
      [2025, 1, 28],
      [2026, 1, 28],
      [2027, 1, 28],
      [2028, 1, 29],
    ]);
  });

  it("expands yearly rules", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "yearly" }) }),
      new Date(2026, 0, 1),
      new Date(2029, 0, 31),
    );

    expect(starts.map((date) => date.getFullYear())).toEqual([
      2026, 2027, 2028, 2029,
    ]);
  });

  it("stops at count", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ count: 3 }) }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
    );

    expect(starts).toHaveLength(3);
  });

  it("counts occurrences that fall before the range", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ count: 3 }) }),
      new Date(2026, 0, 7),
      new Date(2026, 0, 31),
    );

    expect(starts.map((date) => date.getDate())).toEqual([7]);
  });

  it("stops at until", () => {
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ until: new Date(2026, 0, 8, 9).toISOString() }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 6, 7, 8]);
  });

  it("omits exception dates", () => {
    const skipped = new Date(2026, 0, 7, 9).toISOString();
    const starts = occurrence_starts(
      make_event({
        recurrence: rule(),
        recurrence_exceptions: [skipped],
      }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 9, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 6, 8, 9]);
  });

  it("includes an occurrence that started before the range but still overlaps it", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 5, 23, 0).toISOString(),
        ends_at: new Date(2026, 0, 6, 1, 0).toISOString(),
        recurrence: rule({ frequency: "weekly" }),
      }),
      new Date(2026, 0, 6, 0, 0),
      new Date(2026, 0, 6, 23, 59),
    );

    expect(starts).toHaveLength(1);
    expect(starts[0].getDate()).toBe(5);
  });
});

describe("expand_event", () => {
  it("returns the event untouched when it does not recur", () => {
    const event = make_event();

    expect(
      expand_event(event, new Date(2026, 0, 1), new Date(2026, 0, 31)),
    ).toEqual([event]);
  });

  it("produces occurrences that keep duration and reference the master", () => {
    const event = make_event({ recurrence: rule() });
    const occurrences = expand_event(
      event,
      new Date(2026, 0, 5),
      new Date(2026, 0, 7, 23, 59),
    );

    expect(occurrences).toHaveLength(3);

    for (const occurrence of occurrences) {
      expect(occurrence.recurrence_master_id).toBe("event_1");
      expect(occurrence.occurrence_start).toBe(occurrence.starts_at);
      expect(
        new Date(occurrence.ends_at).getTime() -
          new Date(occurrence.starts_at).getTime(),
      ).toBe(30 * 60 * 1000);
      expect(occurrence.id.startsWith("event_1::")).toBe(true);
    }

    expect(new Set(occurrences.map((entry) => entry.id)).size).toBe(3);
  });

  it("keeps all-day occurrence ends at end of the local day across DST", () => {
    const event = make_event({
      is_all_day: true,
      starts_at: new Date(2026, 2, 1, 0, 0, 0, 0).toISOString(),
      ends_at: new Date(2026, 2, 1, 23, 59, 59, 999).toISOString(),
      recurrence: rule(),
    });

    const occurrences = expand_event(
      event,
      new Date(2026, 2, 7),
      new Date(2026, 2, 9, 23, 59),
    );

    for (const occurrence of occurrences) {
      const start = new Date(occurrence.starts_at);
      const end = new Date(occurrence.ends_at);

      expect(start.getHours()).toBe(0);
      expect(end.getFullYear()).toBe(start.getFullYear());
      expect(end.getMonth()).toBe(start.getMonth());
      expect(end.getDate()).toBe(start.getDate());
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
    }
  });

  it("preserves multi-day all-day span across DST", () => {
    const event = make_event({
      is_all_day: true,
      starts_at: new Date(2026, 2, 1, 0, 0, 0, 0).toISOString(),
      ends_at: new Date(2026, 2, 3, 23, 59, 59, 999).toISOString(),
      recurrence: rule({ frequency: "weekly" }),
    });

    const occurrences = expand_event(
      event,
      new Date(2026, 2, 8),
      new Date(2026, 2, 8, 23, 59),
    );

    expect(occurrences).toHaveLength(1);

    const start = new Date(occurrences[0].starts_at);
    const end = new Date(occurrences[0].ends_at);

    expect(start.getDate()).toBe(8);
    expect(end.getDate()).toBe(10);
    expect(end.getHours()).toBe(23);
  });
});

describe("expand_events", () => {
  it("mixes recurring and single events in start order", () => {
    const single = make_event({
      id: "single",
      starts_at: new Date(2026, 0, 6, 8, 0).toISOString(),
      ends_at: new Date(2026, 0, 6, 8, 30).toISOString(),
    });
    const series = make_event({ id: "series", recurrence: rule() });

    const expanded = expand_events(
      [series, single],
      new Date(2026, 0, 5),
      new Date(2026, 0, 6, 23, 59),
    );

    expect(expanded.map((entry) => entry.id)).toEqual([
      `series::${new Date(2026, 0, 5, 9).toISOString()}`,
      "single",
      `series::${new Date(2026, 0, 6, 9).toISOString()}`,
    ]);
  });

  it("stops expanding recurring events once the shared budget runs out", () => {
    const series = Array.from({ length: 5 }, (_, index) =>
      make_event({ id: `series_${index}`, recurrence: rule() }),
    );
    const single = make_event({ id: "single" });
    const range_start = new Date(2026, 0, 5);
    const range_end = new Date(2026, 0, 14, 23, 59);

    const unbounded = expand_events([...series, single], range_start, range_end);
    const bounded = expand_events([...series, single], range_start, range_end, {
      candidate_budget: 40,
    });

    expect(unbounded).toHaveLength(51);
    expect(bounded.length).toBeLessThan(unbounded.length);
    expect(bounded.some((entry) => entry.id === "single")).toBe(true);
    expect(
      bounded.filter((entry) => entry.recurrence_master_id === "series_4"),
    ).toHaveLength(0);
  });
});

describe("is_recurring", () => {
  it("reflects the normalized rule", () => {
    expect(is_recurring(make_event())).toBe(false);
    expect(is_recurring(make_event({ recurrence: rule() }))).toBe(true);
    expect(
      is_recurring(
        make_event({
          recurrence: { ...rule(), frequency: "never" as never },
        }),
      ),
    ).toBe(false);
  });
});

describe("rrule serialization", () => {
  it("emits a minimal daily rule", () => {
    expect(rule_to_rrule(rule())).toBe("FREQ=DAILY");
  });

  it("emits interval, weekdays and count", () => {
    expect(
      rule_to_rrule(
        rule({
          frequency: "weekly",
          interval: 2,
          by_weekday: [1, 5],
          count: 10,
        }),
      ),
    ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=10");
  });

  it("emits until in basic utc form", () => {
    const value = rule_to_rrule(
      rule({ until: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)).toISOString() }),
    );

    expect(value).toBe("FREQ=DAILY;UNTIL=20260601T120000Z");
  });

  it("round trips through the parser", () => {
    const original = rule({
      frequency: "weekly",
      interval: 3,
      by_weekday: [0, 2, 4],
      count: 7,
    });

    expect(rrule_to_rule(rule_to_rrule(original))).toEqual(original);
  });

  it("parses until back into an iso string", () => {
    const parsed = rrule_to_rule("FREQ=DAILY;UNTIL=20260601T120000Z");

    expect(parsed?.until).toBe(new Date(Date.UTC(2026, 5, 1, 12)).toISOString());
  });

  it("ignores malformed input", () => {
    expect(rrule_to_rule("")).toBeNull();
    expect(rrule_to_rule("NONSENSE")).toBeNull();
    expect(rrule_to_rule("FREQ=FORTNIGHTLY")).toBeNull();
  });

  it("parses a date only until as the end of that local day", () => {
    const parsed = rrule_to_rule("FREQ=WEEKLY;UNTIL=20260601");

    expect(parsed?.until).toBe(
      new Date(2026, 5, 1, 23, 59, 59, 999).toISOString(),
    );
  });

  it("parses a floating date-time until in local time", () => {
    const parsed = rrule_to_rule("FREQ=DAILY;UNTIL=20260601T120000");

    expect(parsed?.until).toBe(new Date(2026, 5, 1, 12).toISOString());
  });

  it("strips a byday ordinal prefix down to the weekday", () => {
    const parsed = rrule_to_rule("FREQ=WEEKLY;BYDAY=2MO,-1FR");

    expect(parsed?.by_weekday).toEqual([1, 5]);
  });

  it("recovers an until written with lowercase separators", () => {
    const parsed = rrule_to_rule("FREQ=DAILY;UNTIL=20260601t120000z");

    expect(parsed?.until).toBe(new Date(Date.UTC(2026, 5, 1, 12)).toISOString());
  });

  it("lets until win when a rule carries both count and until", () => {
    const parsed = rrule_to_rule("FREQ=DAILY;COUNT=5;UNTIL=20260601T120000Z");

    expect(parsed?.count).toBeNull();
    expect(parsed?.until).toBe(new Date(Date.UTC(2026, 5, 1, 12)).toISOString());
  });
});

describe("by_month_day", () => {
  function monthly_days(
    recurrence: RecurrenceRule,
    start: Date,
    range_end: Date,
  ): number[][] {
    return occurrence_starts(
      make_event({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
        recurrence,
      }),
      new Date(2026, 0, 1),
      range_end,
    ).map((date) => [date.getMonth(), date.getDate()]);
  }

  it("expands a fixed day of the month", () => {
    expect(
      monthly_days(
        rule({ frequency: "monthly", by_month_day: [15] }),
        new Date(2026, 0, 15, 9),
        new Date(2026, 3, 30, 23, 59),
      ),
    ).toEqual([
      [0, 15],
      [1, 15],
      [2, 15],
      [3, 15],
    ]);
  });

  it("expands the last day of every month from a negative value", () => {
    expect(
      monthly_days(
        rule({ frequency: "monthly", by_month_day: [-1] }),
        new Date(2026, 0, 31, 9),
        new Date(2026, 3, 30, 23, 59),
      ),
    ).toEqual([
      [0, 31],
      [1, 28],
      [2, 31],
      [3, 30],
    ]);
  });

  it("skips months that do not have the requested day", () => {
    expect(
      monthly_days(
        rule({ frequency: "monthly", by_month_day: [31] }),
        new Date(2026, 0, 31, 9),
        new Date(2026, 4, 31, 23, 59),
      ),
    ).toEqual([
      [0, 31],
      [2, 31],
      [4, 31],
    ]);
  });

  it("emits several days per month in date order", () => {
    expect(
      monthly_days(
        rule({ frequency: "monthly", by_month_day: [15, 1] }),
        new Date(2026, 0, 1, 9),
        new Date(2026, 1, 28, 23, 59),
      ),
    ).toEqual([
      [0, 1],
      [0, 15],
      [1, 1],
      [1, 15],
    ]);
  });

  it("applies by_month_day to yearly rules inside by_month", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 2, 1, 9).toISOString(),
        ends_at: new Date(2026, 2, 1, 10).toISOString(),
        recurrence: rule({
          frequency: "yearly",
          by_month: [3, 9],
          by_month_day: [-1],
        }),
      }),
      new Date(2026, 0, 1),
      new Date(2027, 11, 31),
    );

    expect(starts.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
      [2026, 2, 31],
      [2026, 8, 30],
      [2027, 2, 31],
      [2027, 8, 30],
    ]);
  });
});

describe("by_set_pos", () => {
  it("expands the last friday of every month", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 30, 9).toISOString(),
        ends_at: new Date(2026, 0, 30, 10).toISOString(),
        recurrence: rule({
          frequency: "monthly",
          by_weekday: [5],
          by_set_pos: [-1],
        }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 3, 30, 23, 59),
    );

    expect(starts.map((date) => [date.getMonth(), date.getDate(), date.getDay()])).toEqual([
      [0, 30, 5],
      [1, 27, 5],
      [2, 27, 5],
      [3, 24, 5],
    ]);
  });

  it("expands the second tuesday parsed from an ordinal BYDAY", () => {
    const recurrence = rrule_to_rule("FREQ=MONTHLY;BYDAY=2TU");

    expect(recurrence?.by_weekday).toEqual([2]);
    expect(recurrence?.by_set_pos).toEqual([2]);

    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 13, 9).toISOString(),
        ends_at: new Date(2026, 0, 13, 10).toISOString(),
        recurrence,
      }),
      new Date(2026, 0, 1),
      new Date(2026, 2, 31, 23, 59),
    );

    expect(starts.map((date) => [date.getMonth(), date.getDate()])).toEqual([
      [0, 13],
      [1, 10],
      [2, 10],
    ]);
  });

  it("expands the fourth thursday of november every year", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 10, 26, 12).toISOString(),
        ends_at: new Date(2026, 10, 26, 13).toISOString(),
        recurrence: rrule_to_rule("FREQ=YEARLY;BYMONTH=11;BYDAY=TH;BYSETPOS=4"),
      }),
      new Date(2026, 0, 1),
      new Date(2028, 11, 31),
    );

    expect(starts.map((date) => [date.getFullYear(), date.getDate()])).toEqual([
      [2026, 26],
      [2027, 25],
      [2028, 23],
    ]);
  });

  it("picks the last weekday of the month from several weekdays", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 30, 9).toISOString(),
        ends_at: new Date(2026, 0, 30, 10).toISOString(),
        recurrence: rrule_to_rule("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 2, 31, 23, 59),
    );

    expect(starts.map((date) => [date.getMonth(), date.getDate()])).toEqual([
      [0, 30],
      [1, 27],
      [2, 31],
    ]);
  });

  it("keeps each ordinal of one weekday from BYDAY", () => {
    const recurrence = rrule_to_rule("FREQ=MONTHLY;BYDAY=1MO,3MO");

    expect(recurrence?.by_weekday).toEqual([1]);
    expect(recurrence?.by_set_pos).toEqual([1, 3]);

    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 0, 5, 9).toISOString(),
        ends_at: new Date(2026, 0, 5, 10).toISOString(),
        recurrence,
      }),
      new Date(2026, 0, 1),
      new Date(2026, 1, 28, 23, 59),
    );

    expect(starts.map((date) => [date.getMonth(), date.getDate()])).toEqual([
      [0, 5],
      [0, 19],
      [1, 2],
      [1, 16],
    ]);
  });

  it("refuses BYDAY ordinals it cannot store", () => {
    expect(rrule_to_rule("FREQ=MONTHLY;BYDAY=1MO,1TU")).toBeNull();
    expect(rrule_to_rule("FREQ=MONTHLY;BYDAY=1MO,FR")).toBeNull();
    expect(rrule_to_rule("FREQ=MONTHLY;BYDAY=2MO;BYSETPOS=1")).toBeNull();
    expect(rrule_to_rule("FREQ=YEARLY;BYMONTH=3,9;BYDAY=1SU")).toBeNull();
  });

  it("matches BYMONTHDAY and BYDAY together", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 1, 13, 9).toISOString(),
        ends_at: new Date(2026, 1, 13, 10).toISOString(),
        recurrence: rrule_to_rule("FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13"),
      }),
      new Date(2026, 0, 1),
      new Date(2027, 11, 31, 23, 59),
    );

    expect(
      starts.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()]),
    ).toEqual([
      [2026, 1, 13],
      [2026, 2, 13],
      [2026, 10, 13],
      [2027, 7, 13],
    ]);
  });

  it("turns a daily BYDAY rule into the same weekly rule", () => {
    const recurrence = rrule_to_rule("FREQ=DAILY;BYDAY=MO,WE,FR");

    expect(recurrence?.frequency).toBe("weekly");
    expect(recurrence?.by_weekday).toEqual([1, 3, 5]);
  });

  it("refuses rule parts the model would widen", () => {
    expect(rrule_to_rule("FREQ=DAILY;INTERVAL=2;BYDAY=MO")).toBeNull();
    expect(rrule_to_rule("FREQ=DAILY;BYMONTH=1")).toBeNull();
    expect(rrule_to_rule("FREQ=WEEKLY;BYMONTH=6,7")).toBeNull();
    expect(rrule_to_rule("FREQ=MONTHLY;BYMONTH=1;BYMONTHDAY=1")).toBeNull();
  });
});

describe("windowed expansion", () => {
  it("keeps an endless daily series alive years after it started", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule() }),
      new Date(2029, 2, 1),
      new Date(2029, 2, 7, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(starts.every((date) => date.getFullYear() === 2029)).toBe(true);
  });

  it("keeps an endless weekly series alive far from its start", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "weekly", by_weekday: [1, 4] }) }),
      new Date(2040, 5, 1),
      new Date(2040, 5, 30, 23, 59),
    );

    expect(starts.length).toBeGreaterThanOrEqual(8);
    expect(starts.every((date) => date.getDay() === 1 || date.getDay() === 4)).toBe(true);
    expect(starts.every((date) => date.getHours() === 9)).toBe(true);
  });

  it("keeps monthly and yearly series alive far from their start", () => {
    const monthly = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "monthly" }) }),
      new Date(2050, 0, 1),
      new Date(2050, 11, 31, 23, 59),
    );
    const yearly = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "yearly" }) }),
      new Date(2100, 0, 1),
      new Date(2100, 11, 31, 23, 59),
    );

    expect(monthly.map((date) => date.getDate())).toEqual(Array(12).fill(5));
    expect(yearly.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
      [2100, 0, 5],
    ]);
  });

  it("still counts a count-limited series from the series start", () => {
    expect(
      occurrence_starts(
        make_event({ recurrence: rule({ count: 5 }) }),
        new Date(2029, 0, 1),
        new Date(2029, 11, 31),
      ),
    ).toEqual([]);
    expect(
      occurrence_starts(
        make_event({ recurrence: rule({ count: 5 }) }),
        new Date(2026, 0, 8),
        new Date(2026, 0, 31),
      ).map((date) => date.getDate()),
    ).toEqual([8, 9]);
  });

  it("accepts a count above the old 730 cap", () => {
    const starts = occurrence_starts(
      make_event({ recurrence: rule({ count: 1000 }) }),
      new Date(2028, 8, 25),
      new Date(2028, 9, 10),
    );

    expect(starts.length).toBeGreaterThan(0);
    expect(starts[starts.length - 1].toISOString()).toBe(
      new Date(2028, 8, 30, 9).toISOString(),
    );
  });

  it("returns nothing when the window ends before the series starts", () => {
    expect(
      occurrence_starts(
        make_event({ recurrence: rule() }),
        new Date(2025, 0, 1),
        new Date(2025, 11, 31),
      ),
    ).toEqual([]);
  });
});

describe("large weekly intervals", () => {
  it("expands a weekly rule with an interval above 57 weeks", () => {
    const event = make_event({
      recurrence: rule({ frequency: "weekly", interval: 60 }),
    });

    expect(
      occurrence_starts(event, new Date(2027, 1, 1), new Date(2027, 2, 31)).map(
        (date) => [date.getFullYear(), date.getMonth(), date.getDate()],
      ),
    ).toEqual([[2027, 2, 1]]);
    expect(
      occurrence_starts(event, new Date(2026, 0, 1), new Date(2028, 11, 31)).map(
        (date) => [date.getFullYear(), date.getMonth(), date.getDate()],
      ),
    ).toEqual([
      [2026, 0, 5],
      [2027, 2, 1],
      [2028, 3, 24],
    ]);
  });

  it("expands the largest allowed daily and weekly intervals", () => {
    const daily = occurrence_starts(
      make_event({ recurrence: rule({ interval: 365 }) }),
      new Date(2026, 0, 1),
      new Date(2028, 11, 31),
    );
    const weekly = occurrence_starts(
      make_event({ recurrence: rule({ frequency: "weekly", interval: 365 }) }),
      new Date(2026, 0, 1),
      new Date(2033, 11, 31),
    );

    expect(daily.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
      [2026, 0, 5],
      [2027, 0, 5],
      [2028, 0, 5],
    ]);
    expect(weekly).toHaveLength(2);
    expect(weekly[1].getTime() - weekly[0].getTime()).toBeGreaterThanOrEqual(
      365 * 7 * 86_400_000 - 3_600_000,
    );
  });

  it("honours a sunday week start on an alternating week rule", () => {
    const base = {
      frequency: "weekly" as const,
      interval: 2,
      by_weekday: [0, 1],
    };
    const monday_weeks = occurrence_starts(
      make_event({ recurrence: rule(base) }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 31, 23, 59),
    );
    const sunday_weeks = occurrence_starts(
      make_event({ recurrence: rule({ ...base, week_start: 0 }) }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 31, 23, 59),
    );

    expect(monday_weeks.map((date) => date.getDate())).toEqual([5, 11, 19, 25]);
    expect(sunday_weeks.map((date) => date.getDate())).toEqual([5, 18, 19]);
  });
});

describe("extra dates", () => {
  it("adds rdate style extra dates to the set without counting them", () => {
    const extra = new Date(2026, 0, 20, 9).toISOString();
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ count: 2, extra_dates: [extra] }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 6, 20]);
  });

  it("does not duplicate an extra date that the rule already produces", () => {
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({
          count: 3,
          extra_dates: [new Date(2026, 0, 6, 9).toISOString()],
        }),
      }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 6, 7]);
  });

  it("removes an extra date that is also an exception and ignores one outside the window", () => {
    const inside = new Date(2026, 0, 20, 9).toISOString();
    const outside = new Date(2026, 5, 20, 9).toISOString();
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ count: 1, extra_dates: [inside, outside] }),
        recurrence_exceptions: [inside],
      }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5]);
  });

  it("expands extra dates into occurrences with the master duration", () => {
    const extra = new Date(2026, 0, 20, 9).toISOString();
    const occurrences = expand_event(
      make_event({ recurrence: rule({ count: 1, extra_dates: [extra] }) }),
      new Date(2026, 0, 20),
      new Date(2026, 0, 20, 23, 59),
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].starts_at).toBe(extra);
    expect(occurrences[0].ends_at).toBe(new Date(2026, 0, 20, 9, 30).toISOString());
    expect(occurrences[0].occurrence_start).toBe(extra);
  });
});

describe("exception matching", () => {
  it("matches exceptions by instant rather than by iso spelling", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: "2026-10-09T13:00:00.000Z",
        ends_at: "2026-10-09T13:30:00.000Z",
        recurrence: rule(),
        recurrence_exceptions: ["2026-10-10T13:00:00Z", "2026-10-11T14:00:00+01:00"],
      }),
      new Date("2026-10-09T00:00:00Z"),
      new Date("2026-10-12T23:59:59Z"),
    );

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-10-09T13:00:00.000Z",
      "2026-10-12T13:00:00.000Z",
    ]);
  });

  it("matches all-day exceptions by local date", () => {
    const starts = occurrence_starts(
      make_event({
        is_all_day: true,
        starts_at: new Date(2026, 0, 5).toISOString(),
        ends_at: new Date(2026, 0, 5, 23, 59, 59, 999).toISOString(),
        recurrence: rule(),
        recurrence_exceptions: [new Date(2026, 0, 7, 12).toISOString()],
      }),
      new Date(2026, 0, 5),
      new Date(2026, 0, 9, 23, 59),
    );

    expect(starts.map((date) => date.getDate())).toEqual([5, 6, 8, 9]);
  });

  it("ignores an unparseable exception", () => {
    const starts = occurrence_starts(
      make_event({
        recurrence: rule({ count: 2 }),
        recurrence_exceptions: ["garbage"],
      }),
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
    );

    expect(starts).toHaveLength(2);
  });

  it("exposes the key and a membership check", () => {
    expect(exception_key("2026-10-09T13:00:00Z", false)).toBe(
      exception_key("2026-10-09T13:00:00.000Z", false),
    );
    expect(exception_key("garbage", false)).toBeNull();
    expect(
      exception_key(new Date(2026, 0, 7, 12).toISOString(), true),
    ).toBe("2026-01-07");
    expect(
      exception_key("2026-01-07T23:30:00.000Z", true, "Europe/Berlin"),
    ).toBe("2026-01-08");

    const event = make_event({
      recurrence: rule(),
      recurrence_exceptions: ["2026-10-10T13:00:00Z"],
    });

    expect(is_exception(event, "2026-10-10T13:00:00.000Z")).toBe(true);
    expect(is_exception(event, "2026-10-11T13:00:00.000Z")).toBe(false);
    expect(
      is_exception(
        { is_all_day: true, recurrence_exceptions: [new Date(2026, 0, 7).toISOString()] },
        new Date(2026, 0, 7, 18),
      ),
    ).toBe(true);
  });
});

describe("daylight saving time", () => {
  it("keeps a weekly 9 AM New York event at 9 AM across the spring forward", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: "2026-03-01T14:00:00.000Z",
        ends_at: "2026-03-01T14:30:00.000Z",
        recurrence: rule({ frequency: "weekly", time_zone: "America/New_York" }),
      }),
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-22T23:59:59Z"),
    );

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-15T13:00:00.000Z",
      "2026-03-22T13:00:00.000Z",
    ]);
  });

  it("keeps a weekly 9 AM Berlin event at 9 AM across the fall back", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: "2026-10-11T07:00:00.000Z",
        ends_at: "2026-10-11T07:30:00.000Z",
        recurrence: rule({ frequency: "weekly", time_zone: "Europe/Berlin" }),
      }),
      new Date("2026-10-11T00:00:00Z"),
      new Date("2026-11-01T23:59:59Z"),
    );

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-10-11T07:00:00.000Z",
      "2026-10-18T07:00:00.000Z",
      "2026-10-25T08:00:00.000Z",
      "2026-11-01T08:00:00.000Z",
    ]);
  });

  it("keeps a zoned daily series on its wall clock regardless of the host zone", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: "2026-03-07T14:00:00.000Z",
        ends_at: "2026-03-07T15:00:00.000Z",
        recurrence: rule({ time_zone: "America/New_York" }),
      }),
      new Date("2026-03-07T00:00:00Z"),
      new Date("2026-03-09T23:59:59Z"),
    );

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
  });

  it("skips a window entirely inside the zone shift without duplicating or losing days", () => {
    const starts = occurrence_starts(
      make_event({
        starts_at: "2026-03-01T14:00:00.000Z",
        ends_at: "2026-03-01T14:30:00.000Z",
        recurrence: rule({ time_zone: "America/New_York" }),
      }),
      new Date("2026-03-08T00:00:00Z"),
      new Date("2026-03-08T23:59:59Z"),
    );

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-03-08T13:00:00.000Z",
    ]);
  });

  it("ends an old count-limited zoned series on the right day", () => {
    const cases = [
      ["America/New_York", "1999-01-01T14:00:00.000Z", "2026-05-18T13:00:00.000Z"],
      ["Pacific/Kiritimati", "1994-01-02T09:00:00.000Z", "2021-05-18T09:00:00.000Z"],
    ] as const;

    for (const [time_zone, starts_at, last] of cases) {
      const event = make_event({
        starts_at,
        ends_at: new Date(new Date(starts_at).getTime() + 1_800_000).toISOString(),
        recurrence: rule({ count: 10_000, time_zone }),
      });
      const end = new Date(last).getTime();
      const starts = occurrence_starts(
        event,
        new Date(end - 3.5 * 86_400_000),
        new Date(end + 7 * 86_400_000),
      );

      expect(starts).toHaveLength(4);
      expect(starts[starts.length - 1].toISOString()).toBe(last);
    }
  });
});

describe("daylight saving time in host local time", () => {
  const previous_zone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    if (previous_zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous_zone;
    }
  });

  it("keeps a weekly 9 AM local event at 9 AM across the spring forward", () => {
    expect(new Date(2026, 2, 1).getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 2, 15).getTimezoneOffset()).toBe(240);

    const starts = occurrence_starts(
      make_event({
        starts_at: new Date(2026, 2, 1, 9).toISOString(),
        ends_at: new Date(2026, 2, 1, 9, 30).toISOString(),
        recurrence: rule({ frequency: "weekly" }),
      }),
      new Date(2026, 2, 1),
      new Date(2026, 2, 22, 23, 59),
    );

    expect(starts.map((date) => date.getHours())).toEqual([9, 9, 9, 9]);
    expect(starts.map((date) => date.getUTCHours())).toEqual([14, 13, 13, 13]);
  });
});

describe("extended rrule round trips", () => {
  it("round trips by_month_day with a negative value and a count", () => {
    const text = "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12";
    const parsed = rrule_to_rule(text);

    expect(parsed?.by_month_day).toEqual([-1]);
    expect(parsed?.count).toBe(12);
    expect(rule_to_rrule(parsed as RecurrenceRule)).toBe(text);
  });

  it("round trips the last friday of the month", () => {
    const text = "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1";
    const parsed = rrule_to_rule(text);

    expect(parsed).toEqual({
      frequency: "monthly",
      interval: 1,
      by_weekday: [5],
      count: null,
      until: null,
      by_set_pos: [-1],
    });
    expect(rule_to_rrule(parsed as RecurrenceRule)).toBe(text);
  });

  it("round trips a yearly rule with by_month, by_day and by_set_pos", () => {
    const text = "FREQ=YEARLY;BYMONTH=11;BYDAY=TH;BYSETPOS=4";

    expect(rule_to_rrule(rrule_to_rule(text) as RecurrenceRule)).toBe(text);
  });

  it("round trips wkst and drops the monday default", () => {
    const text = "FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU";
    const parsed = rrule_to_rule(text);

    expect(parsed?.week_start).toBe(0);
    expect(rule_to_rrule(parsed as RecurrenceRule)).toBe(text);
    expect(rule_to_rrule(rrule_to_rule("FREQ=WEEKLY;WKST=MO") as RecurrenceRule)).toBe(
      "FREQ=WEEKLY",
    );
  });

  it("round trips a date form until for all-day rules", () => {
    const until = new Date(2026, 2, 31, 23, 59, 59, 999).toISOString();
    const text = rule_to_rrule(rule({ until }), { all_day: true });

    expect(text).toBe("FREQ=DAILY;UNTIL=20260331");
    expect(rrule_to_rule(text)?.until).toBe(until);
  });

  it("round trips a date-time until for timed rules", () => {
    const until = new Date(Date.UTC(2026, 2, 31, 16, 30, 0)).toISOString();
    const text = rule_to_rrule(rule({ until }));

    expect(text).toBe("FREQ=DAILY;UNTIL=20260331T163000Z");
    expect(rrule_to_rule(text)?.until).toBe(until);
  });

  it("round trips count together with the extended fields", () => {
    const original = rule({
      frequency: "monthly",
      interval: 3,
      by_month_day: [1, 15, -1],
      by_set_pos: [1],
      count: 9,
    });
    const text = rule_to_rrule(original);

    expect(text).toBe("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1,1,15;BYSETPOS=1;COUNT=9");
    expect(rrule_to_rule(text)).toEqual(normalize_recurrence(original));
  });

  it("refuses mixed ordinal BYDAY values it cannot store", () => {
    expect(rrule_to_rule("FREQ=MONTHLY;BYDAY=1MO,-1FR")).toBeNull();
  });

  it("refuses an explicit BYSETPOS combined with a BYDAY ordinal", () => {
    expect(rrule_to_rule("FREQ=MONTHLY;BYDAY=2TU;BYSETPOS=-1")).toBeNull();
  });

  it("does not write extra dates or the time zone into the rrule text", () => {
    expect(
      rule_to_rrule(
        rule({
          extra_dates: ["2026-02-01T09:00:00.000Z"],
          time_zone: "Europe/Berlin",
        }),
      ),
    ).toBe("FREQ=DAILY");
  });
});

describe("until validation", () => {
  it("drops an unparseable until and falls back to count", () => {
    expect(normalize_recurrence(rule({ count: 4, until: "not a date" }))).toEqual(
      expect.objectContaining({ count: 4, until: null }),
    );
    expect(normalize_recurrence(rule({ until: "garbage" }))).toEqual(
      expect.objectContaining({ count: null, until: null }),
    );
  });

  it("keeps a parseable until", () => {
    expect(
      normalize_recurrence(rule({ until: "2026-06-01T00:00:00.000Z" }))?.until,
    ).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("zone formatter cache", () => {
  it("reuses one formatter per time zone", () => {
    expect(zone_formatter("Europe/Berlin")).toBe(zone_formatter("Europe/Berlin"));
    expect(zone_formatter("Europe/Berlin")).not.toBe(zone_formatter("Asia/Tokyo"));
    expect(zone_offset_ms("Asia/Tokyo", Date.UTC(2026, 0, 1))).toBe(9 * 60 * 60 * 1000);
    expect(zone_offset_ms("Not/AZone", Date.UTC(2026, 0, 1))).toBeNull();
  });
});
