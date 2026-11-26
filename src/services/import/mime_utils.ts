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
import type { ParsedAttachment } from "./types";

import {
  find_address_like,
  first_angle_capture,
  split_outside_quotes,
} from "@/lib/address_scans";
import { unflow_format_flowed } from "@/lib/format_flowed";
import { trim_end_index } from "@/lib/linear_trim";

export function is_format_flowed(content_type: string): boolean {
  return /;\s*format\s*=\s*["']?flowed\b/i.test(content_type);
}

function is_delsp(content_type: string): boolean {
  return /;\s*delsp\s*=\s*["']?yes\b/i.test(content_type);
}

export function decode_text_part(
  part_body: string,
  encoding: string | undefined,
  content_type: string,
): string {
  const decoded = decode_body(
    part_body,
    encoding,
    extract_charset(content_type),
  );

  if (!is_format_flowed(content_type)) return decoded;

  return unflow_format_flowed(decoded, { delsp: is_delsp(content_type) });
}

export function decode_quoted_printable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

function decode_quoted_printable_bytes(input: string): Uint8Array {
  const stripped = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];

  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === "=" && i + 2 < stripped.length) {
      const hex = stripped.substring(i + 1, i + 3);

      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(stripped.charCodeAt(i));
  }

  return new Uint8Array(bytes);
}

function decode_charset(bytes: Uint8Array, charset: string): string {
  const normalized = charset.toLowerCase().replace(/[^a-z0-9]/g, "");

  try {
    const label = CHARSET_LABELS[normalized] || charset;

    return new TextDecoder(label).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join("");
    }
  }
}

const CHARSET_LABELS: Record<string, string> = {
  utf8: "utf-8",
  ascii: "utf-8",
  usascii: "utf-8",
  latin1: "iso-8859-1",
  iso88591: "iso-8859-1",
  iso88592: "iso-8859-2",
  iso88593: "iso-8859-3",
  iso88594: "iso-8859-4",
  iso88595: "iso-8859-5",
  iso88596: "iso-8859-6",
  iso88597: "iso-8859-7",
  iso88598: "iso-8859-8",
  iso88599: "iso-8859-9",
  iso885910: "iso-8859-10",
  iso885913: "iso-8859-13",
  iso885914: "iso-8859-14",
  iso885915: "iso-8859-15",
  iso885916: "iso-8859-16",
  windows1250: "windows-1250",
  windows1251: "windows-1251",
  windows1252: "windows-1252",
  windows1253: "windows-1253",
  windows1254: "windows-1254",
  windows1255: "windows-1255",
  windows1256: "windows-1256",
  windows1257: "windows-1257",
  windows1258: "windows-1258",
  cp1252: "windows-1252",
  cp1250: "windows-1250",
  cp1251: "windows-1251",
  koi8r: "koi8-r",
  koi8u: "koi8-u",
  big5: "big5",
  gbk: "gbk",
  gb2312: "gb2312",
  gb18030: "gb18030",
  eucjp: "euc-jp",
  euckr: "euc-kr",
  shiftjis: "shift_jis",
  sjis: "shift_jis",
  iso2022jp: "iso-2022-jp",
};

export function decode_base64_safe(input: string): string {
  try {
    const cleaned = input.replace(/[\r\n\s]/g, "");

    if (cleaned.length === 0) return "";

    return atob(cleaned);
  } catch {
    return input;
  }
}

function decode_mime_word(word: string): string {
  const match = word.match(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/);

  if (!match) return word;

  const [, charset, encoding, content] = match;

  try {
    if (encoding.toLowerCase() === "b") {
      const decoded = decode_base64_safe(content);
      const bytes = new Uint8Array([...decoded].map((c) => c.charCodeAt(0)));

      return decode_charset(bytes, charset);
    } else if (encoding.toLowerCase() === "q") {
      const bytes = decode_quoted_printable_bytes(content.replace(/_/g, " "));

      return decode_charset(bytes, charset);
    }
  } catch {
    return word;
  }

  return word;
}

export function decode_header(value: string): string {
  if (!value) return "";

  const collapsed = value.replace(/(\?=)\s+(=\?)/g, "$1$2");

  return collapsed.replace(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g, decode_mime_word);
}

const ENCODED_WORD = /=\?[^?]+\?([BbQq])\?([^?]*)\?=/g;
const BASE64_TEXT = /^[A-Za-z0-9+/]*={0,2}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function decode_header_for_display(value: string): string {
  if (!value || !value.includes("=?")) return value;

  return value
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(ENCODED_WORD, (word, encoding: string, content: string) => {
      if (encoding.toLowerCase() === "b" && !BASE64_TEXT.test(content)) {
        return word;
      }

      return decode_header(word).replace(CONTROL_CHARS, " ");
    });
}

