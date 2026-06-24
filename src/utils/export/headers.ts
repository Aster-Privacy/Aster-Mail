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
export interface Address {
  name?: string;
  email: string;
}

const ASCII_PRINTABLE_MAX = 0x7e;
const FOLD_TARGET = 78;
const HARD_LINE_LIMIT = 998;

const RFC5322_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const RFC5322_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SPECIALS = /[()<>@,;:\\"/\[\]?=]/;

function is_ascii_printable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code > ASCII_PRINTABLE_MAX) return false;
  }
  return true;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function format_rfc5322_date(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return format_rfc5322_date(new Date(0));
  }
  const weekday = RFC5322_WEEKDAYS[d.getUTCDay()];
  const day = pad2(d.getUTCDate());
  const month = RFC5322_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${weekday}, ${day} ${month} ${year} ${hh}:${mm}:${ss} +0000`;
}

function utf8_encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function base64_from_bytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function encoded_word_chunks(value: string): string[] {
  const bytes = utf8_encode(value);
  const max_payload = 75 - "=?UTF-8?B??=".length;
  const max_raw = Math.floor((max_payload / 4) * 3);
  const chunks: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let end = Math.min(i + max_raw, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    const slice = bytes.subarray(i, end);
    chunks.push("=?UTF-8?B?" + base64_from_bytes(slice) + "?=");
    i = end;
  }
  return chunks;
}

export function encode_unstructured(value: string): string {
  if (is_ascii_printable(value)) return value;
  return encoded_word_chunks(value).join(" ");
}

function needs_quoted_string(name: string): boolean {
  if (!name) return false;
  if (!is_ascii_printable(name)) return false;
  return SPECIALS.test(name) || /^\s|\s$/.test(name);
}

function quote_string(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function sanitize_addr_token(s: string): string {
  return s
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
}

export function encode_address(addr: Address): string {
  const email = sanitize_addr_token(addr.email);
  const name = sanitize_addr_token(addr.name ?? "");
  if (!name) return `<${email}>`;
  if (is_ascii_printable(name)) {
    if (needs_quoted_string(name)) return `${quote_string(name)} <${email}>`;
    return `${name} <${email}>`;
  }
  return `${encoded_word_chunks(name).join(" ")} <${email}>`;
}

export function encode_address_list(addrs: Address[]): string {
  return addrs
    .filter((a) => a && a.email)
    .map(encode_address)
    .join(", ");
}

export function fold_header(name: string, value: string): string {
  const raw = `${name}: ${value}`;
  if (raw.length <= FOLD_TARGET && raw.length <= HARD_LINE_LIMIT) return raw;
  const out: string[] = [];
  let current = `${name}:`;
  const tokens = value.split(/(\s+)/).filter((t) => t.length > 0);
  for (const token of tokens) {
    if (/^\s+$/.test(token)) continue;
    const candidate = current.length === name.length + 1
      ? `${current} ${token}`
      : `${current} ${token}`;
    if (candidate.length > FOLD_TARGET && current.length > name.length + 1) {
      out.push(current);
      current = "\t" + token;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) out.push(current);
  return out.join("\r\n");
}

export function emit_header(name: string, value: string): string {
  return fold_header(name, value) + "\r\n";
}

export function emit_unstructured_header(name: string, value: string): string {
  return emit_header(name, encode_unstructured(value));
}

export function emit_address_header(name: string, addrs: Address[]): string {
  return emit_header(name, encode_address_list(addrs));
}

export function emit_raw_header_passthrough(name: string, value: string): string {
  const single_line = value.replace(/\r?\n[ \t]+/g, " ").replace(/[\r\n]/g, " ").trim();
  if (single_line.length + name.length + 2 <= FOLD_TARGET) {
    return `${name}: ${single_line}\r\n`;
  }
  return emit_header(name, single_line);
}

export function generate_message_id(domain: string = "export.local.astermail"): string {
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  let b64 = base64_from_bytes(rand)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `<${b64}.${Date.now()}@${domain}>`;
}

const VERBATIM_HEADERS = new Set([
  "received",
  "return-path",
  "authentication-results",
  "dkim-signature",
  "arc-seal",
  "arc-message-signature",
  "arc-authentication-results",
  "references",
  "in-reply-to",
  "list-unsubscribe",
  "list-unsubscribe-post",
  "reply-to",
  "sender",
  "message-id",
  "x-original-to",
  "delivered-to",
]);

const BODY_OWNED_HEADERS = new Set([
  "content-type",
  "content-transfer-encoding",
  "content-disposition",
  "content-id",
  "content-description",
  "mime-version",
]);

export function header_is_verbatim_candidate(name: string): boolean {
  return VERBATIM_HEADERS.has(name.toLowerCase());
}

export function header_is_body_owned(name: string): boolean {
  return BODY_OWNED_HEADERS.has(name.toLowerCase());
}

export function encode_rfc2231_filename(filename: string): string {
  const bytes = utf8_encode(filename);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (
      (b >= 0x30 && b <= 0x39) ||
      (b >= 0x41 && b <= 0x5a) ||
      (b >= 0x61 && b <= 0x7a) ||
      b === 0x2d || b === 0x2e || b === 0x5f || b === 0x7e
    ) {
      out += String.fromCharCode(b);
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

export function filename_param(filename: string): string {
  if (is_ascii_printable(filename) && !SPECIALS.test(filename) && !/\s/.test(filename)) {
    return `filename="${filename}"`;
  }
  if (is_ascii_printable(filename) && !/["\\]/.test(filename)) {
    return `filename="${filename}"`;
  }
  return `filename*=UTF-8''${encode_rfc2231_filename(filename)}`;
}
