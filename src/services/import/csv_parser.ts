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
import type {
  ParsedEmail,
  ParseResult,
  ParseProgressCallback,
  CsvRow,
} from "./types";

import { en } from "@/lib/i18n/translations/en";
import { MAX_FILE_SIZE } from "./types";
import { secure_hex } from "./mime_utils";

function parse_csv_line(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let in_quotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next_char = line[i + 1];

    if (char === '"') {
      if (in_quotes && next_char === '"') {
        current += '"';
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (char === "," && !in_quotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

function parse_csv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) return [];

  const headers = parse_csv_line(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parse_csv_line(lines[i]);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return rows;
}

function find_column(row: CsvRow, ...candidates: string[]): string {
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();

    for (const key of Object.keys(row)) {
      if (key.toLowerCase().includes(lower)) {
        return row[key] || "";
      }
    }
  }

  return "";
}

function csv_row_to_email(row: CsvRow, index: number): ParsedEmail | null {
  const from =
    find_column(row, "from", "sender", "from_email", "sender_email") ||
    find_column(row, "from_address", "email_from");
  const to_raw =
    find_column(row, "to", "recipient", "to_email", "recipients") ||
    find_column(row, "to_address", "email_to");
  const subject =
    find_column(row, "subject", "title", "email_subject") || "(No Subject)";
  const body =
    find_column(row, "body", "content", "message", "text", "email_body") ||
    find_column(row, "html_body", "text_body", "plain_text", "html");
  const date_str =
    find_column(row, "date", "sent", "received", "timestamp") ||
    find_column(row, "sent_at", "received_at", "created_at");
  const cc_raw = find_column(row, "cc", "carbon_copy");
  const bcc_raw = find_column(row, "bcc", "blind_carbon_copy");

  if (!from && !to_raw && !body) {
    return null;
  }

  let date: Date;

  if (date_str) {
    const parsed = new Date(date_str);

    date = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    date = new Date();
  }

  const to = to_raw
    ? to_raw
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean)
    : [];
  const cc = cc_raw
    ? cc_raw
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean)
    : [];
  const bcc = bcc_raw
    ? bcc_raw
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  const message_id = `csv-import-${index}-${Date.now().toString(36)}-${secure_hex(4)}@astermail.local`;

  const is_html = body.includes("<") && body.includes(">");

  return {
    message_id,
    from: from || "unknown@unknown.com",
    to,
    cc,
    bcc,
    subject,
    date,
    html_body: is_html ? body : null,
    text_body: is_html ? null : body,
    attachments: [],
    raw_headers: {},
  };
}

export async function parse_csv_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        en.errors.file_too_large.replace("{{ size }}", (file.size / 1024 / 1024).toFixed(1)).replace("{{ limit }}", "500"),
      ],
      warnings: [],
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const content = new TextDecoder("iso-8859-1").decode(buffer);
    const rows = parse_csv(content);

    if (rows.length === 0) {
      return {
        emails: [],
        errors: [en.errors.no_data_in_csv],
        warnings: [],
      };
    }

    const emails: ParsedEmail[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const email = csv_row_to_email(rows[i], i);

      if (email) {
        emails.push(email);
      } else {
        warnings.push(en.errors.row_skipped.replace("{{ number }}", String(i + 2)));
      }

      if (on_progress && i % 100 === 0) {
        on_progress({
          current: i + 1,
          total: rows.length,
          percentage: Math.round(((i + 1) / rows.length) * 100),
        });
      }
    }

    if (on_progress) {
      on_progress({
        current: rows.length,
        total: rows.length,
        percentage: 100,
      });
    }

    if (emails.length === 0) {
      errors.push(en.errors.no_valid_emails_csv);
    }

    return { emails, errors, warnings };
  } catch (err) {
    const error_msg = err instanceof Error ? err.message : en.errors.unknown_error;

    return {
      emails: [],
      errors: [
        en.errors.failed_parse_csv.replace("{{ error }}", error_msg),
      ],
      warnings: [],
    };
  }
}
