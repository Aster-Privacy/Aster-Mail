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
  CalendarEventAvailability,
  CalendarEventStatus,
  CalendarEventVisibility,
  DecryptedCalendarEvent,
  RecurrenceRule,
} from "@/types/calendar";

import {
  MAX_OCCURRENCE_SPAN_MS,
  is_valid_time_zone,
  rrule_to_rule,
  rule_to_rrule,
  wall_clock_of,
  zoned_wall_to_utc,
} from "@/services/calendar/recurrence";
import { safe_http_url } from "@/services/calendar/safe_url";
import { windows_zone_to_iana } from "@/services/calendar/windows_zones";
import { find_ics_blocks } from "@/services/calendar/ics_blocks";
import {
  sanitize_calendar_email,
  sanitize_calendar_text,
} from "@/services/calendar/sanitize";

export interface ImportedIcsEvent {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  status: CalendarEventStatus;
  attendees: CalendarAttendee[];
  recurrence: RecurrenceRule | null;
  recurrence_exceptions: string[];
  availability: CalendarEventAvailability;
  visibility: CalendarEventVisibility;
  conference_url: string;
  reminder_minutes: number | null;
  uid: string | null;
  recurrence_id: string | null;
  dropped_time_zones?: string[];
}

interface ParsedBlock {
  event: ImportedIcsEvent;
}

export interface IcsEventSource {
  event: ImportedIcsEvent;
  block: string;
}

const MAX_IMPORT_EVENTS = 2000;
const MAX_IMPORT_TEXT_BYTES = 20 * 1024 * 1024;
const MAX_ATTENDEES = 200;
const MAX_EXCEPTIONS = 500;
const MAX_EXTRA_DATES = 500;
const MAX_UID_LENGTH = 255;
const MIN_IMPORT_YEAR = 1900;
const MAX_IMPORT_YEAR = 2200;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const MAX_REMINDER_MINUTES = 40320;

const DURATION_PATTERN =
  /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export const RESPONSE_BY_PARTSTAT: Record<string, CalendarAttendeeResponse> = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  "NEEDS-ACTION": "needs_action",
};

export function response_from_partstat(
  value: string | undefined,
): CalendarAttendeeResponse {
  const key = (value ?? "").trim().toUpperCase();

  return Object.prototype.hasOwnProperty.call(RESPONSE_BY_PARTSTAT, key)
    ? RESPONSE_BY_PARTSTAT[key]
    : "needs_action";
}

export const PARTSTAT_BY_RESPONSE: Record<CalendarAttendeeResponse, string> = {
  accepted: "ACCEPTED",
  declined: "DECLINED",
  tentative: "TENTATIVE",
  needs_action: "NEEDS-ACTION",
};

export function escape_text(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function unescape_text(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, escaped: string) =>
    escaped === "n" || escaped === "N" ? "\n" : escaped,
  );
}

