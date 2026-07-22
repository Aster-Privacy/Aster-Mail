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

import { en } from "@/lib/i18n/translations/en";
import { MAX_FILE_SIZE, MAX_SINGLE_EMAIL_SIZE } from "./types";
import { parse_eml } from "./eml_parser";

const BYTE_F = 0x46;
const BYTE_R = 0x72;
const BYTE_O = 0x6f;
const BYTE_M = 0x6d;
const BYTE_SPACE = 0x20;
const BYTE_CR = 0x0d;
const BYTE_LF = 0x0a;

function match_from_line(bytes: Uint8Array, start: number): number | null {
  if (start + 5 > bytes.length) return null;
  if (bytes[start] !== BYTE_F) return null;
  if (bytes[start + 1] !== BYTE_R) return null;
  if (bytes[start + 2] !== BYTE_O) return null;
  if (bytes[start + 3] !== BYTE_M) return null;
  if (bytes[start + 4] !== BYTE_SPACE) return null;

  const content_start = start + 5;
  let j = content_start;

  while (j < bytes.length && bytes[j] !== BYTE_CR && bytes[j] !== BYTE_LF) {
    j++;
  }

  if (j === content_start) return null;

  let k = j;

  if (k < bytes.length && bytes[k] === BYTE_CR) k++;
  if (k >= bytes.length || bytes[k] !== BYTE_LF) return null;

  return k + 1;
}

const SCAN_CHUNK_SIZE = 16 * 1024 * 1024;
const PARSE_YIELD_INTERVAL = 200;

function yield_to_main_thread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function parse_mbox_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        en.errors.file_too_large.replace("{{size}}", (file.size / 1024 / 1024).toFixed(1)).replace("{{limit}}", String(Math.round(MAX_FILE_SIZE / 1024 / 1024))),
      ],
      warnings: [],
    };
  }

  const decoder = new TextDecoder("iso-8859-1");
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const message_starts: number[] = [];
  const separator_starts: number[] = [];

  let carry = new Uint8Array(0);
  let carry_file_offset = 0;
  let prefix_probe_text: string | null = null;

  for (let read_at = 0; read_at < file.size || read_at === 0; read_at += SCAN_CHUNK_SIZE) {
    const chunk_bytes = new Uint8Array(
      await file.slice(read_at, Math.min(read_at + SCAN_CHUNK_SIZE, file.size)).arrayBuffer(),
    );
    const buffer = new Uint8Array(carry.length + chunk_bytes.length);

    buffer.set(carry, 0);
    buffer.set(chunk_bytes, carry.length);

    if (read_at === 0) {
      prefix_probe_text = decoder.decode(buffer.subarray(0, Math.min(buffer.length, 65536)));
    }

    let pos = 0;

    while (pos <= buffer.length) {
      const match_end = match_from_line(buffer, pos);

      if (match_end !== null) {
        separator_starts.push(carry_file_offset + pos);
        message_starts.push(carry_file_offset + match_end);
        pos = match_end;
        continue;
      }

      const next_lf = buffer.indexOf(BYTE_LF, pos);

      if (next_lf === -1) break;
      pos = next_lf + 1;
    }

    carry_file_offset += pos;
    carry = buffer.slice(pos);
  }

  if (message_starts.length === 0) {
    const alt_pattern = /^From:/im;

    if (prefix_probe_text !== null && alt_pattern.test(prefix_probe_text)) {
      separator_starts.push(0);
      message_starts.push(0);
    }
  }

  const total = message_starts.length;

  if (total === 0) {
    return {
      emails: [],
      errors: [en.errors.no_emails_in_mbox],
      warnings: [],
    };
  }

  for (let i = 0; i < message_starts.length; i++) {
    const start = message_starts[i];
    const end = separator_starts[i + 1] ?? file.size;
    const segment_bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
    const raw_segment = decoder.decode(segment_bytes).trim();
    const raw_email = raw_segment.replace(/^>From /gm, "From ");

    if (raw_email.length > MAX_SINGLE_EMAIL_SIZE) {
      warnings.push(en.errors.email_skipped_size.replace("{{number}}", String(i + 1)));
      continue;
    }

    if (raw_email.length > 0) {
      try {
        const parsed = parse_eml(raw_email);

        emails.push(parsed);
      } catch (err) {
        const error_msg = err instanceof Error ? err.message : en.errors.unknown_error;

        errors.push(
          en.errors.failed_parse_email.replace("{{number}}", String(i + 1)).replace("{{error}}", error_msg),
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

    if (i % PARSE_YIELD_INTERVAL === 0) {
      await yield_to_main_thread();
    }
  }

  if (on_progress) {
    on_progress({ current: total, total, percentage: 100 });
  }

  return { emails, errors, warnings };
}
