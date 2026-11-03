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

import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueuedEmail {
  to: string[];
  subject: string;
  body: string;
  is_plain_text: boolean;
  attachments: Array<{ name: string; mime_type: string; data: ArrayBuffer }>;
  sender_display_name?: string;
  on_complete: () => void;
  on_cancel: () => void;
  on_error: (error: string) => void;
}

const queue_email = vi.fn();

vi.mock("@/services/send_queue", () => ({
  queue_email: (...args: unknown[]) => queue_email(...args),
}));

const {
  format_invite_range,
  party_label,
  response_label,
  send_invitations,
  send_reply,
} = await import("@/services/calendar/invite_mail");

const HOST = { email: "host@example.com", display_name: "Host" };
const GUEST = {
  email: "guest@example.com",
  display_name: null,
  response: "needs_action" as const,
  is_organizer: false,
};

const t = (key: string, params: Record<string, string | number> = {}) =>
  `${key}${Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : ""}`;

function local_day(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Planning",
    description: "Bring notes",
    location: "Room 4",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [{ ...HOST, response: "accepted", is_organizer: true }, GUEST],
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
    guests_can_invite: true,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    uid: "uid-1",
    sequence: 2,
    organizer_email: HOST.email,
    ...overrides,
  };
}

function decode(attachment: { data: ArrayBuffer }): string {
  return new TextDecoder().decode(attachment.data);
}

beforeEach(() => {
  queue_email.mockReset();
  queue_email.mockImplementation((email: QueuedEmail) => {
    queueMicrotask(() => email.on_complete());

    return "queued-1";
  });
});

describe("labels", () => {
  it("formats a party with or without a display name", () => {
    expect(party_label(HOST)).toBe("Host <host@example.com>");
    expect(party_label({ email: "a@b.c", display_name: "  " })).toBe("a@b.c");
    expect(party_label({ email: "a@b.c" })).toBe("a@b.c");
  });

  it("maps responses to translation keys", () => {
    expect(response_label("accepted", t)).toBe("calendar.attendee_accepted");
    expect(response_label("declined", t)).toBe("calendar.attendee_declined");
    expect(response_label("tentative", t)).toBe("calendar.attendee_tentative");
    expect(response_label("needs_action", t)).toBe("calendar.attendee_pending");
  });
});

describe("format_invite_range", () => {
  it("renders a timed range with the year", () => {
    const text = format_invite_range(make_event(), "en-US");

    expect(text).toContain("2026");
    expect(text).toMatch(/Mar/);
  });

  it("renders a single all-day date once and a multi-day span as a range", () => {
    const single = format_invite_range(
      {
        starts_at: local_day(2026, 2, 4).toISOString(),
        ends_at: local_day(2026, 2, 5).toISOString(),
        is_all_day: true,
      },
      "en-US",
    );
    const multi = format_invite_range(
      {
        starts_at: local_day(2026, 2, 4).toISOString(),
        ends_at: local_day(2026, 2, 7).toISOString(),
        is_all_day: true,
      },
      "en-US",
    );

    expect(single).toContain("2026");
    expect(multi.length).toBeGreaterThan(single.length);
  });

  it("falls back to the default locale for an invalid language tag", () => {
    expect(() => format_invite_range(make_event(), "not a locale !!")).not.toThrow();
  });
});

describe("send_invitations", () => {
  it("queues one request per guest with the ics attached", async () => {
    const result = await send_invitations({
      event: make_event(),
      guests: [GUEST, { ...GUEST, email: "second@example.com" }],
      method: "REQUEST",
      organizer: HOST,
      sequence: 3,
      t,
      language: "en-US",
    });

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(queue_email).toHaveBeenCalledTimes(2);

    const [email, delay] = queue_email.mock.calls[0] as [QueuedEmail, number];

    expect(delay).toBe(0);
    expect(email.to).toEqual(["guest@example.com"]);
    expect(email.is_plain_text).toBe(true);
    expect(email.sender_display_name).toBe("Host");
    expect(email.subject).toContain("calendar.invite_subject");
    expect(email.body).toContain("calendar.invite_body_intro");
    expect(email.body).toContain("calendar.invite_body_where");
    expect(email.body).toContain("Bring notes");
    expect(email.body).toContain("calendar.invite_body_footer");
    expect(email.attachments[0].name).toBe("invite.ics");
    expect(email.attachments[0].mime_type).toContain("method=REQUEST");

    const ics = decode(email.attachments[0]);

    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("UID:uid-1");
  });

  it("uses the update wording and the cancel method", async () => {
    await send_invitations({
      event: make_event({ location: "", description: "" }),
      guests: [GUEST],
      method: "REQUEST",
      organizer: HOST,
      sequence: 1,
      is_update: true,
      t,
      language: "en-US",
    });

    let email = queue_email.mock.calls[0][0] as QueuedEmail;

    expect(email.subject).toContain("calendar.invite_updated_subject");
    expect(email.body).toContain("calendar.invite_body_updated");
    expect(email.body).not.toContain("calendar.invite_body_where");

    await send_invitations({
      event: make_event({ title: "   " }),
      guests: [GUEST],
      method: "CANCEL",
      organizer: { email: HOST.email },
      sequence: 4,
      t,
      language: "en-US",
    });

    email = queue_email.mock.calls[1][0] as QueuedEmail;

    expect(email.subject).toContain("calendar.invite_canceled_subject");
    expect(email.subject).toContain("calendar.untitled_event");
    expect(email.body).toContain("calendar.invite_body_canceled");
    expect(email.sender_display_name).toBeUndefined();
    expect(decode(email.attachments[0])).toContain("METHOD:CANCEL");
    expect(decode(email.attachments[0])).toContain("STATUS:CANCELLED");
  });

  it("counts cancelled, errored, and unqueued sends as failures", async () => {
    queue_email
      .mockImplementationOnce((email: QueuedEmail) => {
        queueMicrotask(() => email.on_cancel());

        return "q";
      })
      .mockImplementationOnce((email: QueuedEmail) => {
        queueMicrotask(() => email.on_error("boom"));

        return "q";
      })
      .mockImplementationOnce(() => null);

    const result = await send_invitations({
      event: make_event(),
      guests: [GUEST, GUEST, GUEST],
      method: "REQUEST",
      organizer: HOST,
      sequence: 1,
      t,
      language: "en-US",
    });

    expect(result).toEqual({ sent: 0, failed: 3 });
  });
});

describe("send_reply", () => {
  it("sends the reply to the organizer with the response in the subject", async () => {
    const ok = await send_reply({
      event: make_event(),
      organizer: HOST,
      attendee: { email: GUEST.email, display_name: "Guest" },
      response: "accepted",
      t,
      language: "en-US",
    });

    expect(ok).toBe(true);

    const email = queue_email.mock.calls[0][0] as QueuedEmail;

    expect(email.to).toEqual([HOST.email]);
    expect(email.subject).toContain("calendar.invite_reply_subject");
    expect(email.subject).toContain("calendar.attendee_accepted");
    expect(email.body).toContain("calendar.invite_body_reply");
    expect(email.sender_display_name).toBe("Guest");

    const ics = decode(email.attachments[0]);

    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("PARTSTAT=ACCEPTED");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("returns false when the reply cannot be built", async () => {
    const ok = await send_reply({
      event: make_event({ starts_at: "bad", ends_at: "bad" }),
      organizer: HOST,
      attendee: { email: GUEST.email },
      response: "declined",
      t,
      language: "en-US",
    });

    expect(ok).toBe(false);
    expect(queue_email).not.toHaveBeenCalled();
  });
});
