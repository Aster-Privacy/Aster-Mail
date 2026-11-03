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
import type { ItipMessage } from "@/services/calendar/itip";
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { beforeEach, describe, expect, it, vi } from "vitest";

const create_event = vi.fn();
const delete_event = vi.fn();
const list_calendars = vi.fn();
const list_events = vi.fn();
const update_event = vi.fn();
const cached_events = vi.fn();
const ensure_loaded = vi.fn();
const made_events = new Map<string, DecryptedCalendarEvent>();

vi.mock("@/services/api/calendar", async () => {
  const codec = await vi.importActual<
    typeof import("@/services/calendar/calendar_codec")
  >("@/services/calendar/calendar_codec");

  return {
    create_event: (...args: unknown[]) => create_event(...args),
    delete_event: (...args: unknown[]) => delete_event(...args),
    event_to_draft: codec.event_to_draft,
    list_calendars: (...args: unknown[]) => list_calendars(...args),
    list_events: (...args: unknown[]) => list_events(...args),
    update_event: (...args: unknown[]) => update_event(...args),
  };
});

vi.mock("@/services/calendar/sync_engine", () => ({
  calendar_sync_engine: {
    ensure_loaded: (...args: unknown[]) => ensure_loaded(...args),
    get_events: (...args: unknown[]) => cached_events(...args),
    get_bound_event: (id: string) =>
      (cached_events() as DecryptedCalendarEvent[]).find((event) => event.id === id) ??
      made_events.get(id),
  },
}));

const {
  apply_cancel,
  apply_reply,
  reply_from_sender,
  default_calendar_id,
  find_event_by_uid,
  find_message_event,
  find_series_master,
  mail_item_provenance,
  message_attendees,
  message_to_draft,
  remove_event,
  save_request_response,
  set_own_response,
  update_from_organizer,
} = await import("@/services/calendar/invite_store");

const SELF = "me@example.com";
const REPLY_AT = "2026-03-05T00:00:00.000Z";
const HOST = { email: "host@example.com", display_name: "Host" };

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  const event = build_event(overrides);

  if (!made_events.has(event.id)) {
    made_events.set(event.id, event);
  }

  return event;
}

function build_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  return {
    id: "evt-1",
    calendar_id: "cal-1",
    title: "Planning",
    description: "",
    location: "",
    starts_at: "2026-03-04T09:00:00.000Z",
    ends_at: "2026-03-04T09:30:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [
      { ...HOST, response: "accepted", is_organizer: true },
      { email: SELF, display_name: null, response: "needs_action", is_organizer: false },
    ],
    tags: ["work"],
    reminder_minutes: 15,
    color: "#ff0000",
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
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    uid: "uid-1",
    recurrence_id: null,
    sequence: 1,
    organizer_email: HOST.email,
    ...overrides,
  };
}

function make_message(overrides: Partial<ItipMessage> = {}): ItipMessage {
  return {
    method: "REQUEST",
    event: {
      title: "Planning v2",
      description: "Agenda",
      location: "Room 2",
      starts_at: "2026-03-04T10:00:00.000Z",
      ends_at: "2026-03-04T10:30:00.000Z",
      is_all_day: false,
      status: "confirmed",
      attendees: [],
      recurrence: null,
      recurrence_exceptions: [],
      availability: "busy",
      visibility: "default",
      conference_url: "https://meet.example.com/x",
      reminder_minutes: 5,
      uid: "uid-1",
      recurrence_id: null,
    },
    attendees: [
      { email: "Me@Example.com", display_name: "Me", response: "needs_action", is_organizer: false },
      { email: "other@example.com", display_name: null, response: "tentative", is_organizer: false },
    ],
    organizer: { ...HOST, response: "accepted", is_organizer: true },
    sequence: 2,
    uid: "uid-1",
    recurrence_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  made_events.clear();
  create_event.mockReset();
  delete_event.mockReset();
  list_calendars.mockReset();
  list_events.mockReset();
  cached_events.mockReset();
  cached_events.mockReturnValue([]);
  ensure_loaded.mockReset();
  ensure_loaded.mockResolvedValue(undefined);
  update_event.mockReset();
  update_event.mockImplementation(async (_id: string, draft: unknown) => ({
    data: { ...build_event(), ...(draft as object) },
  }));
  create_event.mockImplementation(async (draft: unknown) => ({
    data: { ...build_event(), id: "evt-new", ...(draft as object) },
  }));
});