function is_word_char(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x5f
  );
}

function is_import_domain_char(code: number): boolean {
  return is_word_char(code) || code === 0x2e || code === 0x2d;
}

function is_import_local_char(code: number): boolean {
  return is_import_domain_char(code) || code === 0x2b;
}

function is_equals(code: number): boolean {
  return code === 0x3d;
}

export function parse_address_list(value: string): string[] {
  if (!value) return [];
  const decoded = decode_header(value);

  return split_outside_quotes(decoded)
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

export function extract_email_address(value: string): string {
  if (!value) return "";
  const angle = first_angle_capture(value);

  if (angle !== null) return angle;
  const email_match = find_address_like(
    value,
    is_import_local_char,
    is_import_domain_char,
    is_word_char,
    1,
  );

  return email_match ?? value.trim();
}

export function extract_boundary(content_type: string): string | null {
  const quoted = content_type.match(/boundary=["']([^"']+)["']/i);

  if (quoted) return quoted[1];

  const unquoted = content_type.match(/boundary=([^;\s]+)/i);

  return unquoted ? unquoted[1] : null;
}

export function split_header_body(raw: string): {
  headers: string;
  body: string;
} {
  const crlf_index = raw.indexOf("\r\n\r\n");

  if (crlf_index !== -1) {
    return {
      headers: raw.substring(0, crlf_index),
      body: raw.substring(crlf_index + 4),
    };
  }
  const lf_index = raw.indexOf("\n\n");

  if (lf_index !== -1) {
    return {
      headers: raw.substring(0, lf_index),
      body: raw.substring(lf_index + 2),
    };
  }

  return { headers: raw, body: "" };
}

function is_ascii_whitespace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

export function trim_ascii_whitespace(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && is_ascii_whitespace(value.charCodeAt(start))) start++;
  while (end > start && is_ascii_whitespace(value.charCodeAt(end - 1))) end--;

  return start === 0 && end === value.length
    ? value
    : value.substring(start, end);
}

const FIRST_WINS_HEADERS = new Set(["x-gmail-labels", "x-keywords"]);

export function parse_headers(headers_raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headers_raw.split(/\r?\n/);
  let current_key = "";
  let current_value = "";

  const store_header = () => {
    const key = current_key.toLowerCase();

    if (
      FIRST_WINS_HEADERS.has(key) &&
      Object.prototype.hasOwnProperty.call(headers, key)
    ) {
      return;
    }

    headers[key] = decode_header(reinterpret_as_utf8(current_value));
  };

  for (const line of lines) {
    if (/^[ \t]/.test(line) && current_key) {
      current_value += " " + trim_ascii_whitespace(line);
    } else {
      if (current_key) store_header();
      const colon_index = line.indexOf(":");

      if (colon_index > 0) {
        current_key = trim_ascii_whitespace(line.substring(0, colon_index));
        current_value = trim_ascii_whitespace(line.substring(colon_index + 1));
      }
    }
  }
  if (current_key) store_header();

  return headers;
}

function extract_charset(content_type: string): string | undefined {
  const match = content_type.match(/charset=["']?([^"';\s]+)["']?/i);

  return match ? match[1] : undefined;
}

function is_utf8_charset(charset: string): boolean {
  return /^utf-?8$/i.test(charset);
}

const BINARY_STRING_CHUNK = 0x8000;
const NON_ASCII = /[^\x00-\x7f]/;
const NON_BYTE = /[^\x00-\xff]/;

export function bytes_to_binary_string(bytes: Uint8Array): string {
  const pieces: string[] = [];

  for (let i = 0; i < bytes.length; i += BINARY_STRING_CHUNK) {
    const chunk = bytes.subarray(i, i + BINARY_STRING_CHUNK);

    pieces.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }

  return pieces.join("");
}

function binary_string_to_bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);

  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i);
  }

  return bytes;
}

function reinterpret_as_utf8(value: string, declared_utf8 = false): string {
  if (!NON_ASCII.test(value) || NON_BYTE.test(value)) return value;

  const bytes = binary_string_to_bytes(value);

  try {
    return new TextDecoder("utf-8", { fatal: !declared_utf8 }).decode(bytes);
  } catch {
    return decode_charset(bytes, "windows-1252");
  }
}

