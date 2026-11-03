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
import type { MailItem } from "@/services/api/mail";
import type {
  CalendarAttendee,
  CalendarAttendeeResponse,
  CalendarEventDraft,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import {
  create_event,
  delete_event,
  event_to_draft,
  list_calendars,
  update_event,
} from "@/services/api/calendar";
import {
  event_organizer_email,
  is_event_organizer,
  same_address,
} from "@/services/calendar/itip";
import { is_own_address } from "@/services/calendar/own_addresses";
import { calendar_sync_engine } from "@/services/calendar/sync_engine";

function same_recurrence_id(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? "") === (b ?? "");
}

export async function find_event_by_uid(
  uid: string,
  recurrence_id: string | null,
  near: string,
  organizer_email: string | null = null,
): Promise<DecryptedCalendarEvent | null> {
  const anchor = new Date(near);

  if (Number.isNaN(anchor.getTime())) {
    return null;
  }

  await calendar_sync_engine.ensure_loaded();

  const matches = calendar_sync_engine
    .get_events()
    .filter(
      (event) =>
        !event.trashed_at &&
        event.uid === uid &&
        same_recurrence_id(event.recurrence_id, recurrence_id),
    );

  if (matches.length === 0) {
    return null;
  }

  const rank = (event: DecryptedCalendarEvent) => {
    const known = event_organizer_email(event);
    const organizer_match =
      organizer_email !== null &&
      known !== null &&
      same_address(known, organizer_email);

    return (
      (organizer_match ? 2 : 0) + (event.recurrence_master_id === null ? 1 : 0)
    );
  };

  return [...matches].sort(
    (a, b) => rank(b) - rank(a) || (b.sequence ?? 0) - (a.sequence ?? 0),
  )[0];
}

export async function default_calendar_id(): Promise<string | null> {
  const { data } = await list_calendars();
  const target = data.find((calendar) => calendar.is_default) ?? data[0];

  return target?.id ?? null;
}

