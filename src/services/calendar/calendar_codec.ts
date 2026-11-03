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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type {
  CalendarAttendee,
  CalendarAttendeeResponse,
  CalendarEventAvailability,
  CalendarEventDraft,
  CalendarEventKind,
  CalendarEventStatus,
  CalendarEventVisibility,
  CalendarTaskMeta,
  CalendarWorkingLocation,
  DecryptedCalendar,
  DecryptedCalendarEvent,
  RecurrenceRule,
} from "@/types/calendar";

import { normalize_recurrence } from "@/services/calendar/recurrence";
import { normalize_calendar_icon } from "@/types/calendar";
import type {
  CalendarBlobFormat,
  CalendarWriteKey,
  EncryptedRecord,
} from "@/services/calendar/calendar_crypto";

import {
  decrypt_calendar_payload,
  encrypt_calendar_payload,
} from "@/services/calendar/calendar_crypto";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  next_revision,
  read_revision,
} from "@/services/calendar/revision_ledger";

const MAX_ATTENDEES = 200;
const MAX_CONFERENCE_URL_LENGTH = 2048;
const ATTENDEE_RESPONSES = new Set<CalendarAttendeeResponse>([
  "accepted",
  "declined",
  "needs_action",
  "tentative",
]);
const EVENT_STATUSES = new Set<CalendarEventStatus>([
  "cancelled",
  "confirmed",
  "tentative",
]);

export interface CalendarBlob {
  name: string;
  color: string;
  icon?: string;
  rev_at?: number;
}

export interface EventBlob {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  status: DecryptedCalendarEvent["status"];
  attendees: DecryptedCalendarEvent["attendees"];
  tags?: string[];
  reminder_minutes: number | null;
  color?: string | null;
  availability?: CalendarEventAvailability;
  visibility?: CalendarEventVisibility;
  event_kind?: CalendarEventKind;
  is_completed?: boolean;
  working_location?: CalendarWorkingLocation | null;
  conference_url?: string;
  guests_can_modify?: boolean;
  guests_can_invite?: boolean;
  guests_can_see_guests?: boolean;
  recurrence?: RecurrenceRule | null;
  recurrence_exceptions?: string[];
  uid?: string | null;
  recurrence_id?: string | null;
  sequence?: number;
  organizer_email?: string | null;
  trashed_at?: string | null;
  task_meta?: CalendarTaskMeta | null;
  rev_at?: number;
}

export interface EncryptedBlob {
  encrypted_blob: string;
  blob_nonce: string;
}

export interface EventRowLike extends EncryptedBlob {
  id: string;
  calendar_id: string;
  created_at?: string;
  updated_at: string;
}

export interface CalendarRowLike extends EncryptedBlob {
  id: string;
  is_visible: boolean;
  is_default: boolean;
}

export interface EncryptedBlobWithFormat extends EncryptedBlob {
  format: CalendarBlobFormat;
}

export interface DecodedEventRow {
  event: DecryptedCalendarEvent;
  format: CalendarBlobFormat;
  bound: boolean;
  current: boolean;
  revision: number;
}

export interface DecodedCalendarRow {
  calendar: DecryptedCalendar;
  format: CalendarBlobFormat;
  bound: boolean;
  current: boolean;
  revision: number;
}

export function normalize_trashed_at(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

export function normalize_task_meta(value: unknown): CalendarTaskMeta | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const bounded = (field: unknown, max: number): string | null =>
    typeof field === "string" && field.length > 0 && field.length <= max
      ? field
      : null;
  const key = bounded(source.key, 128);
  const list_id = bounded(source.list_id, 128);

  if (!key || !list_id) return null;

  return {
    key,
    list_id,
    parent_id: bounded(source.parent_id, 128),
    position:
      typeof source.position === "number" && Number.isFinite(source.position)
        ? source.position
        : 0,
    starred: source.starred === true,
    has_date: source.has_date !== false,
    completed_at: normalize_trashed_at(source.completed_at),
    source_ref: bounded(source.source_ref, 512),
  };
}

function to_encrypted_blob(record: EncryptedRecord): EncryptedBlobWithFormat {
  return {
    encrypted_blob: record.ciphertext,
    blob_nonce: record.nonce,
    format: record.format,
  };
}

export function require_vault(): EncryptedVault {
  const vault = get_vault_from_memory();

  if (!vault) {
    throw new Error("calendar vault unavailable");
  }

  return vault;
}

const DEFAULT_CALENDAR_COLOR = "#2563eb";

export function normalize_event_color(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function normalize_availability(
  value: unknown,
): CalendarEventAvailability {
  return value === "free" ? "free" : "busy";
}

export function normalize_visibility(value: unknown): CalendarEventVisibility {
  return value === "public" || value === "private" ? value : "default";
}

export function normalize_event_kind(value: unknown): CalendarEventKind {
  return value === "out_of_office" ||
    value === "focus_time" ||
    value === "task" ||
    value === "working_location"
    ? value
    : "default";
}

export function normalize_working_location(
  value: unknown,
): CalendarWorkingLocation | null {
  return value === "home" || value === "office" || value === "other"
    ? value
    : null;
}

const MAX_ICS_IDENTIFIER_LENGTH = 255;

export function normalize_ics_identifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[\r\n\u0000-\u001f]/g, "").trim();

  return cleaned.length > 0
    ? cleaned.slice(0, MAX_ICS_IDENTIFIER_LENGTH)
    : null;
}

