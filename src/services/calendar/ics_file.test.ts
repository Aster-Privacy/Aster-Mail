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

import { describe, expect, it } from "vitest";

import {
  build_ics,
  parse_ics_events,
  unfold,
} from "@/services/calendar/ics_file";
import { occurrence_starts } from "@/services/calendar/recurrence";

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Standup",
    description: "",
    location: "",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
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
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    reminder_minutes: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

const STAMP = "2026-03-01T12:00:00.000Z";

describe("build_ics", () => {
  it("wraps events in a valid VCALENDAR envelope", () => {
    const ics = build_ics([make_event()], STAMP);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260304T090000Z");
    expect(ics).toContain("DTEND:20260304T093000Z");
    expect(ics).toContain("SUMMARY:Standup");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("writes all-day events as DATE values", () => {
    const ics = build_ics(
      [
        make_event({
          is_all_day: true,
          starts_at: new Date(2026, 2, 4).toISOString(),
          ends_at: new Date(2026, 2, 4, 23, 59, 59, 999).toISOString(),
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("DTSTART;VALUE=DATE:20260304");
    expect(ics).toContain("DTEND;VALUE=DATE:20260305");
  });

  it("escapes reserved characters in text fields", () => {
    const ics = build_ics(
      [make_event({ title: "Plan; budget, phase\nnotes" })],
      STAMP,
    );

    expect(ics).toContain("SUMMARY:Plan\\; budget\\, phase\\nnotes");
  });

  it("folds lines longer than 75 octets", () => {
    const ics = build_ics([make_event({ title: "x".repeat(200) })], STAMP);

    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it("emits attendees with their participation status", () => {
    const ics = build_ics(
      [
        make_event({
          attendees: [
            {
              email: "lead@example.com",
              display_name: "Lead",
              response: "accepted",
              is_organizer: true,
            },
            {
              email: "guest@example.com",
              display_name: null,
              response: "declined",
              is_organizer: false,
            },
          ],
        }),
      ],
      STAMP,
    );

    expect(ics).toContain(
      "ATTENDEE;CN=Lead;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:lead@example.com",
    );
    expect(ics).toContain("PARTSTAT=DECLINED:mailto:guest@example.com");
  });

  it("keeps line breaks in attendee fields from adding properties", () => {
    const ics = build_ics(
      [
        make_event({
          reminder_minutes: Number.NaN,
          attendees: [
            {
              email: "guest@example.com\r\nATTACH:https://evil.example/x",
              display_name: "Guest;ROLE=CHAIR",
              response: "bogus" as never,
              is_organizer: false,
            },
          ],
        }),
      ],
      STAMP,
    );

    expect(ics).not.toMatch(/\r\nATTACH/);
    expect(unfold(ics)).toContain(
      'ATTENDEE;CN="Guest;ROLE=CHAIR";PARTSTAT=NEEDS-ACTION:mailto:guest@example.comATTACH:',
    );
    expect(ics).toContain("TRIGGER:PT0S");
  });

  it("skips events with an unparseable date", () => {
    const ics = build_ics([make_event({ starts_at: "not-a-date" })], STAMP);

    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("build_ics reminders", () => {
  it("writes a display alarm for an event reminder", () => {
    const ics = build_ics([make_event({ reminder_minutes: 60 })], STAMP);

    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("END:VALARM");
  });

  it("writes day and minute triggers in their largest unit", () => {
    expect(build_ics([make_event({ reminder_minutes: 2880 })], STAMP)).toContain(
      "TRIGGER:-P2D",
    );
    expect(build_ics([make_event({ reminder_minutes: 45 })], STAMP)).toContain(
      "TRIGGER:-PT45M",
    );
    expect(build_ics([make_event({ reminder_minutes: 0 })], STAMP)).toContain(
      "TRIGGER:PT0S",
    );
  });

  it("omits the alarm when the event has no reminder", () => {
    expect(build_ics([make_event()], STAMP)).not.toContain("BEGIN:VALARM");
  });
});

describe("parse_ics_events", () => {
  it("skips events dated outside the supported years", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:old-1",
        "DTSTART:18000101T090000Z",
        "SUMMARY:Old",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:far-1",
        "DTSTART:99990101",
        "SUMMARY:Far",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(parsed).toHaveLength(0);
  });

  it("caps the length of an imported event at one year", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:span-1",
        "DTSTART:20260302T090000Z",
        "DTEND:21991231T000000Z",
        "SUMMARY:Forever",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:span-2",
        "DTSTART:20260302T090000Z",
        "DURATION:P9000000W",
        "SUMMARY:Long",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    const span = (index: number) =>
      new Date(parsed[index].ends_at).getTime() -
      new Date(parsed[index].starts_at).getTime();

    expect(span(0)).toBe(366 * 86_400_000);
    expect(span(1)).toBe(60 * 60 * 1000);
  });

  it("maps attendee status safely and ignores unknown values", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:partstat-1",
        "DTSTART:20260302T090000Z",
        "DTEND:20260302T100000Z",
        "SUMMARY:Review",
        "ATTENDEE;PARTSTAT=constructor:mailto:a@example.com",
        "ATTENDEE;PARTSTAT=__proto__:mailto:b@example.com",
        "ATTENDEE;PARTSTAT=accepted:mailto:c@example.com",
        "ATTENDEE;PARTSTAT=Declined:mailto:d@example.com",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(parsed[0].attendees.map((attendee) => attendee.response)).toEqual([
      "needs_action",
      "needs_action",
      "accepted",
      "declined",
    ]);
  });

  it("reads the alarm trigger without clobbering the event fields", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:alarm-1",
        "DTSTART:20260302T090000Z",
        "DTEND:20260302T100000Z",
        "SUMMARY:Standup",
        "DESCRIPTION:Real description",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:This is an event reminder",
        "TRIGGER:-PT30M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(parsed[0].description).toBe("Real description");
    expect(parsed[0].reminder_minutes).toBe(30);
  });

  it("ignores absolute and future alarm triggers", () => {
    const with_trigger = (trigger: string) =>
      parse_ics_events(
        [
          "BEGIN:VCALENDAR",
          "BEGIN:VEVENT",
          "UID:alarm-2",
          "DTSTART:20260302T090000Z",
          "SUMMARY:Standup",
          "BEGIN:VALARM",
          trigger,
          "END:VALARM",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      )[0];

    expect(
      with_trigger("TRIGGER;VALUE=DATE-TIME:20260302T083000Z").reminder_minutes,
    ).toBe(null);
    expect(with_trigger("TRIGGER:PT15M").reminder_minutes).toBe(null);
    expect(with_trigger("TRIGGER:-P1D").reminder_minutes).toBe(1440);
  });

  it("round-trips a reminder through export and import", () => {
    const parsed = parse_ics_events(
      build_ics([make_event({ reminder_minutes: 60 })], STAMP),
    );

    expect(parsed[0].reminder_minutes).toBe(60);
  });

  it("returns nothing for input without events", () => {
    expect(parse_ics_events("")).toEqual([]);
    expect(parse_ics_events("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
  });

  it("round-trips an exported event", () => {
    const original = make_event({
      title: "Design review; round 2",
      description: "Bring the deck",
      location: "Room 4",
      status: "tentative",
      attendees: [
        {
          email: "guest@example.com",
          display_name: "Guest",
          response: "tentative",
          is_organizer: false,
        },
      ],
    });

    const parsed = parse_ics_events(build_ics([original], STAMP));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe(original.title);
    expect(parsed[0].description).toBe(original.description);
    expect(parsed[0].location).toBe(original.location);
    expect(parsed[0].status).toBe("tentative");
    expect(parsed[0].starts_at).toBe(original.starts_at);
    expect(parsed[0].ends_at).toBe(original.ends_at);
    expect(parsed[0].attendees).toEqual([
      {
        email: "guest@example.com",
        display_name: "Guest",
        response: "tentative",
        is_organizer: false,
      },
    ]);
  });

  it("keeps escaped backslashes through export and import", () => {
    const original = make_event({
      title: "C:\\new\\Notes",
      description: "Line one\nPath C:\\n, done; ok",
    });

    const parsed = parse_ics_events(build_ics([original], STAMP));

    expect(parsed[0].title).toBe(original.title);
    expect(parsed[0].description).toBe(original.description);
  });

  it("parses several events from one file", () => {
    const parsed = parse_ics_events(
      build_ics(
        [
          make_event({ id: "a", title: "One" }),
          make_event({ id: "b", title: "Two" }),
          make_event({ id: "c", title: "Three" }),
        ],
        STAMP,
      ),
    );

    expect(parsed.map((event) => event.title)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("unfolds continuation lines", () => {
    const title = "y".repeat(180);
    const parsed = parse_ics_events(build_ics([make_event({ title })], STAMP));

    expect(parsed[0].title).toBe(title);
  });

  it("marks DATE-valued events as all day", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260304",
        "DTEND;VALUE=DATE:20260305",
        "SUMMARY:Holiday",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].is_all_day).toBe(true);
  });

  it("normalizes a single day all-day end to the inclusive last moment", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260304",
        "DTEND;VALUE=DATE:20260305",
        "SUMMARY:Holiday",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].ends_at).toBe(
      new Date(2026, 2, 4, 23, 59, 59, 999).toISOString(),
    );
  });

  it("normalizes a multi day all-day end to the inclusive last day", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260304",
        "DTEND;VALUE=DATE:20260307",
        "SUMMARY:Trip",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].ends_at).toBe(
      new Date(2026, 2, 6, 23, 59, 59, 999).toISOString(),
    );
  });

  it("normalizes an all-day event with no DTEND to the end of its start day", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260304",
        "SUMMARY:Single",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].ends_at).toBe(
      new Date(2026, 2, 4, 23, 59, 59, 999).toISOString(),
    );
  });

  it("round trips an inclusive all-day end as an exclusive DATE", () => {
    const original = make_event({
      is_all_day: true,
      starts_at: new Date(2026, 2, 4).toISOString(),
      ends_at: new Date(2026, 2, 6, 23, 59, 59, 999).toISOString(),
    });

    const ics = build_ics([original], STAMP);

    expect(ics).toContain("DTEND;VALUE=DATE:20260307");

    const parsed = parse_ics_events(ics);

    expect(parsed[0].ends_at).toBe(original.ends_at);
  });

  it("falls back to a one hour duration when DTEND is missing", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:Open ended",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].starts_at).toBe("2026-03-04T09:00:00.000Z");
    expect(parsed[0].ends_at).toBe("2026-03-04T10:00:00.000Z");
  });

  it("repairs an end that is not after the start", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "DTEND:20260304T080000Z",
        "SUMMARY:Backwards",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(
      new Date(parsed[0].ends_at).getTime() >
        new Date(parsed[0].starts_at).getTime(),
    ).toBe(true);
  });

  it("drops events without a usable start", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "SUMMARY:No start",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:garbage",
        "SUMMARY:Bad start",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed).toEqual([]);
  });

  it("keeps the organizer and dedupes repeated addresses", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:Sync",
        "ORGANIZER;CN=Lead:mailto:lead@example.com",
        "ATTENDEE;PARTSTAT=ACCEPTED:mailto:lead@example.com",
        "ATTENDEE;PARTSTAT=DECLINED:mailto:guest@example.com",
        "ATTENDEE:notanaddress",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].attendees).toEqual([
      {
        email: "lead@example.com",
        display_name: "Lead",
        response: "needs_action",
        is_organizer: true,
      },
      {
        email: "guest@example.com",
        display_name: null,
        response: "declined",
        is_organizer: false,
      },
    ]);
  });

  it("defaults an unknown status to confirmed", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:Odd",
        "STATUS:SOMETHING",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].status).toBe("confirmed");
  });
});