export function decode_body(
  body: string,
  encoding: string | undefined,
  charset?: string,
): string {
  if (!encoding && !charset) return reinterpret_as_utf8(body);

  let result = body;
  const enc = encoding?.toLowerCase();

  if (enc === "base64") {
    const decoded = decode_base64_safe(body);
    const bytes = new Uint8Array([...decoded].map((c) => c.charCodeAt(0)));

    return decode_charset(bytes, charset || "utf-8");
  }

  if (enc === "quoted-printable") {
    if (charset) {
      const bytes = decode_quoted_printable_bytes(body);

      return decode_charset(bytes, charset);
    }

    return reinterpret_as_utf8(decode_quoted_printable(body));
  }

  if (
    charset &&
    !is_utf8_charset(charset) &&
    charset.toLowerCase() !== "us-ascii"
  ) {
    const bytes = new Uint8Array([...result].map((c) => c.charCodeAt(0)));

    return decode_charset(bytes, charset);
  }

  return reinterpret_as_utf8(result, !!charset && is_utf8_charset(charset));
}

function estimate_decoded_size(
  part_body: string,
  encoding: string | undefined,
): number {
  if (encoding?.toLowerCase() === "base64") {
    const cleaned = part_body.replace(/[\r\n\s]/g, "");
    const padding = cleaned.length - trim_end_index(cleaned, is_equals);

    return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
  }

  return part_body.length;
}

export const MAX_IMPORT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ATTACHMENTS_TOTAL_BYTES = 60 * 1024 * 1024;
export const MAX_IMPORT_ATTACHMENTS_PER_EMAIL = 50;

export interface MultipartOptions {
  attachment_content?: boolean;
}

interface AttachmentBudget {
  remaining: number;
  count: number;
}

function strip_part_terminator(part_body: string): string {
  return part_body.replace(/\r?\n$/, "");
}

export function decode_part_bytes(
  part_body: string,
  encoding: string | undefined,
): Uint8Array {
  const enc = encoding?.toLowerCase().trim();

  if (enc === "base64") {
    return binary_string_to_bytes(decode_base64_safe(part_body));
  }

  if (enc === "quoted-printable") {
    return decode_quoted_printable_bytes(part_body);
  }

  return binary_string_to_bytes(strip_part_terminator(part_body));
}

function header_param(header: string, name: string): string | null {
  const pattern = new RegExp(
    `(?:^|;)\\s*${name}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|([^;]*))`,
    "i",
  );
  const match = header.match(pattern);

  if (!match) return null;

  const value =
    match[1] !== undefined ? match[1].replace(/\\(.)/g, "$1") : match[2];

  return value.trim() || null;
}

