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
export interface MailtoDraft {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
}

const MAILTO_PREFIX = "mailto:";
const MAX_LINK_LENGTH = 16384;
const MAX_RECIPIENTS_PER_FIELD = 100;
const MAX_SUBJECT_LENGTH = 998;
const MAX_BODY_LENGTH = 100000;
const ADDRESS_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const BRACKETED_ADDRESS_PATTERN = /<([^<>]+)>\s*$/;

function decode_component(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extract_address(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) return null;

  const bracketed = trimmed.match(BRACKETED_ADDRESS_PATTERN);
  const candidate = (bracketed ? bracketed[1] : trimmed).trim();

  return ADDRESS_PATTERN.test(candidate) ? candidate : null;
}

function append_addresses(target: string[], encoded_list: string): void {
  for (const encoded of encoded_list.split(",")) {
    for (const part of decode_component(encoded).split(",")) {
      if (target.length >= MAX_RECIPIENTS_PER_FIELD) return;

      const address = extract_address(part);

      if (!address) continue;

      const is_duplicate = target.some(
        (existing) => existing.toLowerCase() === address.toLowerCase(),
      );

      if (!is_duplicate) target.push(address);
    }
  }
}

function strip_control_characters(value: string): string {
  let cleaned = "";

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    cleaned += code < 32 || code === 127 ? " " : character;
  }

  return cleaned;
}

export function escape_mailto_body(body: string): string {
  return body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

export function parse_mailto_link(raw_link: string): MailtoDraft | null {
  const link = raw_link.trim();

  if (link.length <= MAILTO_PREFIX.length || link.length > MAX_LINK_LENGTH) {
    return null;
  }

  if (link.slice(0, MAILTO_PREFIX.length).toLowerCase() !== MAILTO_PREFIX) {
    return null;
  }

  const remainder = link.slice(MAILTO_PREFIX.length).split("#")[0];
  const query_index = remainder.indexOf("?");
  const path = query_index === -1 ? remainder : remainder.slice(0, query_index);
  const query = query_index === -1 ? "" : remainder.slice(query_index + 1);
  const draft: MailtoDraft = { to: [], cc: [], bcc: [], subject: "", body: "" };
  const body_parts: string[] = [];

  append_addresses(draft.to, path);

  for (const pair of query.split("&")) {
    if (!pair) continue;

    const separator_index = pair.indexOf("=");
    const name = decode_component(
      separator_index === -1 ? pair : pair.slice(0, separator_index),
    ).toLowerCase();
    const encoded_value =
      separator_index === -1 ? "" : pair.slice(separator_index + 1);

    if (name === "to") {
      append_addresses(draft.to, encoded_value);
    } else if (name === "cc") {
      append_addresses(draft.cc, encoded_value);
    } else if (name === "bcc") {
      append_addresses(draft.bcc, encoded_value);
    } else if (name === "subject") {
      if (!draft.subject) {
        draft.subject = strip_control_characters(
          decode_component(encoded_value),
        )
          .trim()
          .slice(0, MAX_SUBJECT_LENGTH);
      }
    } else if (name === "body") {
      body_parts.push(decode_component(encoded_value));
    }
  }

  draft.body = body_parts.join("\n").slice(0, MAX_BODY_LENGTH);

  return draft;
}
