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
import type { ParsedEmail, ParseProgressCallback } from "./types";

import { MAX_SINGLE_EMAIL_SIZE } from "./types";
import { parse_eml } from "./eml_parser";
import {
  iterate_mbox_segments,
  parse_mbox_header_summary,
} from "./mbox_parser";
import {
  is_mbox_import_file,
  is_valid_email,
  parse_import_file,
} from "./parser";

import { get_active_translations } from "@/lib/i18n/translations";

export type ImportLoadStatus = "ready" | "invalid" | "failed";

export interface ImportLoadItem {
  index: number;
  email: ParsedEmail | null;
  status: ImportLoadStatus;
}

export interface ImportCollection {
  summaries: ParsedEmail[];
  errors: string[];
  warnings: string[];
  load(indices: Set<number>): AsyncGenerator<ImportLoadItem>;
}

type ImportPart =
  | { kind: "memory"; start: number; emails: ParsedEmail[] }
  | { kind: "mbox"; start: number; file: File; ordinals: number[] };

interface MboxScan {
  summaries: ParsedEmail[];
  ordinals: number[];
  errors: string[];
  warnings: string[];
}

const GENERATED_MESSAGE_ID_SUFFIX = "@astermail.local";

async function scan_mbox_file(
  file: File,
  on_progress: ParseProgressCallback | undefined,
  is_cancelled: () => boolean,
): Promise<MboxScan> {
  const translations = get_active_translations();
  const summaries: ParsedEmail[] = [];
  const ordinals: number[] = [];
  const warnings: string[] = [];

  let ordinal = -1;
  let invalid_count = 0;
  let reported_ordinal = -1;

  const report = (bytes_read: number): void => {
    if (!on_progress || ordinal === reported_ordinal) return;

    reported_ordinal = ordinal;

    const count = ordinal + 1;
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
    if (is_cancelled()) break;

    ordinal++;

    if (raw_email.length > MAX_SINGLE_EMAIL_SIZE) {
      warnings.push(
        translations.errors.email_skipped_size.replace(
          "{{number}}",
          String(ordinal + 1),
        ),
      );
      continue;
    }

    if (raw_email.length === 0) continue;

    const summary = parse_mbox_header_summary(raw_email);

    if (!summary.from.trim()) {
      invalid_count++;
      continue;
    }

    summaries.push(summary);
    ordinals.push(ordinal);
  }

  if (ordinal === -1) {
    return {
      summaries,
      ordinals,
      errors: [translations.errors.no_emails_in_mbox],
      warnings,
    };
  }

  if (invalid_count > 0) {
    warnings.push(
      (summaries.length === 0
        ? translations.errors.all_emails_rejected
        : translations.errors.emails_skipped_invalid
      ).replace("{{count}}", String(invalid_count)),
    );
  }

  return { summaries, ordinals, errors: [], warnings };
}

function load_mbox_email(raw_email: string, summary: ParsedEmail) {
  try {
    const email = parse_eml(raw_email);

    if (
      email.message_id !== summary.message_id &&
      !summary.message_id.endsWith(GENERATED_MESSAGE_ID_SUFFIX)
    ) {
      return { email: null, status: "failed" as const };
    }

    email.message_id = summary.message_id;

    if (!is_valid_email(email)) {
      return { email: null, status: "invalid" as const };
    }

    return { email, status: "ready" as const };
  } catch {
    return { email: null, status: "failed" as const };
  }
}

export async function build_import_collection(
  files: File[],
  on_progress?: ParseProgressCallback,
  is_cancelled: () => boolean = () => false,
): Promise<ImportCollection> {
  const summaries: ParsedEmail[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const parts: ImportPart[] = [];
  const single_file = files.length === 1;

  for (let i = 0; i < files.length; i++) {
    if (is_cancelled()) break;

    const file = files[i];
    const file_progress = single_file ? on_progress : undefined;
    const start = summaries.length;

    if (await is_mbox_import_file(file)) {
      const scan = await scan_mbox_file(file, file_progress, is_cancelled);

      summaries.push(...scan.summaries);
      errors.push(...scan.errors);
      warnings.push(...scan.warnings);

      if (scan.summaries.length > 0) {
        parts.push({ kind: "mbox", start, file, ordinals: scan.ordinals });
      }
    } else {
      const result = await parse_import_file(file, file_progress);

      summaries.push(...result.emails);
      errors.push(...result.errors);
      warnings.push(...result.warnings);

      if (result.emails.length > 0) {
        parts.push({ kind: "memory", start, emails: result.emails });
      }
    }

    if (!single_file && on_progress) {
      const current = i + 1;

      on_progress({
        current,
        total: files.length,
        percentage: Math.round((current / files.length) * 100),
      });
    }
  }

  async function* load(indices: Set<number>): AsyncGenerator<ImportLoadItem> {
    for (const part of parts) {
      if (part.kind === "memory") {
        for (let j = 0; j < part.emails.length; j++) {
          const index = part.start + j;

          if (indices.has(index)) {
            yield { index, email: part.emails[j], status: "ready" };
          }
        }
        continue;
      }

      const wanted = new Map<number, number>();

      part.ordinals.forEach((ordinal, j) => {
        if (indices.has(part.start + j)) wanted.set(ordinal, part.start + j);
      });

      if (wanted.size === 0) continue;

      let ordinal = -1;
      let remaining = wanted.size;

      for await (const raw_email of iterate_mbox_segments(part.file)) {
        ordinal++;

        const index = wanted.get(ordinal);

        if (index === undefined) continue;

        yield { index, ...load_mbox_email(raw_email, summaries[index]) };

        remaining--;
        if (remaining === 0) break;
      }
    }
  }

  return { summaries, errors, warnings, load };
}