describe("recurrence in ics", () => {
  it("emits an rrule and exdate for a recurring master", () => {
    const ics = build_ics(
      [
        make_event({
          recurrence: {
            frequency: "weekly",
            interval: 1,
            by_weekday: [3],
            count: null,
            until: null,
          },
          recurrence_exceptions: ["2026-03-11T09:00:00.000Z"],
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE");
    expect(ics).toContain("EXDATE:20260311T090000Z");
  });

  it("emits one vevent per master when occurrences are expanded", () => {
    const ics = build_ics(
      [
        make_event({
          id: "evt-1::2026-03-04T09:00:00.000Z",
          recurrence_master_id: "evt-1",
          occurrence_start: "2026-03-04T09:00:00.000Z",
          recurrence: {
            frequency: "daily",
            interval: 1,
            by_weekday: [],
            count: null,
            until: null,
          },
        }),
        make_event({
          id: "evt-1::2026-03-05T09:00:00.000Z",
          starts_at: "2026-03-05T09:00:00.000Z",
          ends_at: "2026-03-05T09:30:00.000Z",
          recurrence_master_id: "evt-1",
          occurrence_start: "2026-03-05T09:00:00.000Z",
          recurrence: {
            frequency: "daily",
            interval: 1,
            by_weekday: [],
            count: null,
            until: null,
          },
        }),
      ],
      STAMP,
    );

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:evt-1@aster.calendar");
  });

  it("keeps an imported uid on export and falls back when it is unsafe", () => {
    const kept = build_ics([make_event({ uid: "abc-123@example.com" })], STAMP);
    const colon = build_ics([make_event({ uid: "urn:uuid:abc-123" })], STAMP);
    const unsafe = build_ics([make_event({ uid: "bad;uid" })], STAMP);

    expect(kept).toContain("UID:abc-123@example.com");
    expect(colon).toContain("UID:urn:uuid:abc-123");
    expect(unsafe).toContain("UID:evt-1@aster.calendar");
  });

  it("round trips a rule and its exceptions through the parser", () => {
    const original = make_event({
      recurrence: {
        frequency: "monthly",
        interval: 2,
        by_weekday: [],
        count: 6,
        until: null,
      },
      recurrence_exceptions: ["2026-05-04T09:00:00.000Z"],
    });

    const parsed = parse_ics_events(build_ics([original], STAMP));

    expect(parsed[0].recurrence).toEqual(original.recurrence);
    expect(parsed[0].recurrence_exceptions).toEqual(
      original.recurrence_exceptions,
    );
  });

  it("leaves recurrence empty for a plain event", () => {
    const parsed = parse_ics_events(build_ics([make_event()], STAMP));

    expect(parsed[0].recurrence).toBeNull();
    expect(parsed[0].recurrence_exceptions).toEqual([]);
  });

  it("round trips an all day recurrence and its exception", () => {
    const original = make_event({
      is_all_day: true,
      starts_at: new Date(2026, 2, 2).toISOString(),
      ends_at: new Date(2026, 2, 3).toISOString(),
      recurrence: {
        frequency: "daily",
        interval: 1,
        by_weekday: [],
        count: null,
        until: null,
      },
      recurrence_exceptions: [new Date(2026, 2, 4).toISOString()],
    });

    const ics = build_ics([original], STAMP);
    const parsed = parse_ics_events(ics);

    expect(ics).toContain("EXDATE;VALUE=DATE:20260304");
    expect(parsed[0].is_all_day).toBe(true);
    expect(parsed[0].recurrence_exceptions).toEqual([
      new Date(2026, 2, 4).toISOString(),
    ]);
  });
});

describe("timezone handling in ics", () => {
  it("converts a fixed-offset TZID datetime to utc", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=Etc/GMT+5:20260715T090000",
        "DTEND;TZID=Etc/GMT+5:20260715T100000",
        "SUMMARY:Zoned",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].starts_at).toBe("2026-07-15T14:00:00.000Z");
    expect(parsed[0].ends_at).toBe("2026-07-15T15:00:00.000Z");
  });

  it("resolves a dst-aware iana zone at the event instant", () => {
    const summer = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=America/New_York:20260715T090000",
        "SUMMARY:Summer",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const winter = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=America/New_York:20260115T090000",
        "SUMMARY:Winter",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(summer[0].starts_at).toBe("2026-07-15T13:00:00.000Z");
    expect(winter[0].starts_at).toBe("2026-01-15T14:00:00.000Z");
  });

  it("falls back to floating local time for an unknown zone", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=Not/AZone:20260715T090000",
        "SUMMARY:Floating",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].starts_at).toBe(
      new Date(2026, 6, 15, 9, 0, 0).toISOString(),
    );
    expect(parsed[0].dropped_time_zones).toEqual(["Not/AZone"]);
  });

  it("maps a windows zone name to its iana zone", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=Pacific Standard Time:20260715T090000",
        "DTEND;TZID=\"W. Europe Standard Time\":20260715T200000",
        "RRULE:FREQ=WEEKLY",
        "SUMMARY:Windows",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].starts_at).toBe("2026-07-15T16:00:00.000Z");
    expect(parsed[0].ends_at).toBe("2026-07-15T18:00:00.000Z");
    expect(parsed[0].recurrence?.time_zone).toBe("America/Los_Angeles");
    expect(parsed[0].dropped_time_zones).toBeUndefined();
  });

  it("does not report a zone on an all-day or utc value", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=Not/AZone:20260715",
        "DTEND;TZID=Not/AZone:20260716T000000Z",
        "SUMMARY:Day",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].dropped_time_zones).toBeUndefined();
  });
});

