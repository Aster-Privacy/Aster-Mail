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

      if (charset.toLowerCase().includes("utf-8")) {
        return new TextDecoder("utf-8").decode(
          new Uint8Array([...decoded].map((c) => c.charCodeAt(0))),
        );
      }

      return decoded;
    } else if (encoding.toLowerCase() === "q") {
      return decode_quoted_printable(content.replace(/_/g, " "));
    }
  } catch {
    return word;
  }

  return word;
}

export function decode_header(value: string): string {
  if (!value) return "";

  return value.replace(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g, decode_mime_word);
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
  const match = content_type.match(/boundary=["']?([^"';\s]+)["']?/i);

  return match ? match[1] : null;
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

export function decode_body(
  body: string,
  encoding: string | undefined,
): string {
  if (!encoding) return body;
  const enc = encoding.toLowerCase();

  if (enc === "quoted-printable") {
    return decode_quoted_printable(body);
  } else if (enc === "base64") {
    return decode_base64_safe(body);
  }

  return body;
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
      html = decode_body(part_body, encoding);
    } else if (content_type.includes("text/plain") && !text) {
      text = decode_body(part_body, encoding);
    } else if (content_type.includes("multipart/")) {
      const nested_boundary = extract_boundary(content_type);

      if (nested_boundary) {
        const nested = parse_multipart(part_body, nested_boundary);

        if (!html && nested.html) html = nested.html;
        if (!text && nested.text) text = nested.text;
        attachments.push(...nested.attachments);
      }
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
