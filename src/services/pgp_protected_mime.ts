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

export interface ProtectedMimeAttachment {
  filename: string;
  content_type: string;
  data_base64: string;
  content_id?: string | null;
}

export interface ProtectedMimeInput {
  subject: string;
  body: string;
  is_html: boolean;
  from: string;
  to: string[];
  cc: string[];
  attachments: ProtectedMimeAttachment[];
  date?: Date;
  obscure_subject?: boolean;
}

export const OBSCURED_SUBJECT_PLACEHOLDER = "...";

const ENCODED_WORD_PAYLOAD_BYTES = 45;

const text_encoder = new TextEncoder();

function sanitize_header_value(value: string): string {
  return value.replace(/[\r\n\0]/g, "");
}

function needs_encoded_word(value: string): boolean {
  for (const c of value) {
    const cp = c.codePointAt(0) ?? 0;

    if (cp > 0x7f || cp < 0x20) return true;
  }

  return false;
}

function base64_of_string(value: string): string {
  const bytes = text_encoder.encode(value);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function encoded_word_chunks(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let current_bytes = 0;

  for (const c of value) {
    const size = text_encoder.encode(c).length;

    if (current_bytes + size > ENCODED_WORD_PAYLOAD_BYTES) {
      chunks.push(`=?UTF-8?B?${base64_of_string(current)}?=`);
      current = "";
      current_bytes = 0;
    }

    current += c;
    current_bytes += size;
  }

  if (current.length > 0) {
    chunks.push(`=?UTF-8?B?${base64_of_string(current)}?=`);
  }

  return chunks;
}

export function encode_header_value(value: string): string {
  const sanitized = sanitize_header_value(value);

  if (!needs_encoded_word(sanitized)) return sanitized;

  return encoded_word_chunks(sanitized).join("\r\n ");
}

export function encode_address_header(value: string): string {
  const sanitized = sanitize_header_value(value);

  if (!needs_encoded_word(sanitized)) return sanitized;

  const trimmed = sanitized.replace(/\s+$/, "");
  const open = trimmed.lastIndexOf("<");

  if (open !== -1 && trimmed.endsWith(">")) {
    const display = trimmed.slice(0, open).trim().replace(/^"|"$/g, "");
    const addr = trimmed.slice(open);

    if (!needs_encoded_word(addr)) {
      if (display.length === 0) return addr;

      return `${encoded_word_chunks(display).join("\r\n ")} ${addr}`;
    }
  }

  return encoded_word_chunks(sanitized).join("\r\n ");
}

function sanitize_filename(value: string): string {
  const cleaned = Array.from(value)
    .filter((c) => {
      const cp = c.codePointAt(0) ?? 0;

      return cp >= 0x20 && cp !== 0x7f && !['"', "\\", "\r", "\n"].includes(c);
    })
    .slice(0, 255)
    .join("");
  const trimmed = cleaned.trim();

  return trimmed.length === 0 ? "attachment" : trimmed;
}

function wrap_base64(data: string): string {
  const compact = data.replace(/\s+/g, "");
  let out = "";

  for (let i = 0; i < compact.length; i += 76) {
    out += `${compact.slice(i, i + 76)}\r\n`;
  }

  return out;
}

const HTML_ENTITY_TEXT: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function html_to_plain_text(html: string): string {
  let out = "";
  let i = 0;

  while (i < html.length) {
    const c = html[i];

    if (c === "<") {
      let tag = "";

      i += 1;

      while (i < html.length && html[i] !== ">") {
        tag += html[i];
        i += 1;
      }

      i += 1;

      const lowered = tag.trim().toLowerCase();

      if (
        lowered.startsWith("br") ||
        lowered.startsWith("/p") ||
        lowered.startsWith("/div") ||
        lowered.startsWith("/tr") ||
        lowered.startsWith("/li") ||
        lowered.startsWith("/h1") ||
        lowered.startsWith("/h2") ||
        lowered.startsWith("/h3")
      ) {
        out += "\n";
      }

      continue;
    }

    out += c;
    i += 1;
  }

  const decoded = out.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39);/g,
    (entity) => HTML_ENTITY_TEXT[entity] ?? entity,
  );

  let collapsed = "";
  let blank_run = 0;

  for (const line of decoded.split(/\r\n|\r|\n/)) {
    const trimmed = line.replace(/\s+$/, "");

    if (trimmed.trim().length === 0) {
      blank_run += 1;

      if (blank_run > 1) continue;
    } else {
      blank_run = 0;
    }

    collapsed += `${trimmed}\r\n`;
  }

  const result = collapsed.trim();

  return result.length === 0 ? " " : result;
}