describe("bare date starts in ics", () => {
  it("treats an 8-digit dtstart without a value type as all day", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304",
        "DTEND:20260305",
        "SUMMARY:Holiday",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].is_all_day).toBe(true);
    expect(parsed[0].starts_at).toBe(new Date(2026, 2, 4).toISOString());
  });
});

describe("availability, visibility and conferencing in ics", () => {
  it("marks busy events opaque and omits class by default", () => {
    const ics = build_ics([make_event()], STAMP);

    expect(ics).toContain("TRANSP:OPAQUE");
    expect(ics).not.toContain("CLASS:");
    expect(ics).not.toContain("URL:");
  });

  it("emits transparent, class and url for a customised event", () => {
    const ics = build_ics(
      [
        make_event({
          availability: "free",
          visibility: "private",
          conference_url: "https://meet.example.org/abc-def",
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("CLASS:PRIVATE");
    expect(ics).toContain("URL:https://meet.example.org/abc-def");
  });

  it("round trips the new fields through the parser", () => {
    const parsed = parse_ics_events(
      build_ics(
        [
          make_event({
            availability: "free",
            visibility: "public",
            conference_url: "https://meet.example.org/abc-def",
          }),
        ],
        STAMP,
      ),
    );

    expect(parsed[0].availability).toBe("free");
    expect(parsed[0].visibility).toBe("public");
    expect(parsed[0].conference_url).toBe("https://meet.example.org/abc-def");
  });

  it("rejects a non http conference url on import", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:evt-9@aster.calendar",
        "DTSTART:20260304T090000Z",
        "DTEND:20260304T093000Z",
        "SUMMARY:Standup",
        "URL:javascript:alert(1)",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );

    expect(parsed[0].conference_url).toBe("");
  });

  it("treats confidential as private and unknown class as default", () => {
    const build = (value: string) =>
      parse_ics_events(
        [
          "BEGIN:VCALENDAR",
          "BEGIN:VEVENT",
          "UID:evt-9@aster.calendar",
          "DTSTART:20260304T090000Z",
          "DTEND:20260304T093000Z",
          "SUMMARY:Standup",
          `CLASS:${value}`,
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      )[0].visibility;

    expect(build("CONFIDENTIAL")).toBe("private");
    expect(build("SOMETHING")).toBe("default");
  });
});

describe("uid de-duplication on import", () => {
  const file = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:abc-1",
    "DTSTART:20260304T090000Z",
    "DTEND:20260304T093000Z",
    "SUMMARY:One",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:abc-2",
    "DTSTART:20260305T090000Z",
    "SUMMARY:Two",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("keeps the first vevent for a repeated uid", () => {
    const parsed = parse_ics_events(`${file}\r\n${file}`);

    expect(parsed.map((event) => event.title)).toEqual(["One", "Two"]);
    expect(parsed.map((event) => event.uid)).toEqual(["abc-1", "abc-2"]);
  });

  it("keeps every vevent that has no uid", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:A",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:A",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].uid).toBeNull();
    expect(parsed[0].recurrence_id).toBeNull();
  });

  it("round trips the exported uid", () => {
    const parsed = parse_ics_events(build_ics([make_event({ id: "evt-9" })], STAMP));

    expect(parsed[0].uid).toBe("evt-9@aster.calendar");
  });
});