describe("find_event_by_uid", () => {
  it("matches across the whole cache and prefers the master row", async () => {
    cached_events.mockReturnValue([
      make_event({ id: "occ", recurrence_master_id: "master" }),
      make_event({
        id: "master",
        starts_at: "2025-01-04T09:00:00.000Z",
        ends_at: "2025-01-04T10:00:00.000Z",
      }),
      make_event({ id: "other", uid: "uid-2" }),
      make_event({ id: "gone", trashed_at: "2026-03-01T00:00:00.000Z" }),
    ]);

    const found = await find_event_by_uid("uid-1", null, "2026-03-04T09:00:00.000Z");

    expect(found?.id).toBe("master");
    expect(ensure_loaded).toHaveBeenCalledTimes(1);
    expect(list_events).not.toHaveBeenCalled();
  });

  it("matches the recurrence id and returns null for unknown dates", async () => {
    cached_events.mockReturnValue([
      make_event({ id: "a", recurrence_id: "2026-03-11T09:00:00.000Z" }),
      make_event({ id: "b", recurrence_id: null }),
    ]);

    expect(
      (await find_event_by_uid("uid-1", "2026-03-11T09:00:00.000Z", "2026-03-04T09:00:00.000Z"))?.id,
    ).toBe("a");
    expect(await find_event_by_uid("uid-1", null, "not a date")).toBeNull();
    expect(await find_event_by_uid("missing", null, "2026-03-04T09:00:00.000Z")).toBeNull();
  });

  it("looks up the event behind a message only when it carries a uid", async () => {
    cached_events.mockReturnValue([make_event()]);

    expect((await find_message_event(make_message()))?.id).toBe("evt-1");
    expect(await find_message_event(make_message({ uid: null }))).toBeNull();
    expect(ensure_loaded).toHaveBeenCalledTimes(1);
  });
});

describe("default_calendar_id", () => {
  it("prefers the default calendar and falls back to the first", async () => {
    list_calendars.mockResolvedValueOnce({
      data: [{ id: "cal-2", is_default: false }, { id: "cal-1", is_default: true }],
    });
    expect(await default_calendar_id()).toBe("cal-1");

    list_calendars.mockResolvedValueOnce({
      data: [{ id: "cal-2", is_default: false }],
    });
    expect(await default_calendar_id()).toBe("cal-2");

    list_calendars.mockResolvedValueOnce({ data: [] });
    expect(await default_calendar_id()).toBeNull();
  });
});

describe("message_attendees", () => {
  it("dedupes by address, adds the organizer first, and keeps self once", () => {
    const attendees = message_attendees(make_message(), SELF, null);

    expect(attendees.map((attendee) => attendee.email)).toEqual([
      HOST.email,
      "Me@Example.com",
      "other@example.com",
    ]);
    expect(attendees[0].is_organizer).toBe(true);
  });

  it("appends self when the message does not list it and applies the response", () => {
    const attendees = message_attendees(
      make_message({ attendees: [] }),
      SELF,
      "accepted",
    );

    expect(attendees).toHaveLength(2);
    expect(attendees[1]).toMatchObject({ email: SELF, response: "accepted" });
  });
});

