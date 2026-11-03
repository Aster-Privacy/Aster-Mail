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

import { unfold } from "@/services/calendar/ics_file";
import {
  build_itip_cancel,
  build_itip_reply,
  build_itip_request,
  event_guests,
  is_event_organizer,
  is_itip_attachment,
  itip_mime_type,
  next_sequence,
  owns_event_for_edit,
  parse_itip_message,
} from "@/services/calendar/itip";

describe("owns_event_for_edit", () => {
  const guest = {
    email: "guest@example.com",
    display_name: null,
    response: "needs_action" as const,
    is_organizer: false,
  };
  const me = { ...guest, email: "me@example.com" };

  it("treats an event without organizer or guests as yours", () => {
    expect(
      owns_event_for_edit({ attendees: [], organizer_email: null }, "me@example.com"),
    ).toBe(true);
    expect(
      owns_event_for_edit({ attendees: [me], organizer_email: null }, "me@example.com"),
    ).toBe(true);
  });

  it("does not claim an imported event that lists other attendees", () => {
    expect(
      owns_event_for_edit(
        { attendees: [guest, me], organizer_email: null },
        "me@example.com",
      ),
    ).toBe(false);
  });

  it("follows the stored organizer when there is one", () => {
    expect(
      owns_event_for_edit(
        { attendees: [guest], organizer_email: "me@example.com" },
        "me@example.com",
      ),
    ).toBe(true);
    expect(
      owns_event_for_edit(
        { attendees: [me], organizer_email: "host@example.com" },
        "me@example.com",
      ),
    ).toBe(false);
  });
});

const STAMP = "2026-03-01T12:00:00.000Z";

const ORGANIZER = { email: "host@example.com", display_name: "Host" };

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Planning, part 1; final",
    description: "Bring notes",
    location: "Room 4",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [
      {
        email: "host@example.com",
        display_name: "Host",
        response: "accepted",
        is_organizer: true,
      },
      {
        email: "guest@example.com",
        display_name: "Guest One",
        response: "needs_action",
        is_organizer: false,
      },
      {
        email: "Other@Example.com",
        display_name: null,
        response: "tentative",
        is_organizer: false,
      },
    ],
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
    reminder_minutes: 10,
    uid: "abc-123@aster.calendar",
    sequence: 2,
    organizer_email: "host@example.com",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("build_itip_request", () => {
  it("emits METHOD:REQUEST with organizer, guests, sequence, and stamp", () => {
    const ics = build_itip_request(make_event(), {
      organizer: ORGANIZER,
      sequence: 3,
      generated_at: STAMP,
    });

    expect(ics).not.toBeNull();
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:abc-123@aster.calendar");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("DTSTAMP:20260301T120000Z");
    expect(ics).toContain("ORGANIZER;CN=Host:mailto:host@example.com");
    expect(unfold(ics ?? "")).toContain(
      "ATTENDEE;CN=Guest One;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:guest@example.com",
    );
    expect(ics).toContain(
      "ATTENDEE;PARTSTAT=TENTATIVE;RSVP=TRUE:mailto:Other@Example.com",
    );
    expect(ics).not.toContain("ATTENDEE;CN=Host");
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(ics).toContain("SUMMARY:Planning\\, part 1\\; final");
  });

  it("limits the attendee list to the given subset", () => {
    const event = make_event();
    const ics = build_itip_request(event, {
      organizer: ORGANIZER,
      sequence: 1,
      generated_at: STAMP,
      attendees: [event.attendees[2]],
    });

    expect(ics).toContain("mailto:Other@Example.com");
    expect(ics).not.toContain("mailto:guest@example.com");
  });

  it("writes RRULE with TZID for recurring events", () => {
    const ics = build_itip_request(
      make_event({
        recurrence: {
          frequency: "weekly",
          interval: 1,
          by_weekday: [3],
          count: null,
          until: null,
          time_zone: "Europe/Berlin",
        },
      }),
      { organizer: ORGANIZER, sequence: 0, generated_at: STAMP },
    );

    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20260304T100000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
    expect(ics).toContain("SEQUENCE:0");
  });

  it("writes RECURRENCE-ID for a detached occurrence", () => {
    const ics = build_itip_request(
      make_event({
        recurrence_id: "2026-03-11T09:00:00.000Z",
        starts_at: "2026-03-11T10:00:00.000Z",
        ends_at: "2026-03-11T10:30:00.000Z",
      }),
      { organizer: ORGANIZER, sequence: 1, generated_at: STAMP },
    );

    expect(ics).toContain("RECURRENCE-ID:20260311T090000Z");
    expect(ics).toContain("DTSTART:20260311T100000Z");
  });

  it("returns null when the event has no usable dates", () => {
    const ics = build_itip_request(
      make_event({ starts_at: "not a date", ends_at: "" }),
      { organizer: ORGANIZER, sequence: 1, generated_at: STAMP },
    );

    expect(ics).toBeNull();
  });
});