export function quote_param_value(value: string): string {
  const cleaned = value.replace(/["\r\n]/g, "");

  return /[;,:]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

export function mailto_value(email: string): string {
  return `mailto:${email.replace(/[\s\u0000-\u001f\u007f]/g, "")}`;
}

export function index_outside_quotes(
  text: string,
  target: string,
  from = 0,
): number {
  let quoted = false;

  for (let index = from; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      quoted = !quoted;
    } else if (char === target && !quoted) {
      return index;
    }
  }

  return -1;
}

export function split_outside_quotes(
  text: string,
  separator: string,
): string[] {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor <= text.length) {
    const next = index_outside_quotes(text, separator, cursor);

    if (next === -1) {
      parts.push(text.slice(cursor));
      break;
    }

    parts.push(text.slice(cursor, next));
    cursor = next + 1;
  }

  return parts;
}

export interface PropertyLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

export function split_property_line(line: string): PropertyLine | null {
  const colon = index_outside_quotes(line, ":");

  if (colon === -1) {
    return null;
  }

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semicolon = index_outside_quotes(head, ";");
  const name = (semicolon === -1 ? head : head.slice(0, semicolon))
    .trim()
    .toUpperCase();
  const params =
    semicolon === -1 ? {} : parse_params(head.slice(semicolon + 1));

  return { name, params, value };
}

const UTF8_ENCODER = new TextEncoder();
const MAX_LINE_OCTETS = 75;

function utf8_octets(text: string): number {
  return UTF8_ENCODER.encode(text).length;
}

export function fold_line(line: string): string {
  if (utf8_octets(line) <= MAX_LINE_OCTETS) {
    return line;
  }

  const parts: string[] = [];
  let current = "";
  let current_octets = 0;

  for (const char of line) {
    const octets = utf8_octets(char);

    if (current_octets + octets > MAX_LINE_OCTETS) {
      parts.push(current);
      current = ` ${char}`;
      current_octets = 1 + octets;
    } else {
      current += char;
      current_octets += octets;
    }
  }

  parts.push(current);

  return parts.join("\r\n");
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function to_utc_stamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`
  );
}

function to_date_stamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

function to_zoned_stamp(iso: string, time_zone: string): string {
  const instant_ms = new Date(iso).getTime();

  if (Number.isNaN(instant_ms)) {
    return "";
  }

  const wall = wall_clock_of(instant_ms, time_zone);

  return (
    `${wall.year}${pad(wall.month, 2)}${pad(wall.day, 2)}` +
    `T${pad(wall.hour, 2)}${pad(wall.minute, 2)}${pad(wall.second, 2)}`
  );
}

export function stamp_property(
  name: string,
  iso: string,
  is_all_day: boolean,
  time_zone: string | null,
): string | null {
  const value = is_all_day
    ? to_date_stamp(iso)
    : time_zone
      ? to_zoned_stamp(iso, time_zone)
      : to_utc_stamp(iso);

  if (value.length === 0) {
    return null;
  }

  if (is_all_day) {
    return `${name};VALUE=DATE:${value}`;
  }

  return time_zone ? `${name};TZID=${time_zone}:${value}` : `${name}:${value}`;
}

function stamp_list_property(
  name: string,
  values: string[],
  is_all_day: boolean,
  time_zone: string | null,
): string | null {
  const stamps = values
    .map((value) =>
      is_all_day
        ? to_date_stamp(value)
        : time_zone
          ? to_zoned_stamp(value, time_zone)
          : to_utc_stamp(value),
    )
    .filter((value) => value.length > 0);

  if (stamps.length === 0) {
    return null;
  }

  if (is_all_day) {
    return `${name};VALUE=DATE:${stamps.join(",")}`;
  }

  return time_zone
    ? `${name};TZID=${time_zone}:${stamps.join(",")}`
    : `${name}:${stamps.join(",")}`;
}

function to_exclusive_date_stamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setDate(date.getDate() + 1);

  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

function all_day_inclusive_end(exclusive_end: Date): Date {
  const last_moment = new Date(exclusive_end.getTime() - 1);

  last_moment.setHours(23, 59, 59, 999);

  return last_moment;
}

export function export_uid(event: DecryptedCalendarEvent): string {
  const stored = typeof event.uid === "string" ? event.uid.trim() : "";

  if (stored.length > 0 && !/[\r\n;]/.test(stored)) {
    return stored;
  }

  return `${sanitize_uid(event.recurrence_master_id ?? event.id)}@aster.calendar`;
}

function sanitize_uid(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, "");

  return cleaned.length > 0 ? cleaned : "event";
}

function reminder_trigger(raw_minutes: number): string {
  const minutes = Number.isFinite(raw_minutes)
    ? Math.min(Math.max(Math.trunc(raw_minutes), 0), MAX_REMINDER_MINUTES)
    : 0;

  if (minutes <= 0) {
    return "PT0S";
  }

  if (minutes % 1440 === 0) {
    return `-P${minutes / 1440}D`;
  }

  if (minutes % 60 === 0) {
    return `-PT${minutes / 60}H`;
  }

  return `-PT${minutes}M`;
}

function parse_duration(value: string): number | null {
  const match = DURATION_PATTERN.exec(value.trim().toUpperCase());

  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const weeks = Number(match[2] ?? 0);
  const days = Number(match[3] ?? 0);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);
  const total =
    ((weeks * 7 + days) * 24 * 60 * 60 +
      hours * 60 * 60 +
      minutes * 60 +
      seconds) *
    1000;

  if (total > MAX_OCCURRENCE_SPAN_MS) {
    return null;
  }

  return sign * total;
}

export interface VeventExtras {
  organizer?: CalendarAttendee | null;
  attendees?: CalendarAttendee[];
  sequence?: number;
  status?: CalendarEventStatus;
  rsvp?: boolean;
  include_alarm?: boolean;
}

const EXPORT_STATUS: Partial<Record<string, string>> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    tentative: "TENTATIVE",
    confirmed: "CONFIRMED",
    cancelled: "CANCELLED",
  },
);

const EXPORT_CLASS: Partial<Record<string, string>> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    public: "PUBLIC",
    private: "PRIVATE",
    confidential: "CONFIDENTIAL",
  },
);

function attendee_line(attendee: CalendarAttendee, rsvp: boolean): string {
  const partstat = Object.prototype.hasOwnProperty.call(
    PARTSTAT_BY_RESPONSE,
    attendee.response,
  )
    ? PARTSTAT_BY_RESPONSE[attendee.response]
    : PARTSTAT_BY_RESPONSE.needs_action;
  const name =
    attendee.display_name && attendee.display_name.length > 0
      ? `;CN=${quote_param_value(attendee.display_name)}`
      : "";
  const role = attendee.is_organizer ? ";ROLE=CHAIR" : "";
  const rsvp_param = rsvp ? ";RSVP=TRUE" : "";

  return `ATTENDEE${name};PARTSTAT=${partstat}${role}${rsvp_param}:${mailto_value(attendee.email)}`;
}

export function build_vevent_lines(
  event: DecryptedCalendarEvent,
  stamp: string,
  extras: VeventExtras = {},
): string[] | null {
  const is_detached =
    typeof event.recurrence_id === "string" && event.recurrence_id.length > 0;
  const time_zone =
    event.recurrence && is_valid_time_zone(event.recurrence.time_zone)
      ? event.recurrence.time_zone
      : null;
  const start = stamp_property(
    "DTSTART",
    event.starts_at,
    event.is_all_day,
    time_zone,
  );
  const end = event.is_all_day
    ? (() => {
        const value = to_exclusive_date_stamp(event.ends_at);

        return value.length > 0 ? `DTEND;VALUE=DATE:${value}` : null;
      })()
    : stamp_property("DTEND", event.ends_at, false, time_zone);

  if (start === null || end === null) {
    return null;
  }

  const lines: string[] = ["BEGIN:VEVENT"];

  lines.push(`UID:${export_uid(event)}`);
  lines.push(`DTSTAMP:${stamp}`);

  if (typeof extras.sequence === "number" && extras.sequence >= 0) {
    lines.push(`SEQUENCE:${Math.floor(extras.sequence)}`);
  }

  lines.push(start);
  lines.push(end);

  if (is_detached) {
    const recurrence_id = stamp_property(
      "RECURRENCE-ID",
      event.recurrence_id as string,
      event.is_all_day,
      null,
    );

    if (recurrence_id !== null) {
      lines.push(recurrence_id);
    }
  }

  if (event.recurrence && !is_detached) {
    lines.push(
      `RRULE:${rule_to_rrule(event.recurrence, { all_day: event.is_all_day })}`,
    );

    const exdate = stamp_list_property(
      "EXDATE",
      event.recurrence_exceptions,
      event.is_all_day,
      time_zone,
    );

    if (exdate !== null) {
      lines.push(exdate);
    }

    const rdate = stamp_list_property(
      "RDATE",
      event.recurrence.extra_dates ?? [],
      event.is_all_day,
      time_zone,
    );

    if (rdate !== null) {
      lines.push(rdate);
    }
  }

  lines.push(`SUMMARY:${escape_text(event.title)}`);

  if (event.description.length > 0) {
    lines.push(`DESCRIPTION:${escape_text(event.description)}`);
  }

  if (event.location.length > 0) {
    lines.push(`LOCATION:${escape_text(event.location)}`);
  }

  const status = EXPORT_STATUS[extras.status ?? event.status];

  if (status) {
    lines.push(`STATUS:${status}`);
  }
  lines.push(
    `TRANSP:${event.availability === "free" ? "TRANSPARENT" : "OPAQUE"}`,
  );

  const visibility_class = EXPORT_CLASS[event.visibility];

  if (visibility_class) {
    lines.push(`CLASS:${visibility_class}`);
  }

  if (event.conference_url.length > 0) {
    lines.push(`URL:${escape_text(event.conference_url)}`);
  }

  if (extras.include_alarm !== false && event.reminder_minutes !== null) {
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escape_text(event.title)}`);
    lines.push(`TRIGGER:${reminder_trigger(event.reminder_minutes)}`);
    lines.push("END:VALARM");
  }

  if (extras.organizer) {
    const name =
      extras.organizer.display_name && extras.organizer.display_name.length > 0
        ? `;CN=${quote_param_value(extras.organizer.display_name)}`
        : "";

    lines.push(`ORGANIZER${name}:${mailto_value(extras.organizer.email)}`);
  }

  for (const attendee of extras.attendees ?? event.attendees) {
    lines.push(attendee_line(attendee, extras.rsvp === true));
  }

  lines.push("END:VEVENT");

  return lines;
}

