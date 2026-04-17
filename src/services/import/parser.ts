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
export type {
  ParsedAttachment,
  ParsedEmail,
  ParseProgress,
  ParseProgressCallback,
  ParseResult,
} from "./types";

export { parse_eml, parse_eml_file } from "./eml_parser";
export { parse_mbox_file } from "./mbox_parser";
export { parse_csv_file } from "./csv_parser";
export { parse_pst_file } from "./pst_parser";
export { extract_email_address } from "./mime_utils";

import type { ParsedEmail, ParseResult, ParseProgressCallback } from "./types";

import { parse_mbox_file } from "./mbox_parser";
import { parse_eml_file } from "./eml_parser";
import { parse_csv_file } from "./csv_parser";
import { parse_pst_file } from "./pst_parser";
import { extract_email_address } from "./mime_utils";

const HASH_ALG = ["SHA", "256"].join("-");

const REJECTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".wav",
  ".flac",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".bin",
  ".iso",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);

async function read_file_start(file: File, bytes: number): Promise<string> {
  const slice = file.slice(0, bytes);

  try {
    return await slice.text();
  } catch {
    return "";
  }
}

async function detect_file_format(
  file: File,
): Promise<"mbox" | "eml" | "csv" | "pst" | "unknown"> {
  const filename = file.name.toLowerCase();

  if (filename.endsWith(".mbox") || filename.endsWith(".mbx")) return "mbox";
  if (filename.endsWith(".eml")) return "eml";
  if (filename.endsWith(".csv") || filename.endsWith(".tsv")) return "csv";
  if (filename.endsWith(".pst") || filename.endsWith(".ost")) return "pst";

  const content_start = await read_file_start(file, 500);

  if (
    content_start.startsWith("From ") ||
    /^From [^\r\n]+\r?\n/m.test(content_start)
  ) {
    return "mbox";
  }

  if (
    content_start.includes("Message-ID:") ||
    content_start.includes("From:") ||
    content_start.includes("MIME-Version:")
  ) {
    return "eml";
  }

  const first_line = content_start.split(/\r?\n/)[0] || "";
  const comma_count = (first_line.match(/,/g) || []).length;

  if (comma_count >= 2 && first_line.length < 500) {
    const lower = first_line.toLowerCase();

    if (
      lower.includes("from") ||
      lower.includes("to") ||
      lower.includes("subject") ||
      lower.includes("email")
    ) {
      return "csv";
    }
  }

  return "unknown";
}

function is_valid_email(email: ParsedEmail): boolean {
  const has_from = email.from.trim().length > 0;
  const has_subject =
    email.subject.trim().length > 0 && email.subject !== "(No Subject)";
  const has_text = (email.text_body ?? "").trim().length > 0;
  const has_html = (email.html_body ?? "").trim().length > 0;
  const has_body = has_text || has_html;

  if (!has_from) return false;
  if (!has_subject && !has_body) return false;

  return true;
}

function filter_valid_emails(result: ParseResult): ParseResult {
  const valid: ParsedEmail[] = [];
  let skipped = 0;

  for (const email of result.emails) {
    if (is_valid_email(email)) {
      valid.push(email);
    } else {
      skipped++;
    }
  }

  const warnings = [...result.warnings];

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} email(s) with no sender or no content.`);
  }

  return { emails: valid, errors: result.errors, warnings };
}

export async function parse_import_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  const ext = file.name.toLowerCase().replace(/^.*(\.[^.]+)$/, "$1");

  if (REJECTED_EXTENSIONS.has(ext)) {
    return {
      emails: [],
      errors: [
        `"${file.name}" is not a supported email file. Supported formats: MBOX, EML, CSV, PST.`,
      ],
      warnings: [],
    };
  }

  const format = await detect_file_format(file);

  let result: ParseResult;

  switch (format) {
    case "mbox":
      result = await parse_mbox_file(file, on_progress);
      break;
    case "eml":
      result = await parse_eml_file(file);
      break;
    case "csv":
      result = await parse_csv_file(file, on_progress);
      break;
    case "pst":
      result = await parse_pst_file(file, on_progress);
      break;
    default:
      return {
        emails: [],
        errors: [
          `Could not detect file format for: ${file.name}. Supported formats: MBOX, EML, CSV, PST. Try renaming your file with the correct extension.`,
        ],
        warnings: [],
      };
  }

  return filter_valid_emails(result);
}

export async function compute_message_id_hash(
  message_id: string,
): Promise<string> {
  const hash = await crypto.subtle.digest(
    HASH_ALG,
    new TextEncoder().encode(message_id),
  );
  const bytes = new Uint8Array(hash);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function extract_sender_email(from: string): string {
  return extract_email_address(from);
}

export function extract_sender_name(from: string): string {
  if (!from) return "";
  const match = from.match(/^([^<]+)</);

  if (match) return match[1].trim().replace(/["']/g, "");
  const email_match = from.match(/[\w.+-]+@[\w.-]+\.\w+/);

  if (email_match) {
    const parts = email_match[0].split("@");

    return parts[0].replace(/[._]/g, " ");
  }

  return from;
}
