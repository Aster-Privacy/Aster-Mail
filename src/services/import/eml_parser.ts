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
  parse_multipart,
  generate_message_id,
} from "./mime_utils";

export function parse_eml(raw: string): ParsedEmail {
  const { headers: headers_raw, body } = split_header_body(raw);
  const headers = parse_headers(headers_raw);

  const message_id =
    headers["message-id"]?.replace(/[<>]/g, "") || generate_message_id();

  const from = headers["from"] || "";
  const to = parse_address_list(headers["to"] || "");
  const cc = parse_address_list(headers["cc"] || "");
  const subject = headers["subject"] || "(No Subject)";

  let date: Date;
  const date_header = headers["date"];

  if (date_header) {
    const parsed_date = new Date(date_header);

    date = isNaN(parsed_date.getTime()) ? new Date() : parsed_date;
  } else {
    date = new Date();
  }

  const content_type = headers["content-type"] || "text/plain";
  const encoding = headers["content-transfer-encoding"];

  let html_body: string | null = null;
  let text_body: string | null = null;
  let attachments: ParsedEmail["attachments"] = [];

  if (content_type.includes("multipart/")) {
    const boundary = extract_boundary(content_type);

    if (boundary) {
      const parsed = parse_multipart(body, boundary);

      html_body = parsed.html;
      text_body = parsed.text;
      attachments = parsed.attachments;
    }
  } else if (content_type.includes("text/html")) {
    html_body = decode_body(body, encoding);
  } else {
    text_body = decode_body(body, encoding);
  }

  return {
    message_id,
    from,
    to,
    cc,
    subject,
    date,
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
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`,
      ],
      warnings: [],
    };
  }

  try {
    const text = await file.text();
    const email = parse_eml(text);

    return { emails: [email], errors: [], warnings: [] };
  } catch (err) {
    return {
      emails: [],
      errors: [
        `Failed to parse EML: ${err instanceof Error ? err.message : "Unknown error"}`,
      ],
      warnings: [],
    };
  }
}