describe("recurrence-id overrides on import", () => {
  const master = [
    "BEGIN:VEVENT",
    "UID:series-1",
    "DTSTART:20260304T090000Z",
    "DTEND:20260304T093000Z",
    "RRULE:FREQ=WEEKLY;BYDAY=WE",
    "SUMMARY:Weekly",
    "END:VEVENT",
  ];
  const override = [
    "BEGIN:VEVENT",
    "UID:series-1",
    "RECURRENCE-ID:20260311T090000Z",
    "DTSTART:20260311T140000Z",
    "DTEND:20260311T143000Z",
    "SUMMARY:Weekly (moved)",
    "END:VEVENT",
  ];

  it("turns an override into an exception plus a detached occurrence", () => {
    const parsed = parse_ics_events([...master, ...override].join("\r\n"));

    expect(parsed).toHaveLength(2);

    const [series, detached] = parsed;

    expect(series.recurrence?.frequency).toBe("weekly");
    expect(series.recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
    expect(series.recurrence_id).toBeNull();
    expect(detached.uid).toBe("series-1");
    expect(detached.recurrence_id).toBe("2026-03-11T09:00:00.000Z");
    expect(detached.starts_at).toBe("2026-03-11T14:00:00.000Z");
    expect(detached.recurrence).toBeNull();
    expect(detached.title).toBe("Weekly (moved)");
  });

  it("links an override that appears before its master", () => {
    const parsed = parse_ics_events([...override, ...master].join("\r\n"));

    expect(parsed.map((event) => event.title)).toEqual([
      "Weekly",
      "Weekly (moved)",
    ]);
    expect(parsed[0].recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
  });

  it("drops a repeated override for the same occurrence", () => {
    const parsed = parse_ics_events(
      [...master, ...override, ...override].join("\r\n"),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
  });

  it("keeps an override whose master is missing as a detached event", () => {
    const parsed = parse_ics_events(override.join("\r\n"));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].recurrence_id).toBe("2026-03-11T09:00:00.000Z");
    expect(parsed[0].uid).toBe("series-1");
  });

  it("does not repeat an exception the master already lists", () => {
    const parsed = parse_ics_events(
      [
        ...master.slice(0, -1),
        "EXDATE:20260311T090000Z",
        "END:VEVENT",
        ...override,
      ].join("\r\n"),
    );

    expect(parsed[0].recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
  });

  it("resolves a zoned recurrence-id and a date valued one", () => {
    const zoned = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "UID:z-1",
        "RECURRENCE-ID;TZID=America/New_York:20260311T090000",
        "DTSTART;TZID=America/New_York:20260311T100000",
        "SUMMARY:Zoned",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const dated = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "UID:d-1",
        "RECURRENCE-ID;VALUE=DATE:20260311",
        "DTSTART;VALUE=DATE:20260312",
        "SUMMARY:Dated",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(zoned[0].recurrence_id).toBe("2026-03-11T13:00:00.000Z");
    expect(dated[0].recurrence_id).toBe(new Date(2026, 2, 11).toISOString());
  });
});

describe("recurrence-id overrides on export", () => {
  it("writes a detached occurrence with its master uid and recurrence-id", () => {
    const ics = build_ics(
      [
        make_event({
          id: "evt-1",
          recurrence: {
            frequency: "weekly",
            interval: 1,
            by_weekday: [3],
            count: null,
            until: null,
          },
          recurrence_exceptions: ["2026-03-11T09:00:00.000Z"],
        }),
        make_event({
          id: "evt-2",
          starts_at: "2026-03-11T14:00:00.000Z",
          ends_at: "2026-03-11T14:30:00.000Z",
          recurrence_master_id: "evt-1",
          recurrence_id: "2026-03-11T09:00:00.000Z",
          title: "Standup (moved)",
        }),
      ],
      STAMP,
    );

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/UID:evt-1@aster.calendar/g)).toHaveLength(2);
    expect(ics).toContain("RECURRENCE-ID:20260311T090000Z");
    expect(ics).toContain("EXDATE:20260311T090000Z");
    expect(ics).toContain("SUMMARY:Standup (moved)");
  });

  it("writes an all-day detached occurrence with a date recurrence-id", () => {
    const ics = build_ics(
      [
        make_event({
          id: "evt-2",
          is_all_day: true,
          starts_at: new Date(2026, 2, 12).toISOString(),
          ends_at: new Date(2026, 2, 12, 23, 59, 59, 999).toISOString(),
          recurrence_master_id: "evt-1",
          recurrence_id: new Date(2026, 2, 11).toISOString(),
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("RECURRENCE-ID;VALUE=DATE:20260311");
    expect(ics).not.toContain("RRULE");
  });

  it("round trips a master and its detached occurrence", () => {
    const ics = build_ics(
      [
        make_event({
          id: "evt-1",
          recurrence: {
            frequency: "daily",
            interval: 1,
            by_weekday: [],
            count: 5,
            until: null,
          },
        }),
        make_event({
          id: "evt-2",
          starts_at: "2026-03-06T11:00:00.000Z",
          ends_at: "2026-03-06T11:30:00.000Z",
          recurrence_master_id: "evt-1",
          recurrence_id: "2026-03-06T09:00:00.000Z",
        }),
      ],
      STAMP,
    );
    const parsed = parse_ics_events(ics);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].recurrence_exceptions).toEqual(["2026-03-06T09:00:00.000Z"]);
    expect(parsed[1].uid).toBe("evt-1@aster.calendar");
    expect(parsed[1].recurrence_id).toBe("2026-03-06T09:00:00.000Z");
    expect(parsed[1].starts_at).toBe("2026-03-06T11:00:00.000Z");
  });

  it("does not dedupe a detached occurrence against expanded occurrences", () => {
    const series_rule = {
      frequency: "daily" as const,
      interval: 1,
      by_weekday: [],
      count: null,
      until: null,
    };
    const ics = build_ics(
      [
        make_event({
          id: "evt-1::2026-03-04T09:00:00.000Z",
          recurrence_master_id: "evt-1",
          occurrence_start: "2026-03-04T09:00:00.000Z",
          recurrence: series_rule,
        }),
        make_event({
          id: "evt-7",
          recurrence_master_id: "evt-1",
          recurrence_id: "2026-03-05T09:00:00.000Z",
          starts_at: "2026-03-05T12:00:00.000Z",
          ends_at: "2026-03-05T12:30:00.000Z",
        }),
      ],
      STAMP,
    );

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("rdate in ics", () => {
  it("imports rdate values as extra dates on the rule", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "UID:r-1",
        "DTSTART:20260304T090000Z",
        "RRULE:FREQ=WEEKLY",
        "RDATE:20260320T090000Z,20260321T090000Z",
        "RDATE;TZID=Europe/Berlin:20260322T100000",
        "RDATE;VALUE=PERIOD:20260323T090000Z/PT1H",
        "SUMMARY:With extras",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].recurrence?.extra_dates).toEqual([
      "2026-03-20T09:00:00.000Z",
      "2026-03-21T09:00:00.000Z",
      "2026-03-22T09:00:00.000Z",
      "2026-03-23T09:00:00.000Z",
    ]);
  });

  it("ignores rdate on an event without an rrule", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "UID:r-2",
        "DTSTART:20260304T090000Z",
        "RDATE:20260320T090000Z",
        "SUMMARY:No rule",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].recurrence).toBeNull();
  });

  it("exports and round trips extra dates", () => {
    const original = make_event({
      recurrence: {
        frequency: "weekly",
        interval: 1,
        by_weekday: [3],
        count: null,
        until: null,
        extra_dates: ["2026-03-20T09:00:00.000Z"],
      },
    });
    const ics = build_ics([original], STAMP);

    expect(ics).toContain("RDATE:20260320T090000Z");
    expect(parse_ics_events(ics)[0].recurrence).toEqual(original.recurrence);
  });

  it("exports all-day extra dates as dates", () => {
    const ics = build_ics(
      [
        make_event({
          is_all_day: true,
          starts_at: new Date(2026, 2, 2).toISOString(),
          ends_at: new Date(2026, 2, 2, 23, 59, 59, 999).toISOString(),
          recurrence: {
            frequency: "weekly",
            interval: 1,
            by_weekday: [1],
            count: null,
            until: null,
            extra_dates: [new Date(2026, 2, 20).toISOString()],
          },
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("RDATE;VALUE=DATE:20260320");
  });
});

describe("tzid on recurring events", () => {
  it("records the dtstart zone on the imported rule", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "UID:tz-1",
        "DTSTART;TZID=Europe/Berlin:20260304T100000",
        "DTEND;TZID=Europe/Berlin:20260304T103000",
        "RRULE:FREQ=WEEKLY;BYDAY=WE",
        "EXDATE;TZID=Europe/Berlin:20260311T100000",
        "SUMMARY:Zoned weekly",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].starts_at).toBe("2026-03-04T09:00:00.000Z");
    expect(parsed[0].recurrence?.time_zone).toBe("Europe/Berlin");
    expect(parsed[0].recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
  });

  it("does not record a zone for utc, unknown zone, or all-day starts", () => {
    const utc = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const unknown = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;TZID=Not/AZone:20260304T090000",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const all_day = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE;TZID=Europe/Berlin:20260304",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(utc[0].recurrence).not.toHaveProperty("time_zone");
    expect(unknown[0].recurrence).not.toHaveProperty("time_zone");
    expect(all_day[0].recurrence).not.toHaveProperty("time_zone");
  });

  it("writes zoned wall clock stamps for a rule with a time zone", () => {
    const ics = build_ics(
      [
        make_event({
          recurrence: {
            frequency: "weekly",
            interval: 1,
            by_weekday: [3],
            count: null,
            until: "2026-06-30T08:00:00.000Z",
            time_zone: "Europe/Berlin",
          },
          recurrence_exceptions: ["2026-03-11T09:00:00.000Z"],
        }),
      ],
      STAMP,
    );

    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20260304T100000");
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20260304T103000");
    expect(ics).toContain("EXDATE;TZID=Europe/Berlin:20260311T100000");
    expect(ics).toContain("UNTIL=20260630T080000Z");
  });

  it("round trips a zoned recurring event across the spring forward", () => {
    const original = make_event({
      recurrence: {
        frequency: "weekly",
        interval: 1,
        by_weekday: [3],
        count: null,
        until: null,
        time_zone: "Europe/Berlin",
      },
    });
    const parsed = parse_ics_events(build_ics([original], STAMP));

    expect(parsed[0].starts_at).toBe(original.starts_at);
    expect(parsed[0].ends_at).toBe(original.ends_at);
    expect(parsed[0].recurrence).toEqual(original.recurrence);

    const occurrences = occurrence_starts(
      { ...original, ...parsed[0] },
      new Date("2026-03-25T00:00:00Z"),
      new Date("2026-04-01T23:59:59Z"),
    );

    expect(occurrences.map((date) => date.toISOString())).toEqual([
      "2026-03-25T09:00:00.000Z",
      "2026-04-01T08:00:00.000Z",
    ]);
  });
});

describe("extended rrule fields in ics", () => {
  it("round trips by_month_day, by_set_pos and wkst", () => {
    const original = make_event({
      starts_at: "2026-01-30T09:00:00.000Z",
      ends_at: "2026-01-30T09:30:00.000Z",
      recurrence: {
        frequency: "monthly",
        interval: 1,
        by_weekday: [5],
        count: 6,
        until: null,
        by_set_pos: [-1],
      },
    });
    const ics = build_ics([original], STAMP);

    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;COUNT=6");
    expect(parse_ics_events(ics)[0].recurrence).toEqual(original.recurrence);

    const month_day = make_event({
      recurrence: {
        frequency: "monthly",
        interval: 2,
        by_weekday: [],
        count: null,
        until: null,
        by_month_day: [-1],
      },
    });
    const weekly = make_event({
      recurrence: {
        frequency: "weekly",
        interval: 2,
        by_weekday: [0, 3],
        count: null,
        until: null,
        week_start: 0,
      },
    });

    expect(parse_ics_events(build_ics([month_day], STAMP))[0].recurrence).toEqual(
      month_day.recurrence,
    );
    expect(parse_ics_events(build_ics([weekly], STAMP))[0].recurrence).toEqual(
      weekly.recurrence,
    );
  });

  it("writes an all-day until as a date and reads it back", () => {
    const until = new Date(2026, 2, 31, 23, 59, 59, 999).toISOString();
    const original = make_event({
      is_all_day: true,
      starts_at: new Date(2026, 2, 2).toISOString(),
      ends_at: new Date(2026, 2, 2, 23, 59, 59, 999).toISOString(),
      recurrence: {
        frequency: "daily",
        interval: 1,
        by_weekday: [],
        count: null,
        until,
      },
    });
    const ics = build_ics([original], STAMP);

    expect(ics).toContain("UNTIL=20260331");
    expect(ics).not.toContain("UNTIL=20260331T");
    expect(parse_ics_events(ics)[0].recurrence?.until).toBe(until);
  });
});


describe("zoned round trips", () => {
  const zoned_rule = (time_zone: string) => ({
    by_weekday: [],
    count: 3,
    frequency: "weekly" as const,
    interval: 1,
    time_zone,
    until: null,
  });

  it("keeps a Sydney weekly series on its wall clock through the April fall back", () => {
    const original = make_event({
      starts_at: "2026-03-29T22:00:00.000Z",
      ends_at: "2026-03-29T22:30:00.000Z",
      recurrence: zoned_rule("Australia/Sydney"),
    });
    const ics = build_ics([original], STAMP);

    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260330T090000");

    const parsed = parse_ics_events(ics);

    expect(parsed[0].starts_at).toBe(original.starts_at);
    expect(parsed[0].recurrence?.time_zone).toBe("Australia/Sydney");

    const starts = occurrence_starts(
      make_event({
        starts_at: parsed[0].starts_at,
        ends_at: parsed[0].ends_at,
        recurrence: parsed[0].recurrence,
      }),
      new Date("2026-03-29T00:00:00Z"),
      new Date("2026-04-20T00:00:00Z"),
    ).map((date) => date.toISOString());

    expect(starts).toEqual([
      "2026-03-29T22:00:00.000Z",
      "2026-04-05T23:00:00.000Z",
      "2026-04-12T23:00:00.000Z",
    ]);
  });

  it("keeps a Kolkata series at a fixed offset while the viewer changes DST", () => {
    const original = make_event({
      starts_at: "2026-03-23T04:30:00.000Z",
      ends_at: "2026-03-23T05:00:00.000Z",
      recurrence: zoned_rule("Asia/Kolkata"),
    });
    const ics = build_ics([original], STAMP);

    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20260323T100000");

    const parsed = parse_ics_events(ics);

    expect(parsed[0].starts_at).toBe(original.starts_at);

    const starts = occurrence_starts(
      make_event({
        starts_at: parsed[0].starts_at,
        ends_at: parsed[0].ends_at,
        recurrence: parsed[0].recurrence,
      }),
      new Date("2026-03-23T00:00:00Z"),
      new Date("2026-04-10T00:00:00Z"),
    ).map((date) => date.toISOString());

    expect(starts).toEqual([
      "2026-03-23T04:30:00.000Z",
      "2026-03-30T04:30:00.000Z",
      "2026-04-06T04:30:00.000Z",
    ]);
  });

  it("round trips a New York series across the November fall back", () => {
    const original = make_event({
      starts_at: "2026-10-26T13:00:00.000Z",
      ends_at: "2026-10-26T13:30:00.000Z",
      recurrence: zoned_rule("America/New_York"),
    });
    const parsed = parse_ics_events(build_ics([original], STAMP));
    const starts = occurrence_starts(
      make_event({
        starts_at: parsed[0].starts_at,
        ends_at: parsed[0].ends_at,
        recurrence: parsed[0].recurrence,
      }),
      new Date("2026-10-26T00:00:00Z"),
      new Date("2026-11-12T00:00:00Z"),
    ).map((date) => date.toISOString());

    expect(starts).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
    ]);
  });
});