describe("message_to_draft", () => {
  it("keeps local-only fields from the previous copy", () => {
    const draft = message_to_draft(make_message(), "cal-fallback", [], make_event());

    expect(draft).toMatchObject({
      calendar_id: "cal-1",
      title: "Planning v2",
      tags: ["work"],
      reminder_minutes: 15,
      color: "#ff0000",
      guests_can_invite: false,
      sequence: 2,
      organizer_email: HOST.email,
      status: "confirmed",
    });
  });

  it("uses defaults for a new copy and marks cancellations", () => {
    const draft = message_to_draft(
      make_message({ method: "CANCEL", organizer: null }),
      "cal-fallback",
      [],
      null,
    );

    expect(draft).toMatchObject({
      calendar_id: "cal-fallback",
      status: "cancelled",
      tags: [],
      reminder_minutes: 5,
      color: null,
      guests_can_invite: true,
      organizer_email: null,
    });
  });

  it("does not store an organizer from an unverified message", () => {
    const forged = make_message({
      organizer: { email: SELF, display_name: null, response: "accepted", is_organizer: true },
    });
    const attendees = message_attendees(forged, SELF, null);
    const draft = message_to_draft(forged, "cal-1", attendees, null, false, SELF);

    expect(draft.organizer_email).toBeNull();
    expect(draft.attendees.some((attendee) => attendee.is_organizer)).toBe(false);

    const trusted = message_to_draft(forged, "cal-1", attendees, null, true, SELF);

    expect(trusted.organizer_email).toBe(SELF);
  });

  it("creates an unverified invite without an organizer address", async () => {
    list_calendars.mockResolvedValue({ data: [{ id: "cal-d", is_default: true }] });

    await save_request_response(make_message({ uid: "uid-fresh" }), SELF, null, null, undefined);

    expect(create_event.mock.calls[0][0].organizer_email).toBeNull();
  });
});

describe("recurring instances", () => {
  const RID = "2026-03-11T09:00:00.000Z";
  const series = () =>
    make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [],
    });

  it("finds the series behind an instance message", async () => {
    cached_events.mockReturnValue([series()]);

    expect(
      (await find_series_master(make_message({ recurrence_id: RID })))?.id,
    ).toBe("evt-series");
    expect(await find_series_master(make_message())).toBeNull();
  });

  it("refuses an instance update that the series organizer did not send", async () => {
    const result = await save_request_response(
      make_message({ recurrence_id: RID }),
      SELF,
      "accepted",
      null,
      "guest@example.com",
      series(),
    );

    expect(result).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("stores an organizer instance update as an override and hides the occurrence", async () => {
    await save_request_response(
      make_message({ recurrence_id: RID }),
      SELF,
      "accepted",
      null,
      HOST.email,
      series(),
    );

    expect(create_event.mock.calls[0][0]).toMatchObject({
      calendar_id: "cal-1",
      uid: "uid-1",
      recurrence_id: RID,
      recurrence: null,
    });
    expect(update_event.mock.calls[0][0]).toBe("evt-series");
    expect(update_event.mock.calls[0][1].recurrence_exceptions).toEqual([RID]);
  });

  it("ignores an occurrence cancel older than the series sequence", async () => {
    const current = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [],
      sequence: 5,
    });

    cached_events.mockReturnValue([current]);

    expect(
      await apply_cancel(
        make_message({ method: "CANCEL", recurrence_id: RID }),
        current,
        HOST.email,
      ),
    ).toMatchObject({ id: "evt-series", sequence: 5 });
    expect(update_event).not.toHaveBeenCalled();
  });

  it("cancels one occurrence by adding an exception to the series", async () => {
    const message = make_message({ method: "CANCEL", recurrence_id: RID });

    expect(await apply_cancel(message, series(), "guest@example.com")).toBeNull();
    expect(update_event).not.toHaveBeenCalled();

    await apply_cancel(message, series(), HOST.email);

    expect(update_event.mock.calls[0][0]).toBe("evt-series");
    expect(update_event.mock.calls[0][1].recurrence_exceptions).toEqual([RID]);
    expect(update_event.mock.calls[0][1].status).not.toBe("cancelled");
  });
});

