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

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  add_days,
  add_months,
  bucket_events_by_day,
  build_event_link,
  build_month_grid,
  day_key,
  pick_next_event,
  plain_text,
  resolve_event_color,
  safe_color,
  start_of_day,
  week_start_day_index,
} from "./desktop_calendar_days";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt_1",
    calendar_id: "cal_1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: new Date(2026, 10, 24, 9, 0).toISOString(),
    ends_at: new Date(2026, 10, 24, 9, 30).toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function make_calendar(
  overrides: Partial<DecryptedCalendar> = {},
): DecryptedCalendar {
  return {
    id: "cal_1",
    name: "Personal",
    color: "#3b82f6",
    icon: "calendar",
    is_visible: true,
    is_default: true,
    ...overrides,
  };
}

describe("desktop calendar month grid", () => {
  it("starts on the preferred weekday and covers six weeks", () => {
    const sunday_grid = build_month_grid(new Date(2026, 10, 15), 0);
    const monday_grid = build_month_grid(new Date(2026, 10, 15), 1);

    expect(sunday_grid).toHaveLength(42);
    expect(sunday_grid[0].getDay()).toBe(0);
    expect(monday_grid[0].getDay()).toBe(1);
    expect(
      sunday_grid.some(
        (day) => day.getMonth() === 10 && day.getDate() === 1,
      ),
    ).toBe(true);
    expect(
      sunday_grid.some(
        (day) => day.getMonth() === 10 && day.getDate() === 30,
      ),
    ).toBe(true);
  });

  it("maps week start preferences to weekday indexes", () => {
    expect(week_start_day_index("monday")).toBe(1);
    expect(week_start_day_index("saturday")).toBe(6);
    expect(week_start_day_index(undefined)).toBe(0);
  });

  it("clamps month navigation to the last day of a shorter month", () => {
    const next = add_months(new Date(2026, 0, 31), 1);

    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });
});

describe("desktop calendar day buckets", () => {
  const days = [new Date(2026, 10, 24), new Date(2026, 10, 25)];

  it("puts all-day events first and sorts timed events by start", () => {
    const late = make_event({
      id: "late",
      starts_at: new Date(2026, 10, 24, 15).toISOString(),
      ends_at: new Date(2026, 10, 24, 16).toISOString(),
    });
    const early = make_event({ id: "early" });
    const all_day = make_event({
      id: "all_day",
      is_all_day: true,
      starts_at: start_of_day(new Date(2026, 10, 24)).toISOString(),
      ends_at: start_of_day(new Date(2026, 10, 25)).toISOString(),
    });
    const buckets = bucket_events_by_day([late, early, all_day], days);

    expect(buckets.get(day_key(days[0]))?.map((event) => event.id)).toEqual([
      "all_day",
      "early",
      "late",
    ]);
    expect(buckets.get(day_key(days[1]))).toEqual([]);
  });

  it("shows an event that crosses midnight on both days", () => {
    const overnight = make_event({
      id: "overnight",
      starts_at: new Date(2026, 10, 24, 22).toISOString(),
      ends_at: new Date(2026, 10, 25, 2).toISOString(),
    });
    const buckets = bucket_events_by_day([overnight], days);

    expect(buckets.get(day_key(days[0]))).toHaveLength(1);
    expect(buckets.get(day_key(days[1]))).toHaveLength(1);
  });

  it("skips events with unreadable dates", () => {
    const broken = make_event({ starts_at: "not a date" });
    const buckets = bucket_events_by_day([broken], days);

    expect(buckets.get(day_key(days[0]))).toEqual([]);
  });
});

