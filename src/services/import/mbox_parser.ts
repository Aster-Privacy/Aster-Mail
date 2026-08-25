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

import { get_active_translations } from "@/lib/i18n/translations";
import { MAX_FILE_SIZE, MAX_SINGLE_EMAIL_SIZE } from "./types";
import { parse_eml } from "./eml_parser";

const READ_CHUNK_BYTES = 8 * 1024 * 1024;

export async function parse_mbox_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        get_active_translations().errors.file_too_large.replace("{{size}}", (file.size / 1024 / 1024).toFixed(1)).replace("{{limit}}", "500"),
      ],
      warnings: [],
    };
  }

  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const decoder = new TextDecoder("iso-8859-1");

  let pending = "";
  let body_start = 0;
  let saw_separator = false;
  let count = 0;
  let bytes_read = 0;

  const emit = (raw_segment: string): void => {
    count++;

    const raw_email = raw_segment.trim().replace(/^>From /gm, "From ");

    if (raw_email.length > MAX_SINGLE_EMAIL_SIZE) {
      warnings.push(get_active_translations().errors.email_skipped_size.replace("{{number}}", String(count)));

      return;
    }

    if (raw_email.length === 0) return;

    try {
      emails.push(parse_eml(raw_email));
    } catch (err) {
      const error_msg = err instanceof Error ? err.message : get_active_translations().errors.unknown_error;

      errors.push(
        get_active_translations().errors.failed_parse_email.replace("{{number}}", String(count)).replace("{{error}}", error_msg),
      );
    }
  };

  const report = (): void => {
    if (!on_progress) return;

    const fraction = file.size > 0 ? bytes_read / file.size : 1;
    const estimated =
      fraction > 0 ? Math.max(count, Math.round(count / fraction)) : count;

    on_progress({
      current: count,
      total: estimated,
      percentage: Math.min(100, Math.round(fraction * 100)),
    });
  };

  for (let offset = 0; offset < file.size; offset += READ_CHUNK_BYTES) {
    const slice = file.slice(offset, Math.min(offset + READ_CHUNK_BYTES, file.size));

    pending += decoder.decode(new Uint8Array(await slice.arrayBuffer()));
    bytes_read = Math.min(offset + READ_CHUNK_BYTES, file.size);

    const separator_pattern = /^From [^\r\n]+\r?\n/gm;
    separator_pattern.lastIndex = body_start;

    let match;
    let progressed = false;

    while ((match = separator_pattern.exec(pending)) !== null) {
      if (saw_separator) {
        emit(pending.slice(body_start, match.index));
        progressed = true;
      }

      saw_separator = true;
      body_start = match.index + match[0].length;
      separator_pattern.lastIndex = body_start;
    }

    if (body_start > 0) {
      pending = pending.slice(body_start);
      body_start = 0;
    }

    if (progressed) report();
  }

  if (saw_separator) {
    emit(pending);
  } else if (/^From:/im.test(pending)) {
    emit(pending);
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