describe("build_itip_cancel", () => {
  it("emits METHOD:CANCEL with STATUS:CANCELLED", () => {
    const ics = build_itip_cancel(make_event(), {
      organizer: ORGANIZER,
      sequence: 4,
      generated_at: STAMP,
    });

    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:4");
    expect(ics).toContain("mailto:guest@example.com");
    expect(ics).not.toContain("RSVP=TRUE");
  });
});

describe("build_itip_reply", () => {
  it("emits METHOD:REPLY with only the replying attendee", () => {
    const ics = build_itip_reply(make_event(), {
      organizer: ORGANIZER,
      attendee: { email: "guest@example.com", display_name: "Guest One" },
      response: "accepted",
      sequence: 2,
      generated_at: STAMP,
    });

    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("ORGANIZER;CN=Host:mailto:host@example.com");
    expect(ics).toContain(
      "ATTENDEE;CN=Guest One;PARTSTAT=ACCEPTED:mailto:guest@example.com",
    );
    expect(ics).not.toContain("mailto:Other@Example.com");
    expect(ics).toContain("SEQUENCE:2");
  });
});

describe("parse_itip_message", () => {
  it("round-trips a REQUEST", () => {
    const ics = build_itip_request(make_event(), {
      organizer: ORGANIZER,
      sequence: 3,
      generated_at: STAMP,
    });
    const parsed = parse_itip_message(ics);

    expect(parsed).not.toBeNull();
    expect(parsed?.method).toBe("REQUEST");
    expect(parsed?.uid).toBe("abc-123@aster.calendar");
    expect(parsed?.sequence).toBe(3);
    expect(parsed?.recurrence_id).toBeNull();
    expect(parsed?.organizer).toEqual({
      email: "host@example.com",
      display_name: "Host",
      response: "accepted",
      is_organizer: true,
    });
    expect(parsed?.attendees.map((attendee) => attendee.email)).toEqual([
      "guest@example.com",
      "Other@Example.com",
    ]);
    expect(parsed?.attendees[1].response).toBe("tentative");
    expect(parsed?.event.title).toBe("Planning, part 1; final");
    expect(parsed?.event.location).toBe("Room 4");
    expect(parsed?.event.starts_at).toBe("2026-03-04T09:00:00.000Z");
    expect(parsed?.event.ends_at).toBe("2026-03-04T09:30:00.000Z");
  });

  it("round-trips a recurring REQUEST with TZID", () => {
    const ics = build_itip_request(
      make_event({
        recurrence: {
          frequency: "weekly",
          interval: 2,
          by_weekday: [3],
          count: 5,
          until: null,
          time_zone: "Europe/Berlin",
        },
      }),
      { organizer: ORGANIZER, sequence: 1, generated_at: STAMP },
    );
    const parsed = parse_itip_message(ics);

    expect(parsed?.event.starts_at).toBe("2026-03-04T09:00:00.000Z");
    expect(parsed?.event.recurrence?.frequency).toBe("weekly");
    expect(parsed?.event.recurrence?.interval).toBe(2);
    expect(parsed?.event.recurrence?.count).toBe(5);
    expect(parsed?.event.recurrence?.time_zone).toBe("Europe/Berlin");
  });

  it("round-trips an all-day REQUEST", () => {
    const ics = build_itip_request(
      make_event({
        is_all_day: true,
        starts_at: new Date(2026, 2, 4).toISOString(),
        ends_at: new Date(2026, 2, 4, 23, 59, 59, 999).toISOString(),
      }),
      { organizer: ORGANIZER, sequence: 0, generated_at: STAMP },
    );
    const parsed = parse_itip_message(ics);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260304");
    expect(parsed?.event.is_all_day).toBe(true);
  });

  it("round-trips a RECURRENCE-ID", () => {
    const ics = build_itip_request(
      make_event({
        recurrence_id: "2026-03-11T09:00:00.000Z",
        starts_at: "2026-03-11T10:00:00.000Z",
        ends_at: "2026-03-11T10:30:00.000Z",
      }),
      { organizer: ORGANIZER, sequence: 1, generated_at: STAMP },
    );
    const parsed = parse_itip_message(ics);

    expect(parsed?.recurrence_id).toBe("2026-03-11T09:00:00.000Z");
    expect(parsed?.event.starts_at).toBe("2026-03-11T10:00:00.000Z");
  });

  it("round-trips a CANCEL", () => {
    const ics = build_itip_cancel(make_event(), {
      organizer: ORGANIZER,
      sequence: 5,
      generated_at: STAMP,
    });
    const parsed = parse_itip_message(ics);

    expect(parsed?.method).toBe("CANCEL");
    expect(parsed?.sequence).toBe(5);
    expect(parsed?.event.status).toBe("cancelled");
  });

  it("round-trips a REPLY and keeps the partstat", () => {
    const ics = build_itip_reply(make_event(), {
      organizer: ORGANIZER,
      attendee: { email: "guest@example.com", display_name: "Guest One" },
      response: "declined",
      sequence: 2,
      generated_at: STAMP,
    });
    const parsed = parse_itip_message(ics);

    expect(parsed?.method).toBe("REPLY");
    expect(parsed?.attendees).toHaveLength(1);
    expect(parsed?.attendees[0].email).toBe("guest@example.com");
    expect(parsed?.attendees[0].response).toBe("declined");
    expect(parsed?.organizer?.email).toBe("host@example.com");
  });

  it("reads folded lines and lowercase method names", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "method:request",
      "BEGIN:VEVENT",
      "UID:folded@example.com",
      "SEQUENCE:7",
      "DTSTAMP:20260301T120000Z",
      "DTSTART:20260304T090000Z",
      "DTEND:20260304T100000Z",
      "SUMMARY:A rather long summary that keeps going past the seventy f",
      " our character limit",
      "ORGANIZER;CN=\"Folded, Host\":mailto:host@example.com",
      "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parse_itip_message(text);

    expect(parsed?.method).toBe("REQUEST");
    expect(parsed?.sequence).toBe(7);
    expect(parsed?.event.title).toBe(
      "A rather long summary that keeps going past the seventy four character limit",
    );
    expect(parsed?.organizer?.display_name).toBe("Folded, Host");
    expect(parsed?.attendees[0].email).toBe("me@example.com");
  });

  it("reads the organizer and sequence from the event it returns", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:broken@example.com",
      "SEQUENCE:99",
      "DTSTART:garbage",
      "ORGANIZER:mailto:attacker@example.com",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:real@example.com",
      "SEQUENCE:3",
      "DTSTART:20260304T090000Z",
      "DTEND:20260304T100000Z",
      "SUMMARY:Real",
      "ORGANIZER:mailto:host@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parse_itip_message(text);

    expect(parsed?.uid).toBe("real@example.com");
    expect(parsed?.sequence).toBe(3);
    expect(parsed?.organizer?.email).toBe("host@example.com");
  });

  it("keeps modified occurrences in the series instead of dropping them", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:series@example.com",
      "SEQUENCE:1",
      "DTSTART:20260304T090000Z",
      "DTEND:20260304T100000Z",
      "RRULE:FREQ=WEEKLY",
      "EXDATE:20260311T090000Z",
      "SUMMARY:Weekly",
      "ORGANIZER:mailto:host@example.com",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:series@example.com",
      "RECURRENCE-ID:20260318T090000Z",
      "SEQUENCE:1",
      "DTSTART:20260318T110000Z",
      "DTEND:20260318T120000Z",
      "SUMMARY:Weekly moved",
      "ORGANIZER:mailto:host@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parse_itip_message(text);

    expect(parsed?.recurrence_id).toBeNull();
    expect(parsed?.event.recurrence_exceptions).toEqual(["2026-03-11T09:00:00.000Z"]);
  });

  it("treats a missing SEQUENCE as 0", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:x@example.com",
      "DTSTART:20260304T090000Z",
      "DTEND:20260304T100000Z",
      "SUMMARY:No sequence",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parse_itip_message(text)?.sequence).toBe(0);
  });

  it("returns null for malformed or unsupported input", () => {
    expect(parse_itip_message("")).toBeNull();
    expect(parse_itip_message(undefined)).toBeNull();
    expect(parse_itip_message(42)).toBeNull();
    expect(parse_itip_message("not a calendar")).toBeNull();
    expect(
      parse_itip_message(
        "BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nDTSTART:20260304T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
      ),
    ).toBeNull();
    expect(
      parse_itip_message("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR"),
    ).toBeNull();
    expect(
      parse_itip_message(
        "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nDTSTART:garbage\r\nEND:VEVENT\r\nEND:VCALENDAR",
      ),
    ).toBeNull();
  });
});