function decode_rfc2231_value(value: string, encoded: boolean): string {
  if (!encoded) return value;

  const quote = value.match(/^([^']*)'[^']*'(.*)$/);
  const charset = quote ? quote[1] || "utf-8" : "utf-8";
  const payload = quote ? quote[2] : value;
  const bytes: number[] = [];

  for (let i = 0; i < payload.length; i++) {
    if (
      payload[i] === "%" &&
      /^[0-9A-Fa-f]{2}$/.test(payload.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(payload.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(payload.charCodeAt(i) & 0xff);
    }
  }

  return decode_charset(new Uint8Array(bytes), charset);
}

function rfc2231_param(header: string, name: string): string | null {
  const single = header.match(
    new RegExp(`(?:^|;)\\s*${name}\\*\\s*=\\s*"?([^";]*)"?`, "i"),
  );

  if (single) return decode_rfc2231_value(single[1].trim(), true);

  const sections = new Map<number, { value: string; encoded: boolean }>();
  const section_pattern = new RegExp(
    `(?:^|;)\\s*${name}\\*(\\d+)(\\*?)\\s*=\\s*(?:"([^"]*)"|([^;]*))`,
    "gi",
  );

  for (const match of header.matchAll(section_pattern)) {
    sections.set(Number(match[1]), {
      value: match[3] ?? (match[4] ?? "").trim(),
      encoded: match[2] === "*",
    });
  }

  if (sections.size === 0) return null;

  const ordered = [...sections.entries()].sort((a, b) => a[0] - b[0]);
  const first_encoded = ordered[0][1].encoded;

  if (first_encoded) {
    const joined = ordered
      .map(([index, section]) =>
        section.encoded || index === 0
          ? section.value
          : encodeURIComponent(section.value),
      )
      .join("");

    return decode_rfc2231_value(joined, true);
  }

  return ordered.map(([, section]) => section.value).join("");
}

export function extract_part_filename(
  disposition: string,
  content_type: string,
): string | null {
  const raw =
    rfc2231_param(disposition, "filename") ??
    header_param(disposition, "filename") ??
    rfc2231_param(content_type, "name") ??
    header_param(content_type, "name");

  if (!raw) return null;

  const decoded = decode_header(raw)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return decoded || null;
}

function content_id_of(
  part_headers: Record<string, string>,
): string | undefined {
  const value = part_headers["content-id"]?.trim();

  if (!value) return undefined;

  return value.replace(/^<|>$/g, "").trim() || undefined;
}

function build_attachment(
  part_headers: Record<string, string>,
  content_type: string,
  disposition: string,
  part_body: string,
  encoding: string | undefined,
  options: MultipartOptions,
  budget: AttachmentBudget,
): ParsedAttachment {
  const mime_type = content_type.split(";")[0].trim().toLowerCase();
  const is_message = mime_type === "message/rfc822";
  const filename =
    extract_part_filename(disposition, content_type) ??
    (is_message ? "message.eml" : "attachment");
  const content_id = content_id_of(part_headers);
  const is_inline =
    /^\s*inline/i.test(disposition) || (!disposition && !!content_id);
  const estimated = estimate_decoded_size(part_body, encoding);
  const base: ParsedAttachment = {
    filename,
    content_type: mime_type || "application/octet-stream",
    content: new Uint8Array(0),
    size: estimated,
    ...(content_id ? { content_id } : {}),
    ...(is_inline ? { is_inline: true } : {}),
  };

  budget.count += 1;

  if (
    !options.attachment_content ||
    budget.count > MAX_IMPORT_ATTACHMENTS_PER_EMAIL ||
    estimated > MAX_IMPORT_ATTACHMENT_BYTES ||
    estimated > budget.remaining
  ) {
    return base;
  }

  const content = decode_part_bytes(part_body, encoding);

  if (
    content.length === 0 ||
    content.length > MAX_IMPORT_ATTACHMENT_BYTES ||
    content.length > budget.remaining
  ) {
    return base;
  }

  budget.remaining -= content.length;

  return { ...base, content, size: content.length };
}

function is_body_part(disposition: string): boolean {
  return !/attachment/i.test(disposition) && !/filename/i.test(disposition);
}

export function may_carry_attachments(
  content_type: string | undefined,
): boolean {
  if (!content_type) return false;

  const mime_type = content_type.split(";")[0].trim().toLowerCase();

  if (!mime_type || mime_type.startsWith("text/")) return false;

  return mime_type !== "multipart/alternative";
}

export function parse_multipart(
  body: string,
  boundary: string,
  options: MultipartOptions = {},
  budget: AttachmentBudget = {
    remaining: MAX_IMPORT_ATTACHMENTS_TOTAL_BYTES,
    count: 0,
  },
): {
  html: string | null;
  text: string | null;
  attachments: ParsedAttachment[];
} {
  const escaped_boundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`--${escaped_boundary}`));
  let html: string | null = null;
  let text: string | null = null;
  const attachments: ParsedAttachment[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed === "" || trimmed === "--") continue;

    const normalized_part = part.replace(/^[\r\n]+/, "");
    const { headers: part_headers_raw, body: part_body } =
      split_header_body(normalized_part);
    const part_headers = parse_headers(part_headers_raw);
    const content_type = part_headers["content-type"] || "text/plain";
    const encoding = part_headers["content-transfer-encoding"];
    const disposition = part_headers["content-disposition"] || "";
    const lower_type = content_type.toLowerCase();

    if (!is_body_part(disposition)) {
      attachments.push(
        build_attachment(
          part_headers,
          content_type,
          disposition,
          part_body,
          encoding,
          options,
          budget,
        ),
      );
    } else if (lower_type.includes("text/html") && !html) {
      html = decode_body(part_body, encoding, extract_charset(content_type));
    } else if (lower_type.includes("text/plain") && !text) {
      text = decode_text_part(part_body, encoding, content_type);
    } else if (lower_type.includes("multipart/")) {
      const nested_boundary = extract_boundary(content_type);

      if (nested_boundary) {
        const nested = parse_multipart(
          part_body,
          nested_boundary,
          options,
          budget,
        );

        if (!html && nested.html) html = nested.html;
        if (!text && nested.text) text = nested.text;
        attachments.push(...nested.attachments);
      }
    } else if (!lower_type.includes("text/") && part_body.trim().length > 0) {
      attachments.push(
        build_attachment(
          part_headers,
          content_type,
          disposition,
          part_body,
          encoding,
          options,
          budget,
        ),
      );
    }
  }

  return { html, text, attachments };
}

export function secure_hex(length: number): string {
  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generate_message_id(): string {
  return `imported-${Date.now().toString(36)}-${secure_hex(5)}@astermail.local`;
}
