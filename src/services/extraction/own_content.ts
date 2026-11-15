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
import {
  find_quote_start,
  is_boilerplate_text,
  is_quoted_line,
  is_separator_text,
} from "@/components/email/sandboxed_email_renderer/quote_detection";
import { strip_quoted_sections } from "@/lib/html_text";

const LEADING_SUBJECT_PREFIX = /^\s*(\p{L}{2,5})\s*:/u;
const REPLY_SUBJECT_PREFIXES = new Set(["re", "aw", "sv", "antw"]);
const FORWARD_SUBJECT_PREFIXES = new Set(["fw", "fwd", "wg", "tr", "rv", "enc"]);

const FORWARDED_MARKER =
  /(?:^|\n)[ \t>]*(?:-{2,}\s*(?:forwarded message|weitergeleitete nachricht|message transféré|mensaje reenviado|messaggio inoltrato|mensagem encaminhada|doorgestuurd bericht)\s*-{2,}|begin forwarded message\s*:)/i;

const UNICODE_SPACE =
  /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

function leading_prefix(subject: string): string | null {
  const match = subject.match(LEADING_SUBJECT_PREFIX);

  return match ? match[1].toLowerCase() : null;
}

export function is_reply_subject(subject: string): boolean {
  const prefix = leading_prefix(subject);

  return prefix !== null && REPLY_SUBJECT_PREFIXES.has(prefix);
}

export function is_forwarded_message(subject: string, text: string): boolean {
  const prefix = leading_prefix(subject);

  if (prefix !== null && REPLY_SUBJECT_PREFIXES.has(prefix)) return false;
  if (prefix !== null && FORWARD_SUBJECT_PREFIXES.has(prefix)) return true;

  return FORWARDED_MARKER.test(text);
}

export function without_quoted_markup(html: string, is_reply: boolean): string {
  const own = strip_quoted_sections(html);

  if (typeof DOMParser === "undefined") return own;

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(own, "text/html");
  } catch {
    return own;
  }

  doc
    .querySelectorAll(is_reply ? "blockquote" : 'blockquote[type="cite" i]')
    .forEach((el) => el.remove());

  return doc.documentElement.outerHTML;
}

function normalize_line(text: string): string {
  return text.replace(UNICODE_SPACE, " ").trim();
}

export function without_quoted_lines(text: string): string {
  const raw_lines = text
    .split("\n")
    .filter((line) => !is_quoted_line(normalize_line(line)));
  const lines = raw_lines.map((line) => ({ text: normalize_line(line) }));
  const marker = lines.findIndex(
    ({ text: line }) =>
      line !== "" && !is_separator_text(line) && is_boilerplate_text(line),
  );
  const start = find_quote_start(lines)?.start;
  const cuts = [start, marker >= 0 ? marker : undefined].filter(
    (value): value is number => value !== undefined,
  );
  const cut = cuts.length ? Math.min(...cuts) : raw_lines.length;

  return raw_lines.slice(0, cut).join("\n").trim();
}
