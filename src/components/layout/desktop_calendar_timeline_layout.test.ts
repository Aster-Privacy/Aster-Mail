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

import { describe, it, expect } from "vitest";

import {
  HOUR_HEIGHT,
  initial_scroll_minute,
  layout_day,
  minute_to_offset,
  next_draft_start,
  offset_to_minute,
  snap_minute,
} from "./desktop_calendar_timeline_layout";

const day = new Date(2026, 10, 27);

function at(hour: number, minute = 0, offset_days = 0): string {
  return new Date(2026, 10, 27 + offset_days, hour, minute).toISOString();
}

function make_event(
  id: string,
  starts_at: string,
  ends_at: string,
  is_all_day = false,
): DecryptedCalendarEvent {
  return {
    id,
    calendar_id: "cal_1",
    title: id,
    starts_at,
    ends_at,
    is_all_day,
  } as DecryptedCalendarEvent;
}

describe("layout_day", () => {
  it("separates all-day events from timed ones", () => {
    const layout = layout_day(
      [
        make_event("offsite", at(0), at(0, 0, 1), true),
        make_event("standup", at(9), at(9, 15)),
      ],
      day,
    );

    expect(layout.all_day.map((event) => event.id)).toEqual(["offsite"]);
    expect(layout.timed.map((item) => item.event.id)).toEqual(["standup"]);
    expect(layout.timed[0]).toMatchObject({
      start_minute: 540,
      end_minute: 555,
      column: 0,
      column_count: 1,
    });
  });

  it("splits overlapping events into columns and reuses free ones", () => {
    const layout = layout_day(
      [
        make_event("a", at(9), at(11)),
        make_event("b", at(9, 30), at(10)),
        make_event("c", at(10), at(10, 30)),
        make_event("d", at(13), at(14)),
      ],
      day,
    );
    const by_id = Object.fromEntries(
      layout.timed.map((item) => [item.event.id, item]),
    );

    expect(by_id.a).toMatchObject({ column: 0, column_count: 2 });
    expect(by_id.b).toMatchObject({ column: 1, column_count: 2 });
    expect(by_id.c).toMatchObject({ column: 1, column_count: 2 });
    expect(by_id.d).toMatchObject({ column: 0, column_count: 1 });
  });

  it("gives very short events enough room to stay readable", () => {
    const layout = layout_day(
      [make_event("a", at(9), at(9, 5)), make_event("b", at(9, 10), at(9, 30))],
      day,
    );

    expect(layout.timed.map((item) => item.column_count)).toEqual([2, 2]);
  });

  it("clips events that cross midnight to the selected day", () => {
    const layout = layout_day(
      [
        make_event("late", at(22, 0, -1), at(2)),
        make_event("night", at(23), at(1, 0, 1)),
      ],
      day,
    );
    const by_id = Object.fromEntries(
      layout.timed.map((item) => [item.event.id, item]),
    );

    expect(by_id.late).toMatchObject({
      start_minute: 0,
      end_minute: 120,
      starts_before: true,
    });
    expect(by_id.night).toMatchObject({
      start_minute: 1380,
      end_minute: 1440,
      ends_after: true,
    });
  });
});

describe("grid math", () => {
  it("converts between minutes and pixels", () => {
    expect(minute_to_offset(90)).toBe(HOUR_HEIGHT * 1.5);
    expect(offset_to_minute(HOUR_HEIGHT * 2)).toBe(120);
    expect(offset_to_minute(-10)).toBe(0);
    expect(offset_to_minute(HOUR_HEIGHT * 30)).toBe(1440);
  });

  it("snaps down to the quarter hour", () => {
    expect(snap_minute(599)).toBe(585);
    expect(snap_minute(600)).toBe(600);
  });
});

describe("initial_scroll_minute", () => {
  const empty = { all_day: [], timed: [] };

  it("shows the hour before now on today", () => {
    expect(initial_scroll_minute(empty, true, new Date(at(14)), day)).toBe(750);
  });

  it("starts near the first event on another day", () => {
    const layout = layout_day([make_event("a", at(11), at(12))], day);

    expect(initial_scroll_minute(layout, false, new Date(at(8)), day)).toBe(
      630,
    );
  });

  it("falls back to the start of the working day", () => {
    expect(initial_scroll_minute(empty, false, new Date(at(8)), day)).toBe(480);
  });
});

describe("next_draft_start", () => {
  it("rounds up to the next half hour today", () => {
    expect(next_draft_start(new Date(at(10, 10)), day, true)).toBe(630);
    expect(next_draft_start(new Date(at(10, 30)), day, true)).toBe(660);
  });

  it("stays inside the day late at night", () => {
    expect(next_draft_start(new Date(at(23, 50)), day, true)).toBe(1410);
  });

  it("uses nine in the morning on another day", () => {
    expect(next_draft_start(new Date(at(23, 50)), day, false)).toBe(540);
  });
});