export function normalize_conference_url(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return "";
  }

  return trimmed.slice(0, MAX_CONFERENCE_URL_LENGTH);
}

export function normalize_exceptions(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "string") {
      continue;
    }

    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    seen.add(parsed.toISOString());
  }

  return Array.from(seen).slice(0, 730);
}

export function normalize_tags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== "string") {
      continue;
    }

    const trimmed = raw.trim().slice(0, 32);

    if (trimmed.length === 0) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result.slice(0, 12);
}

function normalize_responded_at(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) {
    return null;
  }

  const time = Date.parse(value);

  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalize_attendees(
  attendees: CalendarAttendee[] | undefined,
): CalendarAttendee[] {
  if (!Array.isArray(attendees)) {
    return [];
  }

  const seen = new Set<string>();
  const result: CalendarAttendee[] = [];

  for (const raw of attendees) {
    if (!raw || typeof raw.email !== "string") {
      continue;
    }

    const email = raw.email.trim().slice(0, 254);

    if (email.length === 0) {
      continue;
    }

    const key = email.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const responded_at = normalize_responded_at(raw.responded_at);

    result.push({
      email,
      display_name:
        typeof raw.display_name === "string"
          ? raw.display_name.trim().slice(0, 128)
          : null,
      response: ATTENDEE_RESPONSES.has(raw.response)
        ? raw.response
        : "needs_action",
      is_organizer: raw.is_organizer === true,
      ...(responded_at ? { responded_at } : {}),
    });
  }

  return result.slice(0, MAX_ATTENDEES);
}

export function normalize_sequence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export function normalize_organizer_email(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().slice(0, 254);

  return trimmed.length > 0 ? trimmed : null;
}

export function draft_to_blob(draft: CalendarEventDraft): EventBlob {
  return {
    title: draft.title,
    description: draft.description,
    location: draft.location,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    is_all_day: draft.is_all_day,
    status: EVENT_STATUSES.has(draft.status) ? draft.status : "confirmed",
    attendees: normalize_attendees(draft.attendees),
    tags: normalize_tags(draft.tags),
    reminder_minutes: draft.reminder_minutes,
    color: normalize_event_color(draft.color),
    availability: normalize_availability(draft.availability),
    visibility: normalize_visibility(draft.visibility),
    event_kind: normalize_event_kind(draft.event_kind),
    is_completed: draft.is_completed === true,
    working_location: normalize_working_location(draft.working_location),
    conference_url: normalize_conference_url(draft.conference_url),
    guests_can_modify: draft.guests_can_modify === true,
    guests_can_invite: draft.guests_can_invite !== false,
    guests_can_see_guests: draft.guests_can_see_guests !== false,
    recurrence: normalize_recurrence(draft.recurrence),
    recurrence_exceptions: normalize_exceptions(draft.recurrence_exceptions),
    uid: normalize_ics_identifier(draft.uid),
    recurrence_id: normalize_ics_identifier(draft.recurrence_id),
    sequence: normalize_sequence(draft.sequence),
    organizer_email: normalize_organizer_email(draft.organizer_email),
    trashed_at: normalize_trashed_at(draft.trashed_at),
    task_meta: normalize_task_meta(draft.task_meta),
  };
}

