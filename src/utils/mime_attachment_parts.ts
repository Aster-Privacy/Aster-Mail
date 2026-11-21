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
export interface MimeAttachmentPart {
  filename: string;
  content_type: string;
  content_id?: string;
  is_inline: boolean;
  data: Uint8Array;
}

interface ParsedHeaderValue {
  value: string;
  params: Map<string, string>;
}

interface MimeNode {
  headers: Map<string, string>;
  body: string;
}

const MAX_MIME_DEPTH = 12;
const MAX_MIME_ATTACHMENTS = 100;

const SKIPPED_LEAF_TYPES = new Set([
  "application/pgp-signature",
  "application/pgp-encrypted",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
  "text/rfc822-headers",
]);

const BODY_LEAF_TYPES = new Set(["text/plain", "text/html"]);

function split_header_block(raw: string): MimeNode | null {
  const match = /\r?\n\r?\n/.exec(raw);
  const header_text = match ? raw.slice(0, match.index) : raw;
  const body = match ? raw.slice(match.index + match[0].length) : "";
  const unfolded = header_text.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();

  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");

    if (colon <= 0) continue;

    const name = line.slice(0, colon).trim().toLowerCase();

    if (!/^[!-9;-~]+$/.test(name)) continue;
    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
  }

  if (headers.size === 0) return null;

  return { headers, body };
}

function split_params(input: string): string[] {
  const segments: string[] = [];
  let current = "";
  let in_quotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;

    if (char === "\\" && in_quotes && i + 1 < input.length) {
      current += char + (input[i + 1] as string);
      i += 1;
      continue;
    }

    if (char === '"') in_quotes = !in_quotes;

    if (char === ";" && !in_quotes) {
      segments.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  segments.push(current);

  return segments;
}

function unquote(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
  }

  return trimmed;
}

function percent_decode_to_bytes(input: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;

    if (char === "%" && /^[0-9A-Fa-f]{2}$/.test(input.slice(i + 1, i + 3))) {
      bytes.push(parseInt(input.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }

    for (const byte of new TextEncoder().encode(char)) bytes.push(byte);
  }

  return new Uint8Array(bytes);
}

function decode_with_charset(bytes: Uint8Array, charset: string): string {
  const label = charset.trim().toLowerCase() || "utf-8";

  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }
}

function decode_rfc2231_value(raw: string, encoded: boolean): string {
  if (!encoded) return raw;

  const first_quote = raw.indexOf("'");
  const second_quote = first_quote >= 0 ? raw.indexOf("'", first_quote + 1) : -1;

  if (first_quote < 0 || second_quote < 0) {
    return decode_with_charset(percent_decode_to_bytes(raw), "utf-8");
  }

  const charset = raw.slice(0, first_quote);
  const text = raw.slice(second_quote + 1);

  return decode_with_charset(percent_decode_to_bytes(text), charset);
}

function parse_header_value(raw: string | undefined): ParsedHeaderValue {
  const segments = split_params(raw ?? "");
  const value = (segments.shift() ?? "").trim().toLowerCase();
  const simple = new Map<string, string>();
  const extended = new Map<
    string,
    { index: number; text: string; encoded: boolean }[]
  >();

  for (const segment of segments) {
    const eq = segment.indexOf("=");

    if (eq <= 0) continue;

    const key = segment.slice(0, eq).trim().toLowerCase();
    const raw_value = unquote(segment.slice(eq + 1));
    const ext_match = /^([^*]+)\*(?:(\d+)\*?|)$/.exec(key);

    if (!ext_match) {
      if (!simple.has(key)) simple.set(key, raw_value);
      continue;
    }

    const base = ext_match[1] as string;
    const index = ext_match[2] === undefined ? 0 : parseInt(ext_match[2], 10);
    const encoded = key.endsWith("*");
    const entries = extended.get(base) ?? [];

    entries.push({ index, text: raw_value, encoded });
    extended.set(base, entries);
  }

  for (const [base, entries] of extended) {
    entries.sort((a, b) => a.index - b.index);

    const first = entries[0];

    if (!first) continue;

    if (!first.encoded) {
      simple.set(base, entries.map((e) => e.text).join(""));
      continue;
    }

    const quote_end = first.text.indexOf("'", first.text.indexOf("'") + 1);
    const prefix = quote_end >= 0 ? first.text.slice(0, quote_end + 1) : "";
    const charset = prefix ? prefix.slice(0, prefix.indexOf("'")) : "utf-8";
    const byte_chunks: number[] = [];

    for (const entry of entries) {
      const text = entry === first && prefix ? entry.text.slice(prefix.length) : entry.text;
      const bytes = entry.encoded
        ? percent_decode_to_bytes(text)
        : new TextEncoder().encode(text);

      for (const byte of bytes) byte_chunks.push(byte);
    }

    simple.set(
      base,
      entries.length === 1 && !prefix
        ? decode_rfc2231_value(first.text, true)
        : decode_with_charset(new Uint8Array(byte_chunks), charset),
    );
  }

  return { value, params: simple };
}

function decode_q_word(text: string, underscore_is_space = true): Uint8Array {
  const bytes: number[] = [];
  const normalized = underscore_is_space ? text.replace(/_/g, " ") : text;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i] as string;

    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(i + 1, i + 3))) {
      bytes.push(parseInt(normalized.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }

    for (const byte of new TextEncoder().encode(char)) bytes.push(byte);
  }

  return new Uint8Array(bytes);
}

