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
  CalendarAttendee,
  CalendarAttendeeResponse,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { ImportedIcsEvent } from "@/services/calendar/ics_file";

import {
  build_vevent_lines,
  fold_line,
  parse_ics_event_sources,
  parse_params,
  to_utc_stamp,
  unfold,
} from "@/services/calendar/ics_file";
import {
  sanitize_calendar_email,
  sanitize_calendar_text,
} from "@/services/calendar/sanitize";
import { is_own_address } from "@/services/calendar/own_addresses";

export type ItipMethod = "REQUEST" | "CANCEL" | "REPLY";

export interface ItipMessage {
  method: ItipMethod;
  event: ImportedIcsEvent;
  attendees: CalendarAttendee[];
  organizer: CalendarAttendee | null;
  sequence: number;
  uid: string | null;
  recurrence_id: string | null;
}

export interface ItipParty {
  email: string;
  display_name?: string | null;
}

export interface ItipRequestOptions {
  organizer: ItipParty;
  sequence: number;
  generated_at: string;
  attendees?: CalendarAttendee[];
}

export interface ItipReplyOptions {
  organizer: ItipParty;
  attendee: ItipParty;
  response: CalendarAttendeeResponse;
  sequence: number;
  generated_at: string;
}

export const ITIP_MIME_TYPE = "text/calendar";

export const ITIP_ATTACHMENT_NAME = "invite.ics";

const MAX_ITIP_TEXT_BYTES = 2 * 1024 * 1024;

const METHODS: Record<string, ItipMethod> = {
  REQUEST: "REQUEST",
  CANCEL: "CANCEL",
  REPLY: "REPLY",
};

function normalize_email(value: string): string {
  return value.trim().toLowerCase();
}

function party_name(party: ItipParty): string | null {
  const name = party.display_name?.trim() ?? "";

  return name.length > 0 ? name : null;
}

function organizer_attendee(organizer: ItipParty): CalendarAttendee {
  return {
    email: organizer.email.trim(),
    display_name: party_name(organizer),
    response: "accepted",
    is_organizer: true,
  };
}

function wrap_calendar(method: ItipMethod, vevent: string[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aster//Aster Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...vevent,
    "END:VCALENDAR",
  ];

  return `${lines.map(fold_line).join("\r\n")}\r\n`;
}

function guest_list(
  event: DecryptedCalendarEvent,
  organizer: ItipParty,
  subset: CalendarAttendee[] | undefined,
): CalendarAttendee[] {
  const organizer_key = normalize_email(organizer.email);
  const source = subset ?? event.attendees;

  return source
    .filter((attendee) => normalize_email(attendee.email) !== organizer_key)
    .map((attendee) => ({ ...attendee, is_organizer: false }));
}

export function build_itip_request(
  event: DecryptedCalendarEvent,
  options: ItipRequestOptions,
): string | null {
  const vevent = build_vevent_lines(event, to_utc_stamp(options.generated_at), {
    organizer: organizer_attendee(options.organizer),
    attendees: guest_list(event, options.organizer, options.attendees),
    sequence: options.sequence,
    rsvp: true,
    include_alarm: false,
  });

  return vevent ? wrap_calendar("REQUEST", vevent) : null;
}

export function build_itip_cancel(
  event: DecryptedCalendarEvent,
  options: ItipRequestOptions,
): string | null {
  const vevent = build_vevent_lines(event, to_utc_stamp(options.generated_at), {
    organizer: organizer_attendee(options.organizer),
    attendees: guest_list(event, options.organizer, options.attendees),
    sequence: options.sequence,
    status: "cancelled",
    include_alarm: false,
  });

  return vevent ? wrap_calendar("CANCEL", vevent) : null;
}

export function build_itip_reply(
  event: DecryptedCalendarEvent,
  options: ItipReplyOptions,
): string | null {
  const replier: CalendarAttendee = {
    email: options.attendee.email.trim(),
    display_name: party_name(options.attendee),
    response: options.response,
    is_organizer: false,
  };
  const vevent = build_vevent_lines(event, to_utc_stamp(options.generated_at), {
    organizer: organizer_attendee(options.organizer),
    attendees: [replier],
    sequence: options.sequence,
    include_alarm: false,
  });

  return vevent ? wrap_calendar("REPLY", vevent) : null;
}

