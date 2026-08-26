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
import type { ParsedEmail, ParseResult } from "./types";

import { MAX_SINGLE_EMAIL_SIZE } from "./types";
import {
  split_header_body,
  parse_headers,
  parse_address_list,
  extract_boundary,
  decode_body,
  decode_text_part,
  parse_multipart,
  generate_message_id,
} from "./mime_utils";

import { get_active_translations } from "@/lib/i18n/translations";
import { format_decimal } from "@/lib/utils";

export function strip_emlx_wrapper(raw: string): string {
  const match = raw.match(/^(\d{1,12})\r?\n/);

  if (!match) return raw;

  const declared_length = Number(match[1]);
  const body_start = match[0].length;

  if (!Number.isFinite(declared_length) || declared_length <= 0) return raw;

  return raw.slice(body_start, body_start + declared_length);
}

export function parse_eml(raw: string): ParsedEmail {
  const { headers: headers_raw, body } = split_header_body(raw);
  const headers = parse_headers(headers_raw);

  const message_id =
    headers["message-id"]?.replace(/[<>]/g, "") || generate_message_id();

  const from = headers["from"] || "";
  const to = parse_address_list(headers["to"] || "");
  const cc = parse_address_list(headers["cc"] || "");
  const bcc = parse_address_list(headers["bcc"] || "");
  const subject = headers["subject"] || "";

  let date: Date;
  let date_inferred = false;
  const date_header = headers["date"];

  if (date_header) {
    const parsed_date = new Date(date_header);

    if (isNaN(parsed_date.getTime())) {
      date = new Date();
      date_inferred = true;
    } else {
      date = parsed_date;
    }
  } else {
    date = new Date();
    date_inferred = true;
  }

  const content_type = headers["content-type"] || "text/plain";
  const encoding = headers["content-transfer-encoding"];

  let html_body: string | null = null;
  let text_body: string | null = null;
  let attachments: ParsedEmail["attachments"] = [];

  const charset_match = content_type.match(/charset=["']?([^"';\s]+)["']?/i);
  const charset = charset_match ? charset_match[1] : undefined;

  if (content_type.includes("multipart/")) {
    const boundary = extract_boundary(content_type);

    if (boundary) {
      const parsed = parse_multipart(body, boundary);

      html_body = parsed.html;
      text_body = parsed.text;
      attachments = parsed.attachments;
    }
  } else if (content_type.includes("text/html")) {
    html_body = decode_body(body, encoding, charset);
  } else {
    text_body = decode_text_part(body, encoding, content_type);
  }

  return {
    message_id,
    from,
    to,
    cc,
    bcc,
    subject,
    date,
    date_inferred,
    html_body,
    text_body,
    attachments,
    raw_headers: headers,
  };
}

export async function parse_eml_file(file: File): Promise<ParseResult> {
  if (file.size > MAX_SINGLE_EMAIL_SIZE) {
    return {
      emails: [],
      errors: [
        get_active_translations()
          .errors.file_too_large.replace(
            "{{size}}",
            format_decimal(file.size / 1024 / 1024, 1),
          )
          .replace("{{limit}}", "50"),
      ],
      warnings: [],
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const decoded = new TextDecoder("iso-8859-1").decode(buffer);
    const text = file.name.toLowerCase().endsWith(".emlx")
      ? strip_emlx_wrapper(decoded)
      : decoded;
    const email = parse_eml(text);

    return { emails: [email], errors: [], warnings: [] };
  } catch (err) {
    return {
      emails: [],
      errors: [
        get_active_translations().errors.failed_parse_eml.replace(
          "{{error}}",
          err instanceof Error
            ? err.message
            : get_active_translations().errors.unknown_error,
        ),
      ],
      warnings: [],
    };
  }
}