describe("desktop calendar up next", () => {
  const now = new Date(2026, 10, 24, 8, 0);
  const calendars = [make_calendar()];

  it("picks the soonest timed event that has not ended", () => {
    const past = make_event({
      id: "past",
      starts_at: new Date(2026, 10, 24, 6).toISOString(),
      ends_at: new Date(2026, 10, 24, 7).toISOString(),
    });
    const later = make_event({
      id: "later",
      starts_at: new Date(2026, 10, 24, 11).toISOString(),
      ends_at: new Date(2026, 10, 24, 12).toISOString(),
    });
    const soon = make_event({ id: "soon" });

    expect(
      pick_next_event([past, later, soon], calendars, now, "me@example.org")
        ?.event.id,
    ).toBe("soon");
  });

  it("ignores cancelled, declined, task, and hidden calendar events", () => {
    const cancelled = make_event({ id: "cancelled", status: "cancelled" });
    const declined = make_event({
      id: "declined",
      attendees: [
        {
          email: "me@example.org",
          display_name: null,
          response: "declined",
          is_organizer: false,
        },
      ],
    });
    const task = make_event({ id: "task", event_kind: "task" });
    const hidden = make_event({ id: "hidden", calendar_id: "cal_hidden" });
    const hidden_calendar = make_calendar({
      id: "cal_hidden",
      is_visible: false,
    });

    expect(
      pick_next_event(
        [cancelled, declined, task, hidden],
        [...calendars, hidden_calendar],
        now,
        "me@example.org",
      ),
    ).toBeNull();
  });

  it("falls back to an all-day event when nothing timed is coming", () => {
    const all_day = make_event({
      id: "holiday",
      is_all_day: true,
      starts_at: start_of_day(add_days(now, 2)).toISOString(),
      ends_at: start_of_day(add_days(now, 3)).toISOString(),
    });

    expect(
      pick_next_event([all_day], calendars, now, "me@example.org")?.event.id,
    ).toBe("holiday");
  });

  it("ignores events beyond the look-ahead window", () => {
    const far = make_event({
      starts_at: add_days(now, 20).toISOString(),
      ends_at: add_days(now, 20.1).toISOString(),
    });

    expect(pick_next_event([far], calendars, now, "")).toBeNull();
  });
});

describe("desktop calendar colors and links", () => {
  it("accepts only hex colors", () => {
    expect(safe_color("#a1b2c3")).toBe("#a1b2c3");
    expect(safe_color("red; background:url(x)")).toBeNull();
    expect(safe_color("var(--x)")).toBeNull();
    expect(safe_color(null)).toBeNull();
  });

  it("falls back from event color to calendar color to the accent", () => {
    const calendars = new Map([["cal_1", make_calendar({ color: "#ff0000" })]]);

    expect(resolve_event_color(make_event({ color: "#00ff00" }), calendars)).toBe(
      "#00ff00",
    );
    expect(resolve_event_color(make_event(), calendars)).toBe("#ff0000");
    expect(resolve_event_color(make_event({ calendar_id: "x" }), calendars)).toBe(
      "var(--accent-color)",
    );
  });

  it("links to the event on the calendar origin only", () => {
    const link = new URL(
      build_event_link(make_event({ id: "evt/../../x?y" })),
    );

    expect(link.origin).toBe("https://calendar.astermail.org");
    expect(link.pathname).toBe("/");
    expect(link.searchParams.get("event")).toBe("evt/../../x?y");
    expect(link.searchParams.get("date")).toBe("2026-11-24");
  });

  it("shows descriptions as plain text", () => {
    expect(plain_text("<b>Agenda</b><script>alert(1)</script> items")).not.toContain(
      "<",
    );
    expect(plain_text("  plain  ")).toBe("plain");
  });
});

describe("desktop calendar in another time zone", () => {
  const original_tz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Pacific/Auckland";
  });

  afterAll(() => {
    process.env.TZ = original_tz;
  });

  it("places an event on the local day of its instant", () => {
    const event = make_event({
      starts_at: "2026-11-24T20:00:00.000Z",
      ends_at: "2026-11-24T21:00:00.000Z",
    });
    const local_start = new Date(event.starts_at);
    const buckets = bucket_events_by_day(
      [event],
      [new Date(2026, 10, 24), new Date(2026, 10, 25)],
    );

    expect(local_start.getDate()).toBe(25);
    expect(buckets.get(day_key(new Date(2026, 10, 24)))).toEqual([]);
    expect(buckets.get(day_key(new Date(2026, 10, 25)))).toHaveLength(1);
    expect(
      new URL(build_event_link(event)).searchParams.get("date"),
    ).toBe("2026-11-25");
  });
});
