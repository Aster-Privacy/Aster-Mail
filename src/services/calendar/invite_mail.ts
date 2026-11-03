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
import type { Attachment } from "@/components/compose/compose_shared_core";
import type { TranslationKey } from "@/lib/i18n/types";
import { queue_email } from "@/services/send_queue";
import type {
  CalendarAttendee,
  CalendarAttendeeResponse,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import { app_hour12, get_display_time_zone } from "@/utils/date_format";
import {
  ITIP_ATTACHMENT_NAME,
  build_itip_cancel,
  build_itip_reply,
  build_itip_request,
  itip_mime_type,
  type ItipMethod,
  type ItipParty,
} from "./itip";

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface InviteSender {
  email: string;
  address_hash?: string;
}

export interface InviteSendResult {
  sent: number;
  failed: number;
}

export interface SendInvitationsOptions {
  event: DecryptedCalendarEvent;
  guests: CalendarAttendee[];
  method: Extract<ItipMethod, "REQUEST" | "CANCEL">;
  organizer: ItipParty;
  sender?: InviteSender | null;
  sequence: number;
  is_update?: boolean;
  t: Translate;
  language: string;
}

export interface SendReplyOptions {
  event: DecryptedCalendarEvent;
  organizer: ItipParty;
  attendee: ItipParty;
  sender?: InviteSender | null;
  response: CalendarAttendeeResponse;
  t: Translate;
  language: string;
}

const RESPONSE_KEYS: Record<CalendarAttendeeResponse, TranslationKey> = {
  accepted: "calendar.attendee_accepted",
  tentative: "calendar.attendee_tentative",
  declined: "calendar.attendee_declined",
  needs_action: "calendar.attendee_pending",
};

function safe_locale(language: string): string | undefined {
  try {
    new Intl.DateTimeFormat(language);

    return language;
  } catch {
    return undefined;
  }
}

type RangeFormatter = Intl.DateTimeFormat & {
  formatRange?: (start: Date, end: Date) => string;
};

function format_range(
  formatter: Intl.DateTimeFormat,
  start: Date,
  end: Date,
): string {
  const range_formatter = formatter as RangeFormatter;

  if (typeof range_formatter.formatRange === "function") {
    return range_formatter.formatRange(start, end);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function format_invite_range(
  event: Pick<DecryptedCalendarEvent, "starts_at" | "ends_at" | "is_all_day">,
  language: string,
): string {
  const locale = safe_locale(language);
  const time_zone = get_display_time_zone();
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);

  if (event.is_all_day) {
    const inclusive_end = new Date(end.getTime() - 1);
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return inclusive_end.getTime() > start.getTime() &&
      formatter.format(inclusive_end) !== formatter.format(start)
      ? format_range(formatter, start, inclusive_end)
      : formatter.format(start);
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: app_hour12(),
    timeZone: time_zone,
    timeZoneName: "short",
  });

  return format_range(formatter, start, end);
}

export function party_label(party: ItipParty): string {
  const name = party.display_name?.trim();

  return name && name.length > 0 ? `${name} <${party.email}>` : party.email;
}

export function response_label(
  response: CalendarAttendeeResponse,
  t: Translate,
): string {
  return t(RESPONSE_KEYS[response]);
}

function ics_attachment(ics: string, method: ItipMethod): Attachment {
  const bytes = new TextEncoder().encode(ics);

  return {
    id: crypto.randomUUID(),
    name: ITIP_ATTACHMENT_NAME,
    size: `${bytes.byteLength} B`,
    size_bytes: bytes.byteLength,
    mime_type: itip_mime_type(method),
    data: bytes.buffer.slice(0),
  };
}

function send_one(
  to: string,
  subject: string,
  body: string,
  attachment: Attachment,
  sender_display_name?: string,
  sender?: InviteSender | null,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = queue_email(
      {
        to: [to],
        subject,
        body,
        is_plain_text: true,
        attachments: [attachment],
        sender_display_name,
        sender_email: sender?.email,
        sender_alias_hash: sender?.address_hash,
        on_complete: () => resolve(true),
        on_cancel: () => resolve(false),
        on_error: () => resolve(false),
      },
      0,
    );

    if (!id) {
      resolve(false);
    }
  });
}

function request_body(options: SendInvitationsOptions): string {
  const { event, organizer, t, language } = options;
  const title = event.title.trim() || t("calendar.untitled_event");
  const intro_key: TranslationKey =
    options.method === "CANCEL"
      ? "calendar.invite_body_canceled"
      : options.is_update
        ? "calendar.invite_body_updated"
        : "calendar.invite_body_intro";
  const lines = [
    t(intro_key, { organizer: party_label(organizer), title }),
    "",
    t("calendar.invite_body_when", {
      when: format_invite_range(event, language),
    }),
  ];

  if (event.location.trim().length > 0) {
    lines.push(t("calendar.invite_body_where", { where: event.location }));
  }

  lines.push(
    t("calendar.invite_body_organizer", { organizer: party_label(organizer) }),
  );

  if (event.description.trim().length > 0) {
    lines.push("", event.description.trim());
  }

  lines.push("", t("calendar.invite_body_footer"));

  return lines.join("\n");
}

export async function send_invitations(
  options: SendInvitationsOptions,
): Promise<InviteSendResult> {
  const { event, guests, method, organizer, sequence, t, language } = options;
  const generated_at = new Date().toISOString();
  const title = event.title.trim() || t("calendar.untitled_event");
  const range = format_invite_range(event, language);
  const subject_key: TranslationKey =
    method === "CANCEL"
      ? "calendar.invite_canceled_subject"
      : options.is_update
        ? "calendar.invite_updated_subject"
        : "calendar.invite_subject";
  const subject = t(subject_key, { title, range });
  const body = request_body(options);
  const result: InviteSendResult = { sent: 0, failed: 0 };

  for (const guest of guests) {
    const guest_key = guest.email.trim().toLowerCase();
    const itip_options = {
      organizer,
      sequence,
      generated_at,
      attendees: event.guests_can_see_guests
        ? undefined
        : event.attendees.filter(
            (attendee) => attendee.email.trim().toLowerCase() === guest_key,
          ),
    };
    const ics =
      method === "CANCEL"
        ? build_itip_cancel(event, itip_options)
        : build_itip_request(event, itip_options);

    if (!ics) {
      result.failed += 1;
      continue;
    }

    const ok = await send_one(
      guest.email,
      subject,
      body,
      ics_attachment(ics, method),
      organizer.display_name ?? undefined,
      options.sender,
    );

    if (ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

export async function send_reply(options: SendReplyOptions): Promise<boolean> {
  const { event, organizer, attendee, response, t, language } = options;
  const ics = build_itip_reply(event, {
    organizer,
    attendee,
    response,
    sequence: event.sequence ?? 0,
    generated_at: new Date().toISOString(),
  });

  if (!ics) {
    return false;
  }

  const title = event.title.trim() || t("calendar.untitled_event");
  const range = format_invite_range(event, language);
  const label = response_label(response, t);
  const body = [
    t("calendar.invite_body_reply", {
      name: party_label(attendee),
      response: label,
      title,
    }),
    "",
    t("calendar.invite_body_when", { when: range }),
  ].join("\n");

  return send_one(
    organizer.email,
    t("calendar.invite_reply_subject", { response: label, title, range }),
    body,
    ics_attachment(ics, "REPLY"),
    attendee.display_name ?? undefined,
    options.sender,
  );
}
