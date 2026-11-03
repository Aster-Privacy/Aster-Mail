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
import { safe_http_url } from "@/services/calendar/safe_url";

export const MAX_INVITE_SOURCE_CHARS = 2 * 1024 * 1024;

const VCALENDAR_PATTERN = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i;
const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function html_to_text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|pre|tr|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|#39);/g,
      (_, name: string) => ENTITIES[name] ?? "",
    );
}

export function has_calendar_text(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length <= MAX_INVITE_SOURCE_CHARS &&
    /BEGIN:VCALENDAR/i.test(value)
  );
}

export function find_calendar_text(
  body: string | undefined,
  html: string | undefined,
): string | null {
  if (has_calendar_text(body)) {
    const match = (body as string).match(VCALENDAR_PATTERN);

    if (match) {
      return match[0];
    }
  }

  if (has_calendar_text(html)) {
    const match = html_to_text(html as string).match(VCALENDAR_PATTERN);

    if (match) {
      return match[0];
    }
  }

  return null;
}

export function find_meeting_link(entry: {
  conference_url?: string | null;
  location?: string | null;
  description?: string | null;
}): string | null {
  const direct = safe_http_url(entry.conference_url);

  if (direct) {
    return direct;
  }

  for (const source of [entry.location, entry.description]) {
    if (typeof source !== "string" || source.length === 0) {
      continue;
    }

    for (const candidate of source.slice(0, 20_000).match(URL_PATTERN) ?? []) {
      const url = safe_http_url(candidate.replace(TRAILING_PUNCTUATION, ""));

      if (url) {
        return url;
      }
    }
  }

  return null;
}

export function link_host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export interface InviteAttachmentSource {
  id: string;
  attachments?: { filename: string; content_type: string }[];
}

export function invite_attachment_hints(
  messages: InviteAttachmentSource[],
  email_id: string | undefined,
): { name: string; mime_type: string }[] {
  if (!email_id) {
    return [];
  }

  const match = messages.find((message) => message.id === email_id);

  return (match?.attachments ?? []).map((attachment) => ({
    name: attachment.filename,
    mime_type: attachment.content_type,
  }));
}
