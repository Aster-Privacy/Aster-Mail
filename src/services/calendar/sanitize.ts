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
import { sanitize_html } from "@/lib/html_sanitizer";

export const CALENDAR_TEXT_LIMITS = {
  title: 500,
  description: 8000,
  location: 1000,
  display_name: 200,
  email: 320,
  uid: 255,
  tag: 100,
} as const;

export type CalendarTextKind = keyof typeof CALENDAR_TEXT_LIMITS;

const ALLOWED_URL_PROTOCOLS = ["https:", "http:", "mailto:", "tel:"];
const MAX_URL_LENGTH = 2048;

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const BIDI_AND_INVISIBLE =
  /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;
const HORIZONTAL_SPACE = /[^\S\n]+/g;
const EXCESS_NEWLINES = /\n{3,}/g;

export function sanitize_calendar_text(
  value: unknown,
  kind: CalendarTextKind,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const limit = CALENDAR_TEXT_LIMITS[kind];
  const multiline = kind === "description";
  let text = value
    .slice(0, limit * 4)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(BIDI_AND_INVISIBLE, "");

  text = multiline
    ? text
        .replace(HORIZONTAL_SPACE, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(EXCESS_NEWLINES, "\n\n")
    : text.replace(/\s+/g, " ");

  text = text.trim();

  return text.length > limit ? text.slice(0, limit).trimEnd() : text;
}

export function sanitize_calendar_email(value: unknown): string {
  const text = sanitize_calendar_text(value, "email")
    .replace(/^mailto:/i, "")
    .replace(/\s+/g, "");

  if (text.length === 0 || text.length > CALENDAR_TEXT_LIMITS.email) {
    return "";
  }

  const at = text.indexOf("@");

  return at > 0 && at === text.lastIndexOf("@") && at < text.length - 1
    ? text
    : "";
}

export function safe_calendar_url(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_URL_LENGTH ||
    CONTROL_CHARS.test(trimmed) ||
    BIDI_AND_INVISIBLE.test(trimmed) ||
    /\s/.test(trimmed)
  ) {
    CONTROL_CHARS.lastIndex = 0;
    BIDI_AND_INVISIBLE.lastIndex = 0;

    return null;
  }

  CONTROL_CHARS.lastIndex = 0;
  BIDI_AND_INVISIBLE.lastIndex = 0;

  try {
    const parsed = new URL(trimmed);

    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
      return null;
    }

    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length === 0
    ) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

export function sanitize_calendar_description_html(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) {
    return "";
  }

  return sanitize_html(html.slice(0, CALENDAR_TEXT_LIMITS.description * 4), {
    sandbox_mode: true,
    external_content_mode: "never",
    content_blocking: {
      block_remote_images: true,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    },
  }).html;
}