export function decode_encoded_words(input: string): string {
  const pattern = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
  const collapsed = input.replace(
    /(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?)/g,
    "$1",
  );

  return collapsed.replace(pattern, (whole, charset: string, mode: string, text: string) => {
    const label = charset.split("*")[0] ?? "utf-8";

    if (mode.toLowerCase() === "b") {
      const bytes = base64_decode(text);

      return bytes ? decode_with_charset(bytes, label) : whole;
    }

    return decode_with_charset(decode_q_word(text), label);
  });
}

function base64_decode(input: string): Uint8Array | null {
  const cleaned = input.replace(/[^A-Za-z0-9+/]/g, "");

  try {
    const binary = atob(cleaned + "===".slice(0, (4 - (cleaned.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }

    return bytes;
  } catch {
    return null;
  }
}

function quoted_printable_decode(input: string): Uint8Array {
  const unfolded = input.replace(/=[ \t]*\r?\n/g, "");
  const hard_breaks = unfolded.replace(/[ \t]+(?=\r?\n)/g, "").replace(/\r?\n/g, "\r\n");

  return decode_q_word(hard_breaks, false);
}

function decode_part_bytes(body: string, encoding: string): Uint8Array {
  if (encoding === "base64") return base64_decode(body) ?? new Uint8Array();
  if (encoding === "quoted-printable") return quoted_printable_decode(body);

  const bytes = new Uint8Array(body.length);
  let is_byte_string = true;

  for (let i = 0; i < body.length; i += 1) {
    const code = body.charCodeAt(i);

    if (code > 0xff) {
      is_byte_string = false;
      break;
    }

    bytes[i] = code;
  }

  return is_byte_string ? bytes : new TextEncoder().encode(body);
}

function strip_part_body_terminator(body: string): string {
  return body.replace(/\r?\n$/, "");
}

function split_multipart(body: string, boundary: string): string[] {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const delimiter = new RegExp(`(?:^|\\r?\\n)--${escaped}(--)?[ \\t]*(?=\\r?\\n|$)`, "g");
  const parts: string[] = [];
  let start = -1;
  let match: RegExpExecArray | null;

  while ((match = delimiter.exec(body)) !== null) {
    if (start >= 0) parts.push(body.slice(start, match.index));
    if (match[1] === "--") {
      start = -1;
      break;
    }

    const after = match.index + match[0].length;
    const newline = /^\r?\n/.exec(body.slice(after));

    start = after + (newline ? newline[0].length : 0);
  }

  if (start >= 0) parts.push(body.slice(start));

  return parts;
}

function extension_for_type(content_type: string): string {
  if (content_type === "message/rfc822") return ".eml";

  const sub = content_type.split("/")[1] ?? "";

  return /^[a-z0-9]{1,8}$/.test(sub) ? `.${sub}` : "";
}

function resolve_filename(
  disposition: ParsedHeaderValue,
  content_type: ParsedHeaderValue,
): string | null {
  const raw = disposition.params.get("filename") ?? content_type.params.get("name");

  if (!raw) return null;

  const decoded = decode_encoded_words(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim();

  return decoded.length > 0 ? decoded : null;
}

function collect_parts(
  node: MimeNode,
  out: MimeAttachmentPart[],
  depth: number,
): void {
  if (depth > MAX_MIME_DEPTH || out.length >= MAX_MIME_ATTACHMENTS) return;

  const content_type = parse_header_value(node.headers.get("content-type"));
  const type = content_type.value || "text/plain";
  const boundary = content_type.params.get("boundary");

  if (type.startsWith("multipart/") && boundary) {
    for (const raw_part of split_multipart(node.body, boundary)) {
      const child = split_header_block(raw_part.replace(/^\r?\n/, "\n"));

      if (child) {
        collect_parts(child, out, depth + 1);
      } else if (raw_part.trim().length > 0) {
        collect_parts({ headers: new Map(), body: raw_part.replace(/^\r?\n/, "") }, out, depth + 1);
      }
    }

    return;
  }

  if (SKIPPED_LEAF_TYPES.has(type)) return;

  const disposition = parse_header_value(node.headers.get("content-disposition"));
  const filename = resolve_filename(disposition, content_type);
  const content_id_raw = node.headers.get("content-id");
  const content_id = content_id_raw
    ? content_id_raw.replace(/^\s*<|>\s*$/g, "").trim() || undefined
    : undefined;
  const is_attachment_disposition = disposition.value === "attachment";

  if (BODY_LEAF_TYPES.has(type) && !filename && !is_attachment_disposition) {
    return;
  }

  if (!filename && !is_attachment_disposition && !content_id) return;

  const encoding = (node.headers.get("content-transfer-encoding") ?? "7bit")
    .trim()
    .toLowerCase();
  const data = decode_part_bytes(strip_part_body_terminator(node.body), encoding);

  if (data.length === 0) return;

  out.push({
    filename:
      filename ??
      `${content_id ? content_id.split("@")[0] : "attachment"}${extension_for_type(type)}`,
    content_type: type,
    content_id,
    is_inline: disposition.value === "inline",
    data,
  });
}

export function extract_mime_attachments(raw: string): MimeAttachmentPart[] {
  if (!/^content-type\s*:/im.test(raw)) return [];

  const root = split_header_block(raw.replace(/^﻿/, ""));

  if (!root || !root.headers.has("content-type")) return [];

  const out: MimeAttachmentPart[] = [];

  try {
    collect_parts(root, out, 0);
  } catch {
    return out;
  }

  return out;
}