describe("is_itip_attachment", () => {
  it("matches text/calendar parts and .ics file names", () => {
    expect(
      is_itip_attachment({
        filename: "invite.ics",
        content_type: "text/calendar; method=REQUEST",
      }),
    ).toBe(true);
    expect(
      is_itip_attachment({ filename: "Meeting.ICS", content_type: "application/octet-stream" }),
    ).toBe(true);
    expect(
      is_itip_attachment({ filename: "a.bin", content_type: "application/ics" }),
    ).toBe(true);
    expect(
      is_itip_attachment({ filename: "photo.png", content_type: "image/png" }),
    ).toBe(false);
    expect(is_itip_attachment({})).toBe(false);
  });

  it("builds the outgoing mime type with the method parameter", () => {
    expect(itip_mime_type("CANCEL")).toBe("text/calendar; method=CANCEL");
  });
});

describe("organizer helpers", () => {
  it("knows who the organizer is and who the guests are", () => {
    const event = make_event();

    expect(is_event_organizer(event, "HOST@example.com")).toBe(true);
    expect(is_event_organizer(event, "guest@example.com")).toBe(false);
    expect(is_event_organizer(event, "")).toBe(false);
    expect(event_guests(event, "host@example.com").map((a) => a.email)).toEqual(
      ["guest@example.com", "Other@Example.com"],
    );
  });

  it("does not treat the signed-in user as organizer when nothing is stored", () => {
    const event = make_event({
      organizer_email: null,
      attendees: [
        {
          email: "guest@example.com",
          display_name: null,
          response: "needs_action",
          is_organizer: false,
        },
      ],
    });

    expect(is_event_organizer(event, "me@example.com")).toBe(false);
    expect(event_guests(event, "me@example.com")).toHaveLength(1);
  });

  it("increments the sequence from zero for old blobs", () => {
    expect(next_sequence({ sequence: undefined })).toBe(1);
    expect(next_sequence({ sequence: 4 })).toBe(5);
  });
});