describe("round 16 invite hardening", () => {
  const RID = "2026-03-11T09:00:00.000Z";
  const reply = (sequence = 2) =>
    make_message({
      method: "REPLY",
      sequence,
      attendees: [
        { email: SELF, display_name: null, response: "declined", is_organizer: false },
      ],
    });
  const answered = (responded_at: string) =>
    make_event({
      attendees: [
        { ...HOST, response: "accepted", is_organizer: true },
        { email: SELF, display_name: null, response: "accepted", is_organizer: false, responded_at },
      ],
    });

  it("ignores a reply older than the last one applied", async () => {
    const event = answered("2026-03-06T00:00:00.000Z");

    expect(
      await apply_reply(reply(), event, SELF, HOST.email, "2026-03-05T00:00:00.000Z"),
    ).toBe(event);
    expect(update_event).not.toHaveBeenCalled();

    const updated = await apply_reply(
      reply(),
      event,
      SELF,
      HOST.email,
      "2026-03-07T00:00:00.000Z",
    );
    const guest = updated?.attendees.find((a) => a.email === SELF);

    expect(guest?.response).toBe("declined");
    expect(guest?.responded_at).toBe("2026-03-07T00:00:00.000Z");
  });

  it("applies a reply only for the organizer, with a receive time and a current sequence", async () => {
    const event = make_event();

    expect(await apply_reply(reply(), event, SELF, SELF, REPLY_AT)).toBe(event);
    expect(await apply_reply(reply(), event, SELF, HOST.email, null)).toBe(event);
    expect(await apply_reply(reply(0), event, SELF, HOST.email, REPLY_AT)).toBe(event);
    expect(update_event).not.toHaveBeenCalled();
  });

  it("trusts only internal mail or mail that passed DMARC", () => {
    const item = {
      item_type: "received" as const,
      is_external: true,
      dmarc_result: "pass",
      created_at: REPLY_AT,
    };

    expect(mail_item_provenance(item)).toEqual({ trusted: true, received_at: REPLY_AT });
    expect(mail_item_provenance({ ...item, dmarc_result: "fail" }).trusted).toBe(false);
    expect(mail_item_provenance({ ...item, dmarc_result: undefined }).trusted).toBe(false);
    expect(mail_item_provenance({ ...item, dmarc_result: "none" }).trusted).toBe(false);
    expect(
      mail_item_provenance({ ...item, is_external: false, dmarc_result: undefined }).trusted,
    ).toBe(true);
    expect(mail_item_provenance({ ...item, item_type: "sent" }).trusted).toBe(false);
    expect(
      mail_item_provenance({ ...item, is_external: false, system_origin: true }).trusted,
    ).toBe(false);
    expect(mail_item_provenance(null)).toEqual({ trusted: false, received_at: null });
  });

  it("refuses an instance override when the series has no room for another exception", async () => {
    const full = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: Array.from({ length: 500 }, (_, index) =>
        new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
      ),
    });

    expect(
      await save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        "accepted",
        null,
        HOST.email,
        full,
      ),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("restores the series when the override cannot be created", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [],
    });

    create_event.mockRejectedValueOnce(new Error("offline"));

    await expect(
      save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        "accepted",
        null,
        HOST.email,
        series,
      ),
    ).rejects.toThrow("offline");
    expect(update_event).toHaveBeenCalledTimes(2);
    expect(update_event.mock.calls[1][1].recurrence_exceptions).toEqual([]);
  });

  it("restores the series when the server refuses the override", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [],
    });

    create_event.mockResolvedValueOnce({ data: null });

    expect(
      await save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        "accepted",
        null,
        HOST.email,
        series,
      ),
    ).toBeNull();
    expect(update_event).toHaveBeenCalledTimes(2);
    expect(update_event.mock.calls[1][1].recurrence_exceptions).toEqual([]);
  });

  it("creates no override when the series update fails", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [],
    });

    update_event.mockResolvedValueOnce({ data: null });

    expect(
      await save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        "accepted",
        null,
        HOST.email,
        series,
      ),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
  });

  it("keeps exceptions that back an existing override when the series is updated", () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [RID, "2026-03-18T09:00:00.000Z"],
    });

    cached_events.mockReturnValue([
      series,
      make_event({ id: "evt-override", recurrence_id: RID }),
    ]);

    const draft = message_to_draft(
      make_message({
        event: {
          ...make_message().event,
          recurrence: { frequency: "weekly", interval: 1 } as never,
          recurrence_exceptions: ["2026-03-25T09:00:00.000Z"],
        },
      }),
      "cal-1",
      [],
      series,
    );

    expect(draft.recurrence_exceptions).toEqual(["2026-03-25T09:00:00.000Z", RID]);
  });

  it("refuses a new invite whose uid belongs to an event with no organizer", async () => {
    cached_events.mockReturnValue([
      make_event({ id: "evt-imported", organizer_email: null, attendees: [] }),
    ]);
    list_calendars.mockResolvedValue({ data: [{ id: "cal-d", is_default: true }] });

    expect(
      await save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        null,
        null,
        HOST.email,
      ),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
  });

  it("drops a recurrence rule carried by an instance message", () => {
    const draft = message_to_draft(
      make_message({
        recurrence_id: RID,
        event: {
          ...make_message().event,
          recurrence: { frequency: "daily", interval: 1 } as never,
          recurrence_exceptions: ["2026-03-12T09:00:00.000Z"],
        },
      }),
      "cal-1",
      [],
      null,
    );

    expect(draft.recurrence).toBeNull();
    expect(draft.recurrence_exceptions).toEqual([]);
  });

  it("keeps the last reply time when the organizer updates the event", () => {
    const draft = message_to_draft(
      make_message(),
      "cal-1",
      [{ email: SELF, display_name: null, response: "needs_action", is_organizer: false }],
      answered("2026-03-06T00:00:00.000Z"),
    );

    expect(draft.attendees[0].responded_at).toBe("2026-03-06T00:00:00.000Z");
  });

  it("refuses a new invite that reuses a uid held by another organizer", async () => {
    cached_events.mockReturnValue([
      make_event({ id: "evt-taken", organizer_email: "someone@example.com" }),
    ]);
    list_calendars.mockResolvedValue({ data: [{ id: "cal-d", is_default: true }] });

    expect(
      await save_request_response(
        make_message({ recurrence_id: RID }),
        SELF,
        null,
        null,
        HOST.email,
      ),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
  });

  it("matches an empty stored organizer through the organizer attendee", () => {
    expect(
      update_from_organizer(make_message(), make_event({ organizer_email: "" }), HOST.email),
    ).toBe(true);
  });
});