function base64_body(value: string): string {
  return wrap_base64(base64_of_string(value));
}

function random_token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function format_rfc2822_date(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (n: number) => n.toString().padStart(2, "0");

  return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

export function build_protected_mime_entity(input: ProtectedMimeInput): string {
  const boundary = `--=_astermail_protected_${random_token()}`;
  const safe_subject = encode_header_value(input.subject);
  const safe_date = sanitize_header_value(
    format_rfc2822_date(input.date ?? new Date()),
  );

  let protected_headers =
    'Content-Type: text/rfc822-headers; charset=utf-8; protected-headers="v1"\r\n' +
    "Content-Disposition: inline\r\n\r\n" +
    `Date: ${safe_date}\r\n` +
    `Subject: ${safe_subject}\r\n`;

  if (input.from.length > 0) {
    protected_headers += `From: ${encode_address_header(input.from)}\r\n`;
  }

  if (input.to.length > 0) {
    protected_headers += `To: ${input.to.map(encode_address_header).join(", ")}\r\n`;
  }

  if (input.cc.length > 0) {
    protected_headers += `Cc: ${input.cc.map(encode_address_header).join(", ")}\r\n`;
  }

  let body_part: string;

  if (input.is_html) {
    const alt_boundary = `--=_astermail_alt_${random_token()}`;

    body_part =
      `Content-Type: multipart/alternative; boundary="${alt_boundary}"\r\n\r\n` +
      `--${alt_boundary}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      base64_body(html_to_plain_text(input.body)) +
      `--${alt_boundary}\r\n` +
      "Content-Type: text/html; charset=utf-8\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      base64_body(input.body) +
      `--${alt_boundary}--\r\n`;
  } else {
    body_part =
      "Content-Type: text/plain; charset=utf-8\r\n" +
      "Content-Transfer-Encoding: 8bit\r\n\r\n" +
      `${input.body}\r\n`;
  }

  let mime =
    `Content-Type: multipart/mixed; boundary="${boundary}"; protected-headers="v1"\r\n\r\n` +
    `--${boundary}\r\n` +
    `${protected_headers}\r\n` +
    `--${boundary}\r\n`;

  if (input.obscure_subject === true) {
    const legacy_display_subject = sanitize_header_value(input.subject);

    mime +=
      'Content-Type: text/plain; charset=utf-8; protected-headers="v1"\r\n' +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: inline\r\n\r\n" +
      base64_body(`Subject: ${legacy_display_subject}\r\n`) +
      `--${boundary}\r\n`;
  }

  mime += body_part;

  for (const att of input.attachments) {
    const filename = sanitize_filename(att.filename);
    const raw_type = sanitize_header_value(att.content_type);
    const content_type =
      raw_type.length === 0 ? "application/octet-stream" : raw_type;

    mime += `--${boundary}\r\n`;
    mime += `Content-Type: ${content_type}; name="${filename}"\r\n`;
    mime += "Content-Transfer-Encoding: base64\r\n";

    const cid_clean = Array.from(att.content_id ?? "")
      .filter((c) => /[A-Za-z0-9@.\-_+]/.test(c))
      .slice(0, 255)
      .join("");

    if (cid_clean.length > 0) {
      mime += `Content-ID: <${cid_clean}>\r\n`;
      mime += `Content-Disposition: inline; filename="${filename}"\r\n`;
    } else {
      mime += `Content-Disposition: attachment; filename="${filename}"\r\n`;
    }

    mime += "\r\n";
    mime += wrap_base64(att.data_base64);
  }

  mime += `--${boundary}--\r\n`;

  return mime;
}
