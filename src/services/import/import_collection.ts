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
import { import_relative_path } from "./file_collection";
import {
  apply_export_metadata,
  build_export_metadata_index,
  is_export_sidecar_file,
} from "./export_metadata";

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
const GENERIC_MBOX_NAMES = new Set([
  "all mail including spam and trash",
  "mbox",
  "export",
]);
const MAILBOX_DIRECTORY_SUFFIX = /\.(sbd|mbox)$/i;
const MBOX_FILE_SUFFIX = /\.(mbox|mbx)$/i;
const PATH_SEPARATOR = /[\\/]/;

function path_segments(path: string): string[] {
  return path
    .split(PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function import_directory_folder(
  relative_path: string | undefined,
): string[] {
  if (!relative_path) return [];

  const segments = path_segments(relative_path);

  return segments
    .slice(1, -1)
    .map((segment) => segment.replace(MAILBOX_DIRECTORY_SUFFIX, "").trim())
    .filter((segment) => segment.length > 0);
}

export function mbox_source_folder(
  file_name: string,
  relative_path?: string,
): string | undefined {
  const directories = import_directory_folder(relative_path);
  const stem = file_name.replace(MBOX_FILE_SUFFIX, "").trim();
  const parent = path_segments(relative_path ?? "").slice(-2, -1)[0] ?? "";
  const bundle_name =
    directories.length === 0 &&
    stem.toLowerCase() === "mbox" &&
    /\.mbox$/i.test(parent)
      ? parent.replace(MAILBOX_DIRECTORY_SUFFIX, "").trim()
      : "";
  const leaf =
    bundle_name || (GENERIC_MBOX_NAMES.has(stem.toLowerCase()) ? "" : stem);
  const path = [...directories, ...(leaf ? [leaf] : [])].join("/");

  return path || undefined;
}

export function eml_source_folder(
  relative_path: string | undefined,
): string | undefined {
  const path = import_directory_folder(relative_path).join("/");

  return path || undefined;
}

function has_source_folder(email: ParsedEmail): boolean {
  return Boolean(
    email.source_folder ||
      email.source_labels?.length ||
      email.source_folders?.length,
  );
}

async function scan_mbox_file(
  file: File,
  on_progress: ParseProgressCallback | undefined,
  is_cancelled: () => boolean,
): Promise<MboxScan> {
  const translations = get_active_translations();
  const summaries: ParsedEmail[] = [];
  const ordinals: number[] = [];
  const warnings: string[] = [];
  const source_folder = mbox_source_folder(
    file.name,
    import_relative_path(file),
  );

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

    if (source_folder) summary.source_folder = source_folder;

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
    if (summary.source_folder) email.source_folder = summary.source_folder;

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
  const sidecar_files = files.filter((file) =>
    is_export_sidecar_file(file.name),
  );
  const mail_files =
    sidecar_files.length > 0
      ? files.filter((file) => !is_export_sidecar_file(file.name))
      : files;
  const export_index =
    sidecar_files.length > 0
      ? await build_export_metadata_index(sidecar_files, is_cancelled)
      : null;
  const single_file = mail_files.length === 1;

  for (let i = 0; i < mail_files.length; i++) {
    if (is_cancelled()) break;

    const file = mail_files[i];
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

      if (export_index) {
        for (const email of result.emails) {
          apply_export_metadata(email, file.name, export_index);
        }
      }

      const directory_folder = eml_source_folder(import_relative_path(file));

      if (directory_folder) {
        for (const email of result.emails) {
          if (!has_source_folder(email)) email.source_folder = directory_folder;
        }
      }

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
        total: mail_files.length,
        percentage: Math.round((current / mail_files.length) * 100),
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
