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

export async function parse_mbox_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 500MB limit`,
      ],
      warnings: [],
    };
  }

  const text = await file.text();
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const message_starts: number[] = [];
  const from_pattern = /^From [^\r\n]+\r?\n/gm;
  let match;

  while ((match = from_pattern.exec(text)) !== null) {
    message_starts.push(match.index + match[0].length);
  }

  if (message_starts.length === 0) {
    const alt_pattern = /^From:/im;

    if (alt_pattern.test(text)) {
      message_starts.push(0);
    }
  }

  const total = message_starts.length;

  if (total === 0) {
    return {
      emails: [],
      errors: ["No emails found in MBOX file"],
      warnings: [],
    };
  }

  for (let i = 0; i < message_starts.length; i++) {
    const start = message_starts[i];
    const end = message_starts[i + 1] ?? text.length;
    const raw_email = text.substring(start, end).trim();

    if (raw_email.length > MAX_SINGLE_EMAIL_SIZE) {
      warnings.push(`Email ${i + 1} skipped: exceeds 50MB size limit`);
      continue;
    }

    if (raw_email.length > 0) {
      try {
        const parsed = parse_eml(raw_email);

        emails.push(parsed);
      } catch (err) {
        errors.push(
          `Failed to parse email ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    if (on_progress && i % 10 === 0) {
      on_progress({
        current: i + 1,
        total,
        percentage: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  if (on_progress) {
    on_progress({ current: total, total, percentage: 100 });
  }

  return { emails, errors, warnings };
}
