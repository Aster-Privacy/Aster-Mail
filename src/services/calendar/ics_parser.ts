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
export type InviteMethod = "request" | "reply" | "cancel" | "publish" | "unknown";

export interface ParsedInvite {
  method: InviteMethod;
  uid: string;
  sequence: number;
  summary: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  organizer_email: string;
  organizer_name: string;
  attendee_emails: string[];
}

interface RawLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

const VCALENDAR_PATTERN = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i;
const VEVENT_PATTERN = /BEGIN:VEVENT[\s\S]*?END:VEVENT/i;

function strip_html(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function unfold_ics(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescape_text(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parse_line(line: string): RawLine | null {
  const colon_index = line.indexOf(":");
  if (colon_index === -1) {
    return null;
  }

  const left = line.slice(0, colon_index);
  const value = line.slice(colon_index + 1);
  const segments = left.split(";");
  const name = segments[0].toUpperCase();
  const params: Record<string, string> = {};

  for (let index = 1; index < segments.length; index += 1) {
    const equals_index = segments[index].indexOf("=");
    if (equals_index === -1) {
      continue;
    }
    const key = segments[index].slice(0, equals_index).toUpperCase();
    const param_value = segments[index].slice(equals_index + 1).replace(/^"|"$/g, "");
    params[key] = param_value;
  }

  return { name, params, value: value.trim() };
}

function ics_datetime_to_date(
  raw: string,
): { date: Date; is_date: boolean } | null {
  const match = raw
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (match[4] === undefined) {
    return { date: new Date(year, month, day), is_date: true };
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (match[7]) {
    return {
      date: new Date(Date.UTC(year, month, day, hour, minute, second)),
      is_date: false,
    };
  }

  return { date: new Date(year, month, day, hour, minute, second), is_date: false };
}

function parse_mailto(value: string): string {
  return value.replace(/^mailto:/i, "").trim().toLowerCase();
}

function extract_vcalendar(...sources: (string | undefined)[]): string | null {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    const direct = source.match(VCALENDAR_PATTERN);
    if (direct) {
      return direct[0];
    }
    const stripped = strip_html(source).match(VCALENDAR_PATTERN);
    if (stripped) {
      return stripped[0];
    }
  }
  return null;
}

export function parse_invite_from_ics(ics: string): ParsedInvite | null {
  const event_match = ics.match(VEVENT_PATTERN);
  if (!event_match) {
    return null;
  }

  const method_line = unfold_ics(ics)
    .split(/\r?\n/)
    .map(parse_line)
    .find((line) => line && line.name === "METHOD");

  const method_value = method_line ? method_line.value.toLowerCase() : "";
  const method: InviteMethod =
    method_value === "request" ||
    method_value === "reply" ||
    method_value === "cancel" ||
    method_value === "publish"
      ? (method_value as InviteMethod)
      : "unknown";

  const lines = unfold_ics(event_match[0])
    .split(/\r?\n/)
    .map(parse_line)
    .filter((line): line is RawLine => line !== null);

  let uid = "";
  let sequence = 0;
  let summary = "";
  let description = "";
  let location = "";
  let organizer_email = "";
  let organizer_name = "";
  let start: { date: Date; is_date: boolean } | null = null;
  let end: { date: Date; is_date: boolean } | null = null;
  const attendee_emails: string[] = [];

  for (const line of lines) {
    switch (line.name) {
      case "UID":
        uid = line.value;
        break;
      case "SEQUENCE":
        sequence = Number(line.value) || 0;
        break;
      case "SUMMARY":
        summary = unescape_text(line.value);
        break;
      case "DESCRIPTION":
        description = unescape_text(line.value);
        break;
      case "LOCATION":
        location = unescape_text(line.value);
        break;
      case "DTSTART":
        start = ics_datetime_to_date(line.value);
        break;
      case "DTEND":
        end = ics_datetime_to_date(line.value);
        break;
      case "ORGANIZER":
        organizer_email = parse_mailto(line.value);
        organizer_name = line.params.CN || "";
        break;
      case "ATTENDEE": {
        const email = parse_mailto(line.value);
        if (email) {
          attendee_emails.push(email);
        }
        break;
      }
      default:
        break;
    }
  }

  if (!start || !summary) {
    return null;
  }

  const is_all_day = start.is_date;
  const starts_at = start.date.toISOString();
  let ends_at: string;

  if (end) {
    ends_at = end.date.toISOString();
  } else if (is_all_day) {
    const next_day = new Date(start.date);
    next_day.setDate(next_day.getDate() + 1);
    ends_at = next_day.toISOString();
  } else {
    ends_at = new Date(start.date.getTime() + 60 * 60 * 1000).toISOString();
  }

  return {
    method,
    uid,
    sequence,
    summary,
    description,
    location,
    starts_at,
    ends_at,
    is_all_day,
    organizer_email,
    organizer_name,
    attendee_emails,
  };
}

export function find_invite_in_email(
  body: string | undefined,
  html: string | undefined,
): ParsedInvite | null {
  const ics = extract_vcalendar(body, html);
  if (!ics) {
    return null;
  }
  return parse_invite_from_ics(ics);
}
