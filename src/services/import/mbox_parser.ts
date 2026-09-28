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
import type { ParsedEmail, ParseResult, ParseProgressCallback } from "./types";

import { MAX_FILE_SIZE, MAX_SINGLE_EMAIL_SIZE } from "./types";
import { parse_eml } from "./eml_parser";
import {
  split_header_body,
  parse_headers,
  generate_message_id,
} from "./mime_utils";

import { get_active_translations } from "@/lib/i18n/translations";
import { format_decimal } from "@/lib/utils";

const READ_CHUNK_BYTES = 8 * 1024 * 1024;

const SUMMARY_HEADER_KEYS = ["in-reply-to", "references", "x-gmail-labels"];

function detach_string(value: string): string {
  return JSON.parse(JSON.stringify(value)) as string;
}

function clean_segment(segment: string): string {
  return segment.trim().replace(/^>From /gm, "From ");
}

export async function* iterate_mbox_segments(
  file: File,
  on_bytes_read?: (bytes_read: number) => void,
): AsyncGenerator<string> {
  const decoder = new TextDecoder("iso-8859-1");

  let pending = "";
  let body_start = 0;
  let saw_separator = false;

  for (let offset = 0; offset < file.size; offset += READ_CHUNK_BYTES) {
    const slice = file.slice(
      offset,
      Math.min(offset + READ_CHUNK_BYTES, file.size),
    );

    pending += decoder.decode(new Uint8Array(await slice.arrayBuffer()));

    const separator_pattern = /^From [^\r\n]+\r?\n/gm;
    const segments: string[] = [];

    separator_pattern.lastIndex = body_start;

    let match;

    while ((match = separator_pattern.exec(pending)) !== null) {
      if (saw_separator) {
        segments.push(pending.slice(body_start, match.index));
      }

      saw_separator = true;
      body_start = match.index + match[0].length;
      separator_pattern.lastIndex = body_start;
    }

    if (body_start > 0) {
      pending = pending.slice(body_start);
      body_start = 0;
    }

    for (const segment of segments) {
      yield clean_segment(segment);
    }

    on_bytes_read?.(Math.min(offset + READ_CHUNK_BYTES, file.size));
  }

  if (saw_separator || /^From:/im.test(pending)) {
    yield clean_segment(pending);
  }
}

export function parse_mbox_header_summary(raw_email: string): ParsedEmail {
  const headers = parse_headers(split_header_body(raw_email).headers);
  const raw_headers: Record<string, string> = {};

  for (const key of SUMMARY_HEADER_KEYS) {
    if (headers[key]) raw_headers[key] = detach_string(headers[key]);
  }

  return {
    message_id: detach_string(
      headers["message-id"]?.replace(/[<>]/g, "") || generate_message_id(),
    ),
    from: detach_string(headers["from"] || ""),
    to: [],
    cc: [],
    bcc: [],
    subject: detach_string(headers["subject"] || ""),
    date: new Date(0),
    date_inferred: true,
    html_body: null,
    text_body: null,
    attachments: [],
    raw_headers,
  };
}

export async function parse_mbox_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        get_active_translations()
          .errors.file_too_large.replace(
            "{{size}}",
            format_decimal(file.size / 1024 / 1024, 1),
          )
          .replace("{{limit}}", "500"),
      ],
      warnings: [],
    };
  }

  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let count = 0;
  let reported_count = 0;

  const report = (bytes_read: number): void => {
    if (!on_progress || count === reported_count) return;

    reported_count = count;

    const fraction = file.size > 0 ? bytes_read / file.size : 1;
    const estimated =
      fraction > 0 ? Math.max(count, Math.round(count / fraction)) : count;

    on_progress({
      current: count,
      total: estimated,
      percentage: Math.min(100, Math.round(fraction * 100)),
    });
  };

  for await (const raw_email of iterate_mbox_segments(file, report)) {
    count++;

    if (raw_email.length > MAX_SINGLE_EMAIL_SIZE) {
      warnings.push(
        get_active_translations().errors.email_skipped_size.replace(
          "{{number}}",
          String(count),
        ),
      );
      continue;
    }

    if (raw_email.length === 0) continue;

    try {
      emails.push(parse_eml(raw_email));
    } catch (err) {
      const error_msg =
        err instanceof Error
          ? err.message
          : get_active_translations().errors.unknown_error;
      const number = count;

      errors.push(
        get_active_translations()
          .errors.failed_parse_email.replace("{{number}}", () => String(number))
          .replace("{{error}}", () => error_msg),
      );
    }
  }

  if (count === 0) {
    return {
      emails: [],
      errors: [get_active_translations().errors.no_emails_in_mbox],
      warnings: [],
    };
  }

  if (on_progress) {
    on_progress({ current: count, total: count, percentage: 100 });
  }

  return { emails, errors, warnings };
}