describe("rfc 5545 line handling", () => {
  it("keeps a colon inside a quoted parameter value", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "SUMMARY:Sync",
        'ATTENDEE;CN="Doe: Jane; Dr, PhD";PARTSTAT=ACCEPTED:mailto:jane@example.com',
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].attendees).toEqual([
      {
        email: "jane@example.com",
        display_name: "Doe: Jane; Dr, PhD",
        response: "accepted",
        is_organizer: false,
      },
    ]);
  });

  it("quotes a CN that contains reserved characters and round trips it", () => {
    const ics = build_ics(
      [
        make_event({
          attendees: [
            {
              email: "jane@example.com",
              display_name: "Doe: Jane, PhD",
              response: "accepted",
              is_organizer: false,
            },
          ],
        }),
      ],
      STAMP,
    );

    expect(ics).toContain('ATTENDEE;CN="Doe: Jane, PhD";PARTSTAT=ACCEPTED:mailto:');
    expect(parse_ics_events(ics)[0].attendees[0].display_name).toBe(
      "Doe: Jane, PhD",
    );
  });

  it("uses DURATION when DTEND is missing", () => {
    const parsed = parse_ics_events(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "DURATION:P1DT2H30M",
        "SUMMARY:Long",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:20260304T090000Z",
        "DURATION:P2W",
        "SUMMARY:Weeks",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parsed[0].ends_at).toBe("2026-03-05T11:30:00.000Z");
    expect(parsed[1].ends_at).toBe("2026-03-18T09:00:00.000Z");
  });

  it("folds by utf-8 octets without splitting a surrogate pair", () => {
    const encoder = new TextEncoder();
    const ics = build_ics(
      [make_event({ title: "\u{1F600}".repeat(60) })],
      STAMP,
    );

    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toMatch(/[\uD800-\uDBFF]$/);
    }

    expect(parse_ics_events(ics)[0].title).toBe("\u{1F600}".repeat(60));
  });
});