describe("round 18 invite hardening", () => {
  const RID = "2026-03-11T09:00:00.000Z";

  it("refuses a new invite reusing a uid unless the organizer is proven", async () => {
    cached_events.mockReturnValue([make_event({ id: "evt-held" })]);
    list_calendars.mockResolvedValue({ data: [{ id: "cal-d", is_default: true }] });

    expect(
      await save_request_response(make_message(), SELF, null, null, undefined),
    ).toBeNull();
    expect(
      await save_request_response(make_message(), SELF, null, null, "guest@example.com"),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();

    expect(
      await save_request_response(make_message(), SELF, null, null, HOST.email),
    ).not.toBeNull();
    expect(create_event).not.toHaveBeenCalled();
    expect(update_event.mock.calls[0][0]).toBe("evt-held");
  });

  it("adds self to a stale update that no longer lists them", async () => {
    const existing = make_event({
      sequence: 5,
      attendees: [{ ...HOST, response: "accepted", is_organizer: true }],
    });

    await save_request_response(make_message(), SELF, "accepted", existing, HOST.email);

    const draft = update_event.mock.calls[0][1];
    const own = draft.attendees.find(
      (attendee: { email: string }) => attendee.email.toLowerCase() === SELF,
    );

    expect(draft.title).toBe("Planning");
    expect(own?.response).toBe("accepted");
    expect(own?.is_organizer).toBe(false);
  });

  it("reports a cancel that cannot fit in a full series", async () => {
    const exceptions = Array.from({ length: 500 }, (_, index) =>
      new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
    );
    const full = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: exceptions,
    });
    const cancel = (recurrence_id: string) =>
      make_message({ method: "CANCEL", recurrence_id });

    expect(await apply_cancel(cancel(RID), full, HOST.email)).toBeNull();
    expect(await apply_cancel(cancel(exceptions[0]), full, HOST.email)).toBe(full);
    expect(update_event).not.toHaveBeenCalled();
  });

  it("prefers the organizer's copy and then the newest sequence for a shared uid", async () => {
    cached_events.mockReturnValue([
      make_event({ id: "foreign", organizer_email: "other@example.com", sequence: 9 }),
      make_event({ id: "own-old", sequence: 1 }),
      make_event({ id: "own-new", sequence: 4 }),
    ]);

    expect(
      (await find_event_by_uid("uid-1", null, "2026-03-04T09:00:00.000Z", HOST.email))?.id,
    ).toBe("own-new");
    expect(
      (await find_event_by_uid("uid-1", null, "2026-03-04T09:00:00.000Z"))?.id,
    ).toBe("foreign");
    expect((await find_message_event(make_message()))?.id).toBe("own-new");
  });
});