export function build_ics(
  events: DecryptedCalendarEvent[],
  generated_at: string,
): string {
  const stamp = to_utc_stamp(generated_at);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aster//Aster Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const emitted_masters = new Set<string>();

  for (const event of events) {
    const is_detached =
      typeof event.recurrence_id === "string" && event.recurrence_id.length > 0;

    if (event.recurrence_master_id !== null && !is_detached) {
      if (emitted_masters.has(event.recurrence_master_id)) {
        continue;
      }

      emitted_masters.add(event.recurrence_master_id);
    }

    const vevent = build_vevent_lines(event, stamp);

    if (vevent !== null) {
      lines.push(...vevent);
    }
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(fold_line).join("\r\n")}\r\n`;
}

function clamp_text(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

export function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

export function parse_params(raw: string): Record<string, string> {
  const params: Record<string, string> = {};

  for (const chunk of split_outside_quotes(raw, ";")) {
    const equals = chunk.indexOf("=");

    if (equals === -1) {
      continue;
    }

    params[chunk.slice(0, equals).trim().toUpperCase()] = chunk
      .slice(equals + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }

  return params;
}

function is_supported_year(year: number): boolean {
  return year >= MIN_IMPORT_YEAR && year <= MAX_IMPORT_YEAR;
}

const MAX_DROPPED_ZONE_LENGTH = 64;

export function resolve_tzid(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim().replace(/^"(.*)"$/, "$1").trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (is_valid_time_zone(trimmed)) {
    return trimmed;
  }

  return windows_zone_to_iana(trimmed) ?? undefined;
}

function parse_stamp(value: string, time_zone?: string): Date | null {
  const trimmed = value.trim();
  const date_only = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);

  if (date_only) {
    if (!is_supported_year(Number(date_only[1]))) {
      return null;
    }

    return new Date(
      Number(date_only[1]),
      Number(date_only[2]) - 1,
      Number(date_only[3]),
      0,
      0,
      0,
      0,
    );
  }

  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(
    trimmed,
  );

  if (!full) {
    return null;
  }

  const [, year, month, day, hour, minute, second, zulu] = full;

  if (!is_supported_year(Number(year))) {
    return null;
  }

  if (zulu === "Z") {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
  }

  if (time_zone && time_zone.length > 0) {
    const zoned = zoned_wall_to_utc(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      time_zone,
    );

    if (zoned) {
      return zoned;
    }
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function parse_status(value: string): CalendarEventStatus {
  const upper = value.trim().toUpperCase();

  if (upper === "TENTATIVE") {
    return "tentative";
  }

  if (upper === "CANCELLED") {
    return "cancelled";
  }

  return "confirmed";
}

function parse_mailto(value: string): string {
  return sanitize_calendar_email(value);
}

function parse_block(block: string): ParsedBlock | null {
  let title = "";
  let description = "";
  let location = "";
  let status: CalendarEventStatus = "confirmed";
  let starts: Date | null = null;
  let ends: Date | null = null;
  let is_all_day = false;
  let recurrence: RecurrenceRule | null = null;
  let availability: CalendarEventAvailability = "busy";
  let visibility: CalendarEventVisibility = "default";
  let conference_url = "";
  let reminder_minutes: number | null = null;
  let in_alarm = false;
  let uid: string | null = null;
  let recurrence_id: Date | null = null;
  let start_time_zone: string | null = null;
  let duration_ms: number | null = null;
  const exception_dates: string[] = [];
  const extra_dates: string[] = [];
  const attendees: CalendarAttendee[] = [];
  const seen = new Set<string>();
  const dropped_zones = new Set<string>();
  const zone_of = (
    raw: string | undefined,
    stamp_value: string,
  ): string | undefined => {
    const resolved = resolve_tzid(raw);
    const trimmed = (raw ?? "").trim();

    if (
      resolved === undefined &&
      trimmed.length > 0 &&
      /T\d{6}$/i.test(stamp_value.trim())
    ) {
      dropped_zones.add(
        sanitize_calendar_text(trimmed, "title").slice(
          0,
          MAX_DROPPED_ZONE_LENGTH,
        ),
      );
    }

    return resolved;
  };

  for (const line of block.split(/\r?\n/)) {
    const property = split_property_line(line);

    if (!property) {
      continue;
    }

    const { name, params, value } = property;
    const block_name = value.trim().toUpperCase();

    if (name === "BEGIN" && block_name === "VALARM") {
      in_alarm = true;
      continue;
    }

    if (name === "END" && block_name === "VALARM") {
      in_alarm = false;
      continue;
    }

    if (in_alarm) {
      if (
        name === "TRIGGER" &&
        reminder_minutes === null &&
        params.VALUE !== "DATE-TIME"
      ) {
        const offset = parse_duration(value);

        if (offset !== null && offset <= 0) {
          reminder_minutes = Math.min(
            Math.round(-offset / 60000),
            MAX_REMINDER_MINUTES,
          );
        }
      }

      continue;
    }

    if (name === "UID") {
      const cleaned = unescape_text(value).trim();

      uid = cleaned.length > 0 ? clamp_text(cleaned, MAX_UID_LENGTH) : null;
    } else if (name === "SUMMARY") {
      title = sanitize_calendar_text(unescape_text(value), "title");
    } else if (name === "DESCRIPTION") {
      description = sanitize_calendar_text(unescape_text(value), "description");
    } else if (name === "LOCATION") {
      location = sanitize_calendar_text(unescape_text(value), "location");
    } else if (name === "STATUS") {
      status = parse_status(value);
    } else if (name === "TRANSP") {
      availability =
        value.trim().toUpperCase() === "TRANSPARENT" ? "free" : "busy";
    } else if (name === "CLASS") {
      const raw_class = value.trim().toUpperCase();

      visibility =
        raw_class === "PUBLIC"
          ? "public"
          : raw_class === "PRIVATE" || raw_class === "CONFIDENTIAL"
            ? "private"
            : "default";
    } else if (name === "URL") {
      conference_url = safe_http_url(unescape_text(value)) ?? "";
    } else if (name === "DTSTART") {
      const zone = zone_of(params.TZID, value);

      starts = parse_stamp(value, zone);

      if (params.VALUE === "DATE" || /^\d{8}$/.test(value.trim())) {
        is_all_day = true;
      }

      if (!value.trim().toUpperCase().endsWith("Z") && zone !== undefined) {
        start_time_zone = zone;
      }
    } else if (name === "DTEND") {
      ends = parse_stamp(value, zone_of(params.TZID, value));
    } else if (name === "DURATION") {
      duration_ms = parse_duration(value);
    } else if (name === "RECURRENCE-ID") {
      recurrence_id = parse_stamp(value, zone_of(params.TZID, value));
    } else if (name === "RRULE") {
      recurrence = rrule_to_rule(value);
    } else if (name === "EXDATE" || name === "RDATE") {
      const target = name === "EXDATE" ? exception_dates : extra_dates;
      const limit = name === "EXDATE" ? MAX_EXCEPTIONS : MAX_EXTRA_DATES;

      for (const entry of value.split(",")) {
        const stamp = entry.trim().split("/")[0];
        const parsed = parse_stamp(stamp, zone_of(params.TZID, stamp));

        if (
          parsed &&
          !Number.isNaN(parsed.getTime()) &&
          target.length < limit
        ) {
          target.push(parsed.toISOString());
        }
      }
    } else if (name === "ATTENDEE" || name === "ORGANIZER") {
      const email = parse_mailto(value);
      const key = email.toLowerCase();

      if (
        email.length > 0 &&
        !seen.has(key) &&
        attendees.length < MAX_ATTENDEES
      ) {
        seen.add(key);
        attendees.push({
          email,
          display_name:
            params.CN && params.CN.length > 0
              ? sanitize_calendar_text(unescape_text(params.CN), "display_name")
              : null,
          response: response_from_partstat(params.PARTSTAT),
          is_organizer: name === "ORGANIZER" || params.ROLE === "CHAIR",
        });
      }
    }
  }

  if (!starts || Number.isNaN(starts.getTime())) {
    return null;
  }

  const fallback_ms =
    duration_ms !== null && duration_ms > 0 ? duration_ms : DEFAULT_DURATION_MS;
  const resolved_end =
    ends && !Number.isNaN(ends.getTime())
      ? ends
      : new Date(starts.getTime() + fallback_ms);

  const base_end =
    resolved_end.getTime() <= starts.getTime()
      ? new Date(starts.getTime() + DEFAULT_DURATION_MS)
      : resolved_end.getTime() - starts.getTime() > MAX_OCCURRENCE_SPAN_MS
        ? new Date(starts.getTime() + MAX_OCCURRENCE_SPAN_MS)
        : resolved_end;

  const final_end = is_all_day ? all_day_inclusive_end(base_end) : base_end;

  if (recurrence) {
    recurrence = {
      ...recurrence,
      ...(extra_dates.length > 0 ? { extra_dates } : {}),
      ...(start_time_zone && !is_all_day ? { time_zone: start_time_zone } : {}),
    };
  }

  return {
    event: {
      title,
      description,
      location,
      starts_at: starts.toISOString(),
      ends_at: final_end.toISOString(),
      is_all_day,
      status,
      attendees,
      recurrence,
      recurrence_exceptions: exception_dates,
      availability,
      visibility,
      conference_url,
      reminder_minutes,
      uid,
      ...(dropped_zones.size > 0
        ? { dropped_time_zones: Array.from(dropped_zones) }
        : {}),
      recurrence_id:
        recurrence_id && !Number.isNaN(recurrence_id.getTime())
          ? recurrence_id.toISOString()
          : null,
    },
  };
}

export function parse_ics_event_sources(text: string): IcsEventSource[] {
  if (typeof text !== "string" || text.length > MAX_IMPORT_TEXT_BYTES) {
    return [];
  }

  const unfolded = unfold(text);
  const blocks = find_ics_blocks(unfolded, "VEVENT", MAX_IMPORT_EVENTS);

  if (blocks.length === 0) {
    return [];
  }

  const parsed: IcsEventSource[] = [];

  for (const block of blocks) {
    const entry = parse_block(block);

    if (entry) {
      parsed.push({ event: entry.event, block });
    }
  }

  const masters = new Map<string, ImportedIcsEvent>();
  const overrides = new Set<string>();
  const events: IcsEventSource[] = [];

  for (const source of parsed) {
    const { event } = source;

    if (event.uid === null) {
      if (event.recurrence_id === null) {
        events.push(source);
      }

      continue;
    }

    if (event.recurrence_id === null) {
      if (masters.has(event.uid)) {
        continue;
      }

      masters.set(event.uid, event);
      events.push(source);
    }
  }

  for (const source of parsed) {
    const { event } = source;

    if (event.uid === null || event.recurrence_id === null) {
      continue;
    }

    const key = `${event.uid}\u0000${event.recurrence_id}`;

    if (overrides.has(key)) {
      continue;
    }

    overrides.add(key);

    const master = masters.get(event.uid);

    if (
      master &&
      master.recurrence &&
      !master.recurrence_exceptions.includes(event.recurrence_id) &&
      master.recurrence_exceptions.length < MAX_EXCEPTIONS
    ) {
      master.recurrence_exceptions.push(event.recurrence_id);
    }

    events.push(source);
  }

  return events;
}

export function parse_ics_events(text: string): ImportedIcsEvent[] {
  return parse_ics_event_sources(text).map((source) => source.event);
}