export function message_attendees(
  message: ItipMessage,
  self_email: string,
  response: CalendarAttendeeResponse | null,
): CalendarAttendee[] {
  const seen = new Set<string>();
  const result: CalendarAttendee[] = [];
  const push = (attendee: CalendarAttendee) => {
    const key = attendee.email.trim().toLowerCase();

    if (key.length === 0 || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(attendee);
  };

  if (message.organizer) {
    push({ ...message.organizer, is_organizer: true });
  }

  for (const attendee of message.attendees) {
    push(attendee);
  }

  if (self_email.length > 0 && !seen.has(self_email.toLowerCase())) {
    push({
      email: self_email,
      display_name: null,
      response: "needs_action",
      is_organizer: false,
    });
  }

  if (response === null) {
    return result;
  }

  return result.map((attendee) =>
    same_address(attendee.email, self_email)
      ? { ...attendee, response }
      : attendee,
  );
}

export function message_to_draft(
  message: ItipMessage,
  calendar_id: string,
  attendees: CalendarAttendee[],
  previous: DecryptedCalendarEvent | null,
  trusted = true,
  self_email = "",
): CalendarEventDraft {
  const entry = message.event;
  const base = previous ? event_to_draft(previous) : null;
  const is_instance = message.recurrence_id !== null;
  const kept_attendees = attendees.map((attendee) => {
    const prior = previous?.attendees.find((candidate) =>
      same_address(candidate.email, attendee.email),
    );
    const claimed =
      !trusted &&
      attendee.is_organizer &&
      is_own_address(attendee.email, self_email)
        ? { ...attendee, is_organizer: false }
        : attendee;

    return prior?.responded_at && !claimed.responded_at
      ? { ...claimed, responded_at: prior.responded_at }
      : claimed;
  });
  const organizer_email = trusted
    ? (message.organizer?.email ?? base?.organizer_email ?? null)
    : (base?.organizer_email ?? null);

  return {
    calendar_id: base?.calendar_id ?? calendar_id,
    title: entry.title,
    description: entry.description,
    location: entry.location,
    starts_at: entry.starts_at,
    ends_at: entry.ends_at,
    is_all_day: entry.is_all_day,
    status: message.method === "CANCEL" ? "cancelled" : entry.status,
    attendees: kept_attendees,
    tags: base?.tags ?? [],
    reminder_minutes: base?.reminder_minutes ?? entry.reminder_minutes,
    color: base?.color ?? null,
    availability: entry.availability,
    visibility: entry.visibility,
    event_kind: base?.event_kind ?? "default",
    is_completed: false,
    working_location: null,
    conference_url: entry.conference_url,
    guests_can_modify: false,
    guests_can_invite: base?.guests_can_invite ?? true,
    guests_can_see_guests: base?.guests_can_see_guests ?? true,
    recurrence: is_instance ? null : entry.recurrence,
    recurrence_exceptions: is_instance
      ? []
      : kept_exceptions(entry.recurrence_exceptions, previous),
    uid: message.uid,
    recurrence_id: message.recurrence_id,
    sequence: message.sequence,
    organizer_email,
  };
}

function kept_exceptions(
  incoming: string[],
  previous: DecryptedCalendarEvent | null,
): string[] {
  if (!previous?.uid) {
    return incoming;
  }

  const overridden = new Set(
    calendar_sync_engine
      .get_events()
      .filter(
        (event) =>
          !event.trashed_at &&
          event.uid === previous.uid &&
          event.recurrence_id !== null &&
          event.id !== previous.id,
      )
      .map((event) => event.recurrence_id as string),
  );
  const merged = [...incoming];

  for (const value of previous.recurrence_exceptions) {
    if (overridden.has(value) && !merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged.slice(0, MAX_SERIES_EXCEPTIONS);
}

export async function find_message_event(
  message: ItipMessage,
): Promise<DecryptedCalendarEvent | null> {
  if (!message.uid) {
    return null;
  }

  return find_event_by_uid(
    message.uid,
    message.recurrence_id,
    message.event.starts_at,
    message.organizer?.email ?? null,
  );
}

const MAX_SERIES_EXCEPTIONS = 500;

export async function find_series_master(
  message: ItipMessage,
): Promise<DecryptedCalendarEvent | null> {
  if (!message.uid || !message.recurrence_id) {
    return null;
  }

  const master = await find_event_by_uid(
    message.uid,
    null,
    message.event.starts_at,
    message.organizer?.email ?? null,
  );

  return master && master.recurrence ? master : null;
}

async function current_event(
  event: DecryptedCalendarEvent,
): Promise<DecryptedCalendarEvent | null> {
  await calendar_sync_engine.ensure_loaded();

  const current = calendar_sync_engine.get_bound_event(
    event.recurrence_master_id ?? event.id,
  );

  return current && !current.trashed_at ? current : null;
}

function with_exception(
  master: DecryptedCalendarEvent,
  recurrence_id: string,
): CalendarEventDraft | null {
  if (
    master.recurrence_exceptions.includes(recurrence_id) ||
    master.recurrence_exceptions.length >= MAX_SERIES_EXCEPTIONS
  ) {
    return null;
  }

  return {
    ...event_to_draft(master),
    recurrence_exceptions: [...master.recurrence_exceptions, recurrence_id],
  };
}

export interface InviteProvenance {
  trusted: boolean;
  received_at: string | null;
}

export const UNTRUSTED_PROVENANCE: InviteProvenance = {
  trusted: false,
  received_at: null,
};

export function mail_item_provenance(
  item: Pick<
    MailItem,
    | "item_type"
    | "is_external"
    | "system_origin"
    | "dmarc_result"
    | "created_at"
  > | null,
): InviteProvenance {
  if (!item || item.item_type !== "received" || item.system_origin) {
    return UNTRUSTED_PROVENANCE;
  }

  const received = Date.parse(item.created_at);
  const authenticated =
    !item.is_external ||
    (typeof item.dmarc_result === "string" &&
      item.dmarc_result.trim().toLowerCase() === "pass");

  return {
    trusted: authenticated,
    received_at: Number.isFinite(received)
      ? new Date(received).toISOString()
      : null,
  };
}

export function update_from_organizer(
  message: ItipMessage,
  existing: DecryptedCalendarEvent,
  sender_email: string | undefined,
): boolean {
  const organizer = message.organizer?.email;
  const known = event_organizer_email(existing);

  if (!sender_email || !organizer || !known) {
    return false;
  }

  return (
    same_address(organizer, sender_email) && same_address(known, organizer)
  );
}

export async function uid_held_by_other_organizer(
  message: ItipMessage,
  sender_email: string | undefined,
): Promise<boolean> {
  if (!message.uid) {
    return false;
  }

  await calendar_sync_engine.ensure_loaded();
  const organizer = message.organizer?.email ?? "";

  return calendar_sync_engine.get_events().some((event) => {
    if (event.trashed_at || event.uid !== message.uid) {
      return false;
    }

    const known = event_organizer_email(event);

    return (
      known === null ||
      !same_address(known, organizer) ||
      !update_from_organizer(message, event, sender_email)
    );
  });
}

function stale_attendees(
  existing: DecryptedCalendarEvent,
  incoming: CalendarAttendee[],
  self_email: string,
  response: CalendarAttendeeResponse | null,
): CalendarAttendee[] {
  const kept = existing.attendees.map((attendee) =>
    response !== null && same_address(attendee.email, self_email)
      ? { ...attendee, response }
      : attendee,
  );
  const own = incoming.find((attendee) =>
    same_address(attendee.email, self_email),
  );

  if (
    response === null ||
    !own ||
    kept.some((attendee) => same_address(attendee.email, self_email))
  ) {
    return kept;
  }

  return [...kept, { ...own, response, is_organizer: false }];
}

export async function save_request_response(
  message: ItipMessage,
  self_email: string,
  response: CalendarAttendeeResponse | null,
  existing_snapshot: DecryptedCalendarEvent | null,
  sender_email: string | undefined,
  series_snapshot: DecryptedCalendarEvent | null = null,
): Promise<DecryptedCalendarEvent | null> {
  const attendees = message_attendees(message, self_email, response);

  await calendar_sync_engine.ensure_loaded();

  const existing = existing_snapshot
    ? await current_event(existing_snapshot)
    : await find_message_event(message);

  if (existing_snapshot && !existing) {
    return null;
  }

  const series = existing
    ? null
    : series_snapshot
      ? await current_event(series_snapshot)
      : await find_series_master(message);

  if (!existing && series_snapshot && !series) {
    return null;
  }

  if (!existing && series && message.recurrence_id) {
    if (!update_from_organizer(message, series, sender_email)) {
      return null;
    }

    const already_excluded = series.recurrence_exceptions.includes(
      message.recurrence_id,
    );
    const exception = with_exception(series, message.recurrence_id);

    if (!already_excluded && !exception) {
      return null;
    }

    const master = exception
      ? (await update_event(series.id, exception)).data
      : series;

    if (!master) {
      return null;
    }

    const restore_series = async () => {
      if (!exception) {
        return;
      }

      await update_event(master.id, {
        ...event_to_draft(master),
        recurrence_exceptions: master.recurrence_exceptions.filter(
          (value) => value !== message.recurrence_id,
        ),
      }).catch(() => undefined);
    };

    try {
      const created = await create_event(
        message_to_draft(message, series.calendar_id, attendees, series),
      );

      if (!created.data) {
        await restore_series();
      }

      return created.data;
    } catch (error) {
      await restore_series();
      throw error;
    }
  }

  if (existing) {
    if (!update_from_organizer(message, existing, sender_email)) {
      return null;
    }
    const stale = (existing.sequence ?? 0) > message.sequence;
    const draft = stale
      ? {
          ...event_to_draft(existing),
          attendees: stale_attendees(existing, attendees, self_email, response),
        }
      : message_to_draft(message, existing.calendar_id, attendees, existing);
    const updated = await update_event(existing.id, draft);

    return updated.data;
  }

  if (await uid_held_by_other_organizer(message, sender_email)) {
    return null;
  }

  const calendar_id = await default_calendar_id();

  if (!calendar_id) {
    return null;
  }

  const created = await create_event(
    message_to_draft(
      message,
      calendar_id,
      attendees,
      null,
      sender_email !== undefined,
      self_email,
    ),
  );

  return created.data;
}

export async function apply_cancel(
  message: ItipMessage,
  snapshot: DecryptedCalendarEvent,
  sender_email: string | undefined,
): Promise<DecryptedCalendarEvent | null> {
  const existing = await current_event(snapshot);

  if (!existing) {
    return null;
  }

  if (!update_from_organizer(message, existing, sender_email)) {
    return null;
  }

  if (message.sequence < (existing.sequence ?? 0)) {
    return existing;
  }

  if (message.recurrence_id && !existing.recurrence_id && existing.recurrence) {
    const exception = with_exception(existing, message.recurrence_id);

    if (!exception) {
      return existing.recurrence_exceptions.includes(message.recurrence_id)
        ? existing
        : null;
    }

    const updated = await update_event(existing.id, exception);

    return updated.data;
  }

  const updated = await update_event(existing.id, {
    ...event_to_draft(existing),
    status: "cancelled",
  });

  return updated.data;
}

export function reply_from_sender(
  message: ItipMessage,
  existing: DecryptedCalendarEvent,
  sender_email: string | undefined,
): ItipMessage["attendees"][number] | null {
  if (!sender_email || message.attendees.length !== 1) {
    return null;
  }

  const [reply] = message.attendees;

  if (!same_address(reply.email, sender_email)) {
    return null;
  }

  const is_guest = existing.attendees.some(
    (attendee) =>
      !attendee.is_organizer && same_address(attendee.email, reply.email),
  );

  return is_guest ? reply : null;
}

export function reply_is_current(
  message: ItipMessage,
  existing: DecryptedCalendarEvent,
  reply_email: string,
  received_at: string | null,
): boolean {
  const received = received_at === null ? Number.NaN : Date.parse(received_at);

  if (
    !Number.isFinite(received) ||
    message.sequence < (existing.sequence ?? 0)
  ) {
    return false;
  }

  const attendee = existing.attendees.find(
    (candidate) =>
      !candidate.is_organizer && same_address(candidate.email, reply_email),
  );
  const last = attendee?.responded_at
    ? Date.parse(attendee.responded_at)
    : Number.NaN;

  return !Number.isFinite(last) || received > last;
}

export async function apply_reply(
  message: ItipMessage,
  snapshot: DecryptedCalendarEvent,
  sender_email: string | undefined,
  self_email: string,
  received_at: string | null,
): Promise<DecryptedCalendarEvent | null> {
  const existing = await current_event(snapshot);

  if (!existing) {
    return null;
  }

  const reply = reply_from_sender(message, existing, sender_email);

  if (
    !reply ||
    !received_at ||
    !is_event_organizer(existing, self_email) ||
    !reply_is_current(message, existing, reply.email, received_at)
  ) {
    return snapshot;
  }

  const responded_at = new Date(received_at).toISOString();
  const attendees = existing.attendees.map((attendee) =>
    !attendee.is_organizer && same_address(reply.email, attendee.email)
      ? { ...attendee, response: reply.response, responded_at }
      : attendee,
  );
  const updated = await update_event(existing.id, {
    ...event_to_draft(existing),
    attendees,
  });

  return updated.data;
}

export async function set_own_response(
  snapshot: DecryptedCalendarEvent,
  self_email: string,
  response: CalendarAttendeeResponse,
): Promise<DecryptedCalendarEvent | null> {
  const event = await current_event(snapshot);

  if (!event) {
    return null;
  }

  const has_self = event.attendees.some((attendee) =>
    same_address(attendee.email, self_email),
  );
  const attendees = has_self
    ? event.attendees.map((attendee) =>
        same_address(attendee.email, self_email)
          ? { ...attendee, response }
          : attendee,
      )
    : [
        ...event.attendees,
        {
          email: self_email,
          display_name: null,
          response,
          is_organizer: false,
        },
      ];
  const updated = await update_event(event.id, {
    ...event_to_draft(event),
    attendees,
  });

  return updated.data;
}

export async function remove_event(event_id: string): Promise<boolean> {
  const result = await delete_event(event_id);

  return result.success;
}