describe("round 19 fresh event reads", () => {
  const RID = "2026-03-11T09:00:00.000Z";

  it("checks staleness against the newest synced copy, not the card snapshot", async () => {
    const snapshot = make_event({ sequence: 1 });
    const newer = make_event({ sequence: 3, starts_at: "2026-03-04T12:00:00.000Z" });

    cached_events.mockReturnValue([newer]);

    await save_request_response(
      make_message({ sequence: 2 }),
      SELF,
      "tentative",
      snapshot,
      HOST.email,
    );

    const draft = update_event.mock.calls[0][1];

    expect(draft.starts_at).toBe("2026-03-04T12:00:00.000Z");
    expect(draft.sequence).toBe(3);
  });

  it("refuses to write an event deleted since the card loaded", async () => {
    const snapshot = make_event();

    cached_events.mockReturnValue([
      make_event({ trashed_at: "2026-03-05T00:00:00.000Z" }),
    ]);

    expect(
      await save_request_response(make_message(), SELF, "accepted", snapshot, HOST.email),
    ).toBeNull();
    expect(await apply_cancel(make_message({ method: "CANCEL" }), snapshot, HOST.email)).toBeNull();
    expect(await set_own_response(snapshot, SELF, "accepted")).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("updates an override created elsewhere instead of adding a second one", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
      recurrence_exceptions: [RID],
    });

    cached_events.mockReturnValue([
      series,
      make_event({ id: "evt-override", recurrence_id: RID }),
    ]);

    await save_request_response(
      make_message({ recurrence_id: RID }),
      SELF,
      "accepted",
      null,
      HOST.email,
      series,
    );

    expect(create_event).not.toHaveBeenCalled();
    expect(update_event).toHaveBeenCalledTimes(1);
    expect(update_event.mock.calls[0][0]).toBe("evt-override");
  });
});

