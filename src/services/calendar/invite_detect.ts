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
import { char_set_predicate, trim_end_while } from "@/lib/linear_trim";

export const MAX_INVITE_SOURCE_CHARS = 2 * 1024 * 1024;

const VCALENDAR_BEGIN = /BEGIN:VCALENDAR/i;
const VCALENDAR_END = /END:VCALENDAR/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/gi;
const is_trailing_punctuation = char_set_predicate(".,;:!?");

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function strip_tags(value: string): string {
  let text = "";
  let position = 0;

  for (;;) {
    const open = value.indexOf("<", position);

    if (open === -1) break;

    const close = value.indexOf(">", open + 1);

    if (close === -1) break;

    text += value.slice(position, open);
    position = close + 1;
  }

  return text + value.slice(position);
}

export function extract_vcalendar(value: string): string | null {
  const begin = VCALENDAR_BEGIN.exec(value);

  if (!begin) return null;

  VCALENDAR_END.lastIndex = begin.index + begin[0].length;
  const end = VCALENDAR_END.exec(value);

  if (!end) return null;

  return value.slice(begin.index, end.index + end[0].length);
}

function html_to_text(html: string): string {
  return strip_tags(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|pre|tr|li)>/gi, "\n"),
  ).replace(
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
    const match = extract_vcalendar(body as string);

    if (match) {
      return match;
    }
  }

  if (has_calendar_text(html)) {
    const match = extract_vcalendar(html_to_text(html as string));

    if (match) {
      return match;
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
      const url = safe_http_url(
        trim_end_while(candidate, is_trailing_punctuation),
      );

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