function string_field(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function blob_to_event(
  blob: EventBlob,
  id: string,
  calendar_id: string,
  updated_at: string,
  created_at: string = updated_at,
): DecryptedCalendarEvent {
  return {
    title: string_field(blob.title),
    description: string_field(blob.description),
    location: string_field(blob.location),
    starts_at: blob.starts_at,
    ends_at: blob.ends_at,
    is_all_day: blob.is_all_day === true,
    status: EVENT_STATUSES.has(blob.status) ? blob.status : "confirmed",
    attendees: normalize_attendees(blob.attendees),
    reminder_minutes: blob.reminder_minutes,
    tags: normalize_tags(blob.tags),
    color: normalize_event_color(blob.color),
    availability: normalize_availability(blob.availability),
    visibility: normalize_visibility(blob.visibility),
    event_kind: normalize_event_kind(blob.event_kind),
    is_completed: blob.is_completed === true,
    working_location: normalize_working_location(blob.working_location),
    conference_url: normalize_conference_url(blob.conference_url),
    guests_can_modify: blob.guests_can_modify === true,
    guests_can_invite: blob.guests_can_invite !== false,
    guests_can_see_guests: blob.guests_can_see_guests !== false,
    recurrence: normalize_recurrence(blob.recurrence),
    recurrence_exceptions: normalize_exceptions(blob.recurrence_exceptions),
    recurrence_master_id: null,
    occurrence_start: null,
    uid: normalize_ics_identifier(blob.uid),
    recurrence_id: normalize_ics_identifier(blob.recurrence_id),
    sequence: normalize_sequence(blob.sequence),
    organizer_email: normalize_organizer_email(blob.organizer_email),
    trashed_at: normalize_trashed_at(blob.trashed_at),
    task_meta: normalize_task_meta(blob.task_meta),
    id,
    calendar_id,
    created_at,
    updated_at,
  };
}

export function event_to_draft(
  event: DecryptedCalendarEvent,
): CalendarEventDraft {
  return {
    calendar_id: event.calendar_id,
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    is_all_day: event.is_all_day,
    status: event.status,
    attendees: event.attendees,
    tags: event.tags,
    reminder_minutes: event.reminder_minutes,
    color: event.color,
    availability: event.availability,
    visibility: event.visibility,
    event_kind: event.event_kind,
    is_completed: event.is_completed,
    working_location: event.working_location,
    conference_url: event.conference_url,
    guests_can_modify: event.guests_can_modify,
    guests_can_invite: event.guests_can_invite,
    guests_can_see_guests: event.guests_can_see_guests,
    recurrence: event.recurrence,
    recurrence_exceptions: event.recurrence_exceptions,
    uid: event.uid ?? null,
    recurrence_id: event.recurrence_id ?? null,
    sequence: normalize_sequence(event.sequence),
    organizer_email: event.organizer_email ?? null,
    trashed_at: event.trashed_at ?? null,
    task_meta: event.task_meta ?? null,
  };
}

export async function encrypt_event_draft(
  draft: CalendarEventDraft,
  vault: EncryptedVault,
  event_id: string,
  key: CalendarWriteKey | null = null,
  revision?: number,
): Promise<EncryptedBlobWithFormat> {
  if (!event_id || !draft.calendar_id) {
    throw new Error("event binding requires ids");
  }

  const binding = { calendar_id: draft.calendar_id, event_id };
  const encrypted = await encrypt_calendar_payload(
    {
      ...draft_to_blob(draft),
      rev_at: revision ?? next_revision("event", event_id),
    },
    vault,
    binding,
    key,
  );

  return to_encrypted_blob(encrypted);
}

export async function encrypt_calendar_blob(
  blob: CalendarBlob,
  vault: EncryptedVault,
  calendar_id: string,
  key: CalendarWriteKey | null = null,
  revision?: number,
): Promise<EncryptedBlobWithFormat> {
  if (!calendar_id) {
    throw new Error("calendar binding requires an id");
  }

  const encrypted = await encrypt_calendar_payload(
    { ...blob, rev_at: revision ?? next_revision("calendar", calendar_id) },
    vault,
    { calendar_id },
    key,
  );

  return to_encrypted_blob(encrypted);
}

export async function decode_event_row(
  row: EventRowLike,
  vault: EncryptedVault = require_vault(),
  keys?: CryptoKey[],
): Promise<DecodedEventRow | null> {
  if (typeof row.id !== "string" || row.id.length === 0) return null;

  try {
    const record = await decrypt_calendar_payload<EventBlob>(
      { ciphertext: row.encrypted_blob, nonce: row.blob_nonce },
      vault,
      { calendar_id: row.calendar_id, event_id: row.id },
      keys,
    );

    if (
      !record.payload ||
      typeof record.payload.starts_at !== "string" ||
      typeof record.payload.ends_at !== "string"
    ) {
      return null;
    }

    return {
      event: blob_to_event(
        record.payload,
        row.id,
        row.calendar_id,
        row.updated_at,
        row.created_at ?? row.updated_at,
      ),
      format: record.format,
      bound: record.bound,
      current: record.current,
      revision: read_revision(record.payload.rev_at),
    };
  } catch {
    return null;
  }
}

export async function decrypt_event_row(
  row: EventRowLike,
  vault: EncryptedVault = require_vault(),
): Promise<DecryptedCalendarEvent | null> {
  const decoded = await decode_event_row(row, vault);

  return decoded?.event ?? null;
}

export async function decode_calendar_row(
  row: CalendarRowLike,
  vault: EncryptedVault = require_vault(),
  keys?: CryptoKey[],
): Promise<DecodedCalendarRow | null> {
  try {
    const record = await decrypt_calendar_payload<CalendarBlob>(
      { ciphertext: row.encrypted_blob, nonce: row.blob_nonce },
      vault,
      { calendar_id: row.id },
      keys,
    );

    if (!record.payload || typeof record.payload.name !== "string") {
      return null;
    }

    return {
      calendar: {
        id: row.id,
        name: record.payload.name,
        color:
          normalize_event_color(record.payload.color) ?? DEFAULT_CALENDAR_COLOR,
        icon: normalize_calendar_icon(record.payload.icon),
        is_visible: row.is_visible,
        is_default: row.is_default,
      },
      format: record.format,
      bound: record.bound,
      current: record.current,
      revision: read_revision(record.payload.rev_at),
    };
  } catch {
    return null;
  }
}

export async function decrypt_calendar_row(
  row: CalendarRowLike,
  vault: EncryptedVault = require_vault(),
): Promise<DecryptedCalendar | null> {
  const decoded = await decode_calendar_row(row, vault);

  return decoded?.calendar ?? null;
}