describe("round 20 bound event reads", () => {
  it("refuses to write a card copy the sync engine no longer holds", async () => {
    const gone = build_event({ id: "evt-gone" });

    expect(await apply_cancel(make_message({ method: "CANCEL" }), gone, HOST.email)).toBeNull();
    expect(await set_own_response(gone, SELF, "accepted")).toBeNull();
    expect(
      await save_request_response(make_message(), SELF, "accepted", gone, HOST.email),
    ).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("answers an expanded occurrence on its series", async () => {
    const series = make_event({
      id: "evt-series",
      recurrence: { frequency: "weekly", interval: 1 } as never,
    });
    const occurrence = build_event({
      ...series,
      id: "evt-series#2026-03-11T09:00:00.000Z",
      recurrence_master_id: "evt-series",
      occurrence_start: "2026-03-11T09:00:00.000Z",
    });

    await set_own_response(occurrence, SELF, "declined");

    expect(update_event.mock.calls[0][0]).toBe("evt-series");
  });
});

describe("update_from_organizer", () => {
  it("accepts only the organizer of the stored event", () => {
    expect(update_from_organizer(make_message(), make_event(), "Host@Example.com")).toBe(
      true,
    );
    expect(update_from_organizer(make_message(), make_event(), "guest@example.com")).toBe(
      false,
    );
    expect(update_from_organizer(make_message(), make_event(), undefined)).toBe(false);
    expect(
      update_from_organizer(make_message({ organizer: null }), make_event(), HOST.email),
    ).toBe(false);
  });

  it("refuses a sender who names itself as the new organizer", () => {
    const forged = make_message({
      organizer: {
        email: "guest@example.com",
        display_name: null,
        response: "accepted",
        is_organizer: true,
      },
    });

    expect(update_from_organizer(forged, make_event(), "guest@example.com")).toBe(false);
  });

  it("falls back to the organizer attendee when no organizer address is stored", () => {
    expect(
      update_from_organizer(
        make_message(),
        make_event({ organizer_email: null }),
        HOST.email,
      ),
    ).toBe(true);
  });
});

describe("save_request_response", () => {
  it("leaves an existing event alone when the organizer did not send the update", async () => {
    const result = await save_request_response(
      make_message({ sequence: 9 }),
      SELF,
      "accepted",
      make_event({ sequence: 1 }),
      "guest@example.com",
    );

    expect(result).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("updates an existing copy from a newer message", async () => {
    const result = await save_request_response(
      make_message(),
      SELF,
      "accepted",
      make_event({ sequence: 1 }),
      HOST.email,
    );

    expect(update_event).toHaveBeenCalledTimes(1);
    expect(update_event.mock.calls[0][0]).toBe("evt-1");
    expect(update_event.mock.calls[0][1]).toMatchObject({ title: "Planning v2" });
    expect(result?.attendees.find((a) => a.email === "Me@Example.com")?.response).toBe(
      "accepted",
    );
  });

  it("keeps the local copy when the message is stale and only records the reply", async () => {
    await save_request_response(
      make_message({ sequence: 0 }),
      SELF,
      "declined",
      make_event({ sequence: 3 }),
      HOST.email,
    );

    const draft = update_event.mock.calls[0][1];

    expect(draft.title).toBe("Planning");
    expect(draft.attendees.find((a: { email: string }) => a.email === SELF)?.response).toBe(
      "declined",
    );
  });

  it("creates a copy in the default calendar when nothing matches", async () => {
    list_calendars.mockResolvedValue({ data: [{ id: "cal-d", is_default: true }] });

    const result = await save_request_response(
      make_message(),
      SELF,
      null,
      null,
      HOST.email,
    );

    expect(create_event).toHaveBeenCalledTimes(1);
    expect(create_event.mock.calls[0][0]).toMatchObject({ calendar_id: "cal-d" });
    expect(result?.id).toBe("evt-new");
  });

  it("gives up without a calendar", async () => {
    list_calendars.mockResolvedValue({ data: [] });

    expect(
      await save_request_response(make_message(), SELF, null, null, HOST.email),
    ).toBeNull();
    expect(create_event).not.toHaveBeenCalled();
  });
});

describe("cancel, reply, and own response", () => {
  it("marks the event cancelled", async () => {
    await apply_cancel(
      make_message({ method: "CANCEL" }),
      make_event(),
      HOST.email,
    );

    expect(update_event.mock.calls[0][1]).toMatchObject({ status: "cancelled" });
  });

  it("ignores a cancel older than the stored sequence", async () => {
    const current = make_event({ sequence: 5 });

    cached_events.mockReturnValue([current]);

    expect(
      await apply_cancel(make_message({ method: "CANCEL" }), current, HOST.email),
    ).toMatchObject({ id: current.id, sequence: 5 });
    expect(update_event).not.toHaveBeenCalled();
  });

  it("ignores a cancel that the organizer did not send", async () => {
    const forged = make_message({
      method: "CANCEL",
      organizer: {
        email: "guest@example.com",
        display_name: null,
        response: "accepted",
        is_organizer: true,
      },
    });

    expect(await apply_cancel(forged, make_event(), "guest@example.com")).toBeNull();
    expect(
      await apply_cancel(
        make_message({ method: "CANCEL" }),
        make_event(),
        "guest@example.com",
      ),
    ).toBeNull();
    expect(update_event).not.toHaveBeenCalled();
  });

  it("records the response of the guest who sent the reply", async () => {
    const updated = await apply_reply(
      make_message({
        method: "REPLY",
        attendees: [
          { email: "ME@example.com", display_name: null, response: "accepted", is_organizer: false },
        ],
      }),
      make_event(),
      "me@example.com",
      HOST.email,
      REPLY_AT,
    );

    const attendees = updated?.attendees ?? [];

    expect(attendees.find((a) => a.email === SELF)?.response).toBe("accepted");
    expect(attendees).toHaveLength(2);
  });

  it("ignores a reply sent by someone other than the guest it names", async () => {
    const event = make_event();
    const message = make_message({
      method: "REPLY",
      attendees: [
        { email: SELF, display_name: null, response: "declined", is_organizer: false },
      ],
    });

    expect(reply_from_sender(message, event, "attacker@example.com")).toBeNull();
    expect(
      await apply_reply(message, event, "attacker@example.com", HOST.email, REPLY_AT),
    ).toBe(event);
    expect(update_event).not.toHaveBeenCalled();
  });

  it("never adds attendees or changes other guests from a reply", async () => {
    const event = make_event();
    const several = make_message({
      method: "REPLY",
      attendees: [
        { email: SELF, display_name: null, response: "accepted", is_organizer: false },
        { email: "new@example.com", display_name: "New", response: "declined", is_organizer: false },
      ],
    });
    const stranger = make_message({
      method: "REPLY",
      attendees: [
        { email: "new@example.com", display_name: "New", response: "accepted", is_organizer: false },
      ],
    });
    const organizer = make_message({
      method: "REPLY",
      attendees: [{ ...HOST, response: "declined", is_organizer: false }],
    });

    const run = (message: ItipMessage, sender: string | undefined) =>
      apply_reply(message, event, sender, HOST.email, REPLY_AT);

    expect(await run(several, SELF)).toBe(event);
    expect(await run(stranger, "new@example.com")).toBe(event);
    expect(await run(organizer, HOST.email)).toBe(event);
    expect(await run(make_message({ attendees: [] }), SELF)).toBe(event);
    expect(await run(several, undefined)).toBe(event);
    expect(update_event).not.toHaveBeenCalled();
  });

  it("sets or adds the own response", async () => {
    await set_own_response(make_event(), SELF, "tentative");
    expect(
      update_event.mock.calls[0][1].attendees.find((a: { email: string }) => a.email === SELF)
        ?.response,
    ).toBe("tentative");

    await set_own_response(make_event({ id: "evt-2", attendees: [] }), SELF, "accepted");
    expect(update_event.mock.calls[1][1].attendees).toEqual([
      { email: SELF, display_name: null, response: "accepted", is_organizer: false },
    ]);
  });

  it("reports whether the delete succeeded", async () => {
    delete_event.mockResolvedValueOnce({ success: true });
    expect(await remove_event("evt-1")).toBe(true);

    delete_event.mockResolvedValueOnce({ success: false });
    expect(await remove_event("evt-1")).toBe(false);
  });
});
