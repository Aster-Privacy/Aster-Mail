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
      const bytes = decode_quoted_printable_bytes(
        content.replace(/_/g, " "),
      );

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

export function parse_address_list(value: string): string[] {
  if (!value) return [];
  const decoded = decode_header(value);

  return decoded
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

export function extract_email_address(value: string): string {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);

  if (match) return match[1];
  const email_match = value.match(/[\w.+-]+@[\w.-]+\.\w+/);

  return email_match ? email_match[0] : value.trim();
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

export function parse_headers(headers_raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headers_raw.split(/\r?\n/);
  let current_key = "";
  let current_value = "";

  for (const line of lines) {
    if (line.match(/^\s+/) && current_key) {
      current_value += " " + line.trim();
    } else {
      if (current_key) {
        headers[current_key.toLowerCase()] = decode_header(current_value);
      }
      const colon_index = line.indexOf(":");

      if (colon_index > 0) {
        current_key = line.substring(0, colon_index).trim();
        current_value = line.substring(colon_index + 1).trim();
      }
    }
  }
  if (current_key) {
    headers[current_key.toLowerCase()] = decode_header(current_value);
  }

  return headers;
}

function extract_charset(content_type: string): string {
  const match = content_type.match(/charset=["']?([^"';\s]+)["']?/i);

  return match ? match[1] : "utf-8";
}

export function decode_body(
  body: string,
  encoding: string | undefined,
  charset?: string,
): string {
  if (!encoding && !charset) return body;

  let result = body;
  const enc = encoding?.toLowerCase();

  if (enc === "base64") {
    const decoded = decode_base64_safe(body);

    if (charset) {
      const bytes = new Uint8Array(
        [...decoded].map((c) => c.charCodeAt(0)),
      );

      return decode_charset(bytes, charset);
    }

    return decoded;
  }

  if (enc === "quoted-printable") {
    if (charset) {
      const bytes = decode_quoted_printable_bytes(body);

      return decode_charset(bytes, charset);
    }

    return decode_quoted_printable(body);
  }

  if (charset && charset.toLowerCase() !== "utf-8" && charset.toLowerCase() !== "us-ascii") {
    const bytes = new Uint8Array(
      [...result].map((c) => c.charCodeAt(0)),
    );

    return decode_charset(bytes, charset);
  }

  return result;
}

export function parse_multipart(
  body: string,
  boundary: string,
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

    const { headers: part_headers_raw, body: part_body } =
      split_header_body(part);
    const part_headers = parse_headers(part_headers_raw);
    const content_type = part_headers["content-type"] || "text/plain";
    const encoding = part_headers["content-transfer-encoding"];
    const disposition = part_headers["content-disposition"] || "";

    if (
      disposition.includes("attachment") ||
      disposition.includes("filename")
    ) {
      const filename_match =
        disposition.match(/filename=["']?([^"';\n]+)["']?/i) ||
        content_type.match(/name=["']?([^"';\n]+)["']?/i);

      const filename = filename_match
        ? decode_header(filename_match[1].trim())
        : "attachment";

      let content: Uint8Array;

      if (encoding?.toLowerCase() === "base64") {
        try {
          const binary = atob(part_body.replace(/[\r\n\s]/g, ""));

          content = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            content[i] = binary.charCodeAt(i);
          }
        } catch {
          content = new TextEncoder().encode(part_body);
        }
      } else {
        content = new TextEncoder().encode(part_body);
      }

      attachments.push({
        filename,
        content_type: content_type.split(";")[0].trim(),
        content,
        size: content.length,
      });
    } else if (content_type.includes("text/html") && !html) {
      html = decode_body(part_body, encoding, extract_charset(content_type));
    } else if (content_type.includes("text/plain") && !text) {
      text = decode_body(part_body, encoding, extract_charset(content_type));
    } else if (content_type.includes("multipart/")) {
      const nested_boundary = extract_boundary(content_type);

      if (nested_boundary) {
        const nested = parse_multipart(part_body, nested_boundary);

        if (!html && nested.html) html = nested.html;
        if (!text && nested.text) text = nested.text;
        attachments.push(...nested.attachments);
      }
    } else if (
      !content_type.includes("text/") &&
      part_body.trim().length > 0
    ) {
      const filename_match =
        disposition.match(/filename=["']?([^"';\n]+)["']?/i) ||
        content_type.match(/name=["']?([^"';\n]+)["']?/i);

      const filename = filename_match
        ? decode_header(filename_match[1].trim())
        : "attachment";

      let content: Uint8Array;

      if (encoding?.toLowerCase() === "base64") {
        try {
          const binary = atob(part_body.replace(/[\r\n\s]/g, ""));

          content = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            content[i] = binary.charCodeAt(i);
          }
        } catch {
          content = new TextEncoder().encode(part_body);
        }
      } else {
        content = new TextEncoder().encode(part_body);
      }

      attachments.push({
        filename,
        content_type: content_type.split(";")[0].trim(),
        content,
        size: content.length,
      });
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