function read_property(block: string, name: string): string | null {
  const pattern = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:([^\\r\\n]*)`, "im");
  const match = block.match(pattern);

  return match ? match[1].trim() : null;
}

function read_method(unfolded: string): ItipMethod | null {
  const header = unfolded.split(/BEGIN:VEVENT/i)[0] ?? "";
  const value =
    read_property(header, "METHOD") ?? read_property(unfolded, "METHOD");

  if (value === null) {
    return null;
  }

  return METHODS[value.toUpperCase()] ?? null;
}

function read_sequence(block: string): number {
  const value = read_property(block, "SEQUENCE");

  if (value === null) {
    return 0;
  }

  const trimmed = value.trim();

  if (!/^\d{1,9}$/.test(trimmed)) {
    return 0;
  }

  return Number.parseInt(trimmed, 10);
}

function read_organizer(block: string): CalendarAttendee | null {
  const match = block.match(/^ORGANIZER((?:;[^:\r\n]*)?):([^\r\n]*)/im);

  if (!match) {
    return null;
  }

  const params = parse_params(match[1] ?? "");
  const email = sanitize_calendar_email(match[2]);

  if (email.length === 0) {
    return null;
  }

  const display_name = sanitize_calendar_text(params.CN, "display_name");

  return {
    email,
    display_name: display_name.length > 0 ? display_name : null,
    response: "accepted",
    is_organizer: true,
  };
}

export function parse_itip_message(text: unknown): ItipMessage | null {
  if (typeof text !== "string" || text.length === 0) {
    return null;
  }

  if (text.length > MAX_ITIP_TEXT_BYTES) {
    return null;
  }

  try {
    const unfolded = unfold(text);
    const method = read_method(unfolded);

    if (method === null) {
      return null;
    }

    const sources = parse_ics_event_sources(text);

    if (sources.length === 0) {
      return null;
    }

    const { event: parsed_event, block } = sources[0];
    const override_ids = new Set(
      sources
        .slice(1)
        .filter(
          (source) =>
            source.event.uid === parsed_event.uid &&
            source.event.recurrence_id !== null,
        )
        .map((source) => source.event.recurrence_id),
    );
    const event =
      parsed_event.recurrence_id === null && override_ids.size > 0
        ? {
            ...parsed_event,
            recurrence_exceptions: parsed_event.recurrence_exceptions.filter(
              (value) => !override_ids.has(value),
            ),
          }
        : parsed_event;
    const organizer =
      read_organizer(block) ??
      event.attendees.find((attendee) => attendee.is_organizer) ??
      null;
    const organizer_key = organizer ? normalize_email(organizer.email) : "";
    const attendees = event.attendees
      .filter((attendee) => normalize_email(attendee.email) !== organizer_key)
      .map((attendee) => ({ ...attendee, is_organizer: false }));

    return {
      method,
      event,
      attendees,
      organizer,
      sequence: read_sequence(block),
      uid: event.uid,
      recurrence_id: event.recurrence_id,
    };
  } catch {
    return null;
  }
}

export function is_itip_attachment(meta: {
  filename?: string | null;
  content_type?: string | null;
}): boolean {
  const content_type = (meta.content_type ?? "").trim().toLowerCase();
  const filename = (meta.filename ?? "").trim().toLowerCase();

  return (
    content_type.startsWith(ITIP_MIME_TYPE) ||
    content_type === "application/ics" ||
    filename.endsWith(".ics")
  );
}

export function itip_mime_type(method: ItipMethod): string {
  return `${ITIP_MIME_TYPE}; method=${method}`;
}

export function find_attendee(
  attendees: CalendarAttendee[],
  email: string,
): CalendarAttendee | null {
  const key = normalize_email(email);

  return (
    attendees.find((attendee) => normalize_email(attendee.email) === key) ??
    null
  );
}

export function same_address(a: string, b: string): boolean {
  return normalize_email(a) === normalize_email(b);
}

export function event_organizer_email(
  event: Pick<DecryptedCalendarEvent, "attendees" | "organizer_email">,
): string | null {
  const stored =
    typeof event.organizer_email === "string"
      ? event.organizer_email.trim()
      : "";

  if (stored.length > 0) {
    return stored;
  }

  const flagged = event.attendees.find((attendee) => attendee.is_organizer);

  return flagged ? flagged.email : null;
}

export function is_event_organizer(
  event: Pick<DecryptedCalendarEvent, "attendees" | "organizer_email">,
  self_email: string,
): boolean {
  const self_key = normalize_email(self_email);

  if (self_key.length === 0) {
    return false;
  }

  const organizer = event_organizer_email(event);

  return organizer !== null && is_own_address(organizer, self_key);
}

export function event_guests(
  event: Pick<DecryptedCalendarEvent, "attendees" | "organizer_email">,
  self_email: string,
): CalendarAttendee[] {
  const organizer_key = normalize_email(
    event_organizer_email(event) ?? self_email,
  );

  const organizer_is_self = is_own_address(organizer_key, self_email);

  return event.attendees.filter(
    (attendee) =>
      !attendee.is_organizer &&
      (normalize_email(attendee.email) !== organizer_key || organizer_is_self),
  );
}

export function owns_event_for_edit(
  event: Pick<DecryptedCalendarEvent, "attendees" | "organizer_email">,
  self_email: string,
): boolean {
  const organizer = event_organizer_email(event);

  if (organizer !== null) {
    return is_own_address(organizer, self_email);
  }

  return event.attendees.every((attendee) =>
    is_own_address(attendee.email, self_email),
  );
}

export function next_sequence(
  event: Pick<DecryptedCalendarEvent, "sequence">,
): number {
  const current =
    typeof event.sequence === "number" && Number.isFinite(event.sequence)
      ? Math.max(0, Math.floor(event.sequence))
      : 0;

  return current + 1;
}
