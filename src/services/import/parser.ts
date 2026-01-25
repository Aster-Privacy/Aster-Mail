export interface ParsedAttachment {
  filename: string;
  content_type: string;
  content: Uint8Array;
  size: number;
}

export interface ParsedEmail {
  message_id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  html_body: string | null;
  text_body: string | null;
  attachments: ParsedAttachment[];
  raw_headers: Record<string, string>;
}

export interface ParseProgress {
  current: number;
  total: number;
  percentage: number;
}

export type ParseProgressCallback = (progress: ParseProgress) => void;

export interface ParseResult {
  emails: ParsedEmail[];
  errors: string[];
  warnings: string[];
}

interface PstAttachment {
  filename?: string;
  fileInputStream?: { read(): Uint8Array | number[] };
  mimeTag?: string;
  attachSize?: number;
}

interface PstMessage {
  internetMessageId?: string;
  senderEmailAddress?: string;
  senderName?: string;
  displayTo?: string;
  displayCC?: string;
  subject?: string;
  clientSubmitTime?: Date;
  messageDeliveryTime?: Date;
  bodyHTML?: string;
  body?: string;
  hasAttachments?: boolean;
  numberOfAttachments?: number;
  getAttachment(index: number): PstAttachment;
}

interface PstFolder {
  contentCount: number;
  hasSubfolders: boolean;
  getNextChild(): PstMessage | null;
  getSubFolders(): PstFolder[];
}

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_SINGLE_EMAIL_SIZE = 50 * 1024 * 1024;

function decode_quoted_printable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

function decode_base64_safe(input: string): string {
  try {
    const cleaned = input.replace(/[\r\n\s]/g, "");

    if (cleaned.length === 0) return "";

    return atob(cleaned);
  } catch {
    return input;
  }
}

function decode_mime_word(word: string): string {
  const match = word.match(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/);

  if (!match) return word;

  const [, charset, encoding, content] = match;

  try {
    if (encoding.toLowerCase() === "b") {
      const decoded = decode_base64_safe(content);

      if (charset.toLowerCase().includes("utf-8")) {
        return new TextDecoder("utf-8").decode(
          new Uint8Array([...decoded].map((c) => c.charCodeAt(0))),
        );
      }

      return decoded;
    } else if (encoding.toLowerCase() === "q") {
      return decode_quoted_printable(content.replace(/_/g, " "));
    }
  } catch {
    return word;
  }

  return word;
}

function decode_header(value: string): string {
  if (!value) return "";

  return value.replace(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g, decode_mime_word);
}

function parse_address_list(value: string): string[] {
  if (!value) return [];
  const decoded = decode_header(value);

  return decoded
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

function extract_email_address(value: string): string {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);

  if (match) return match[1];
  const emailMatch = value.match(/[\w.+-]+@[\w.-]+\.\w+/);

  return emailMatch ? emailMatch[0] : value.trim();
}

function extract_boundary(content_type: string): string | null {
  const match = content_type.match(/boundary=["']?([^"';\s]+)["']?/i);

  return match ? match[1] : null;
}

function split_header_body(raw: string): { headers: string; body: string } {
  const crlf_index = raw.indexOf("\r\n\r\n");

  if (crlf_index !== -1) {
    return {
      headers: raw.substring(0, crlf_index),
      body: raw.substring(crlf_index + 4),
    };
  }
  const lf_index = raw.indexOf("\n\n");

  if (lf_index !== -1) {
    return {
      headers: raw.substring(0, lf_index),
      body: raw.substring(lf_index + 2),
    };
  }

  return { headers: raw, body: "" };
}

function parse_headers(headers_raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headers_raw.split(/\r?\n/);
  let current_key = "";
  let current_value = "";

  for (const line of lines) {
    if (line.match(/^\s+/) && current_key) {
      current_value += " " + line.trim();
    } else {
      if (current_key) {
        headers[current_key.toLowerCase()] = decode_header(current_value);
      }
      const colon_index = line.indexOf(":");

      if (colon_index > 0) {
        current_key = line.substring(0, colon_index).trim();
        current_value = line.substring(colon_index + 1).trim();
      }
    }
  }
  if (current_key) {
    headers[current_key.toLowerCase()] = decode_header(current_value);
  }

  return headers;
}

function decode_body(body: string, encoding: string | undefined): string {
  if (!encoding) return body;
  const enc = encoding.toLowerCase();

  if (enc === "quoted-printable") {
    return decode_quoted_printable(body);
  } else if (enc === "base64") {
    return decode_base64_safe(body);
  }

  return body;
}

function parse_multipart(
  body: string,
  boundary: string,
): {
  html: string | null;
  text: string | null;
  attachments: ParsedAttachment[];
} {
  const escaped_boundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`--${escaped_boundary}`));
  let html: string | null = null;
  let text: string | null = null;
  const attachments: ParsedAttachment[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed === "" || trimmed === "--") continue;

    const { headers: part_headers_raw, body: part_body } =
      split_header_body(part);
    const part_headers = parse_headers(part_headers_raw);
    const content_type = part_headers["content-type"] || "text/plain";
    const encoding = part_headers["content-transfer-encoding"];
    const disposition = part_headers["content-disposition"] || "";

    if (
      disposition.includes("attachment") ||
      disposition.includes("filename")
    ) {
      const filename_match =
        disposition.match(/filename=["']?([^"';\n]+)["']?/i) ||
        content_type.match(/name=["']?([^"';\n]+)["']?/i);

      const filename = filename_match
        ? decode_header(filename_match[1].trim())
        : "attachment";

      let content: Uint8Array;

      if (encoding?.toLowerCase() === "base64") {
        try {
          const binary = atob(part_body.replace(/[\r\n\s]/g, ""));

          content = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            content[i] = binary.charCodeAt(i);
          }
        } catch {
          content = new TextEncoder().encode(part_body);
        }
      } else {
        content = new TextEncoder().encode(part_body);
      }

      attachments.push({
        filename,
        content_type: content_type.split(";")[0].trim(),
        content,
        size: content.length,
      });
    } else if (content_type.includes("text/html") && !html) {
      html = decode_body(part_body, encoding);
    } else if (content_type.includes("text/plain") && !text) {
      text = decode_body(part_body, encoding);
    } else if (content_type.includes("multipart/")) {
      const nested_boundary = extract_boundary(content_type);

      if (nested_boundary) {
        const nested = parse_multipart(part_body, nested_boundary);

        if (!html && nested.html) html = nested.html;
        if (!text && nested.text) text = nested.text;
        attachments.push(...nested.attachments);
      }
    }
  }

  return { html, text, attachments };
}

function generate_message_id(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);

  return `imported-${timestamp}-${random}@astermail.local`;
}

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
  let attachments: ParsedAttachment[] = [];

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

interface CsvRow {
  [key: string]: string;
}

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

  const message_id = `csv-import-${index}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}@astermail.local`;

  const is_html = body.includes("<") && body.includes(">");

  return {
    message_id,
    from: from || "unknown@unknown.com",
    to,
    cc,
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
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 500MB limit`,
      ],
      warnings: [],
    };
  }

  try {
    const content = await file.text();
    const rows = parse_csv(content);

    if (rows.length === 0) {
      return {
        emails: [],
        errors: ["No data found in CSV file"],
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
        warnings.push(`Row ${i + 2} skipped: insufficient data`);
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
      errors.push(
        "No valid emails found. CSV should have columns like: from, to, subject, body, date",
      );
    }

    return { emails, errors, warnings };
  } catch (err) {
    return {
      emails: [],
      errors: [
        `Failed to parse CSV: ${err instanceof Error ? err.message : "Unknown error"}`,
      ],
      warnings: [],
    };
  }
}

export async function parse_pst_file(
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

  try {
    const { PSTFile } = await import("pst-extractor");
    const buffer = await file.arrayBuffer();
    const pst = new PSTFile(Buffer.from(buffer));

    const emails: ParsedEmail[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let processed = 0;
    let total_estimate = 100;

    const process_folder = (folder: PstFolder) => {
      if (folder.contentCount > 0) {
        total_estimate = Math.max(
          total_estimate,
          processed + folder.contentCount * 2,
        );
        let message = folder.getNextChild();

        while (message !== null) {
          try {
            const parsed = convert_pst_message(message, processed);

            emails.push(parsed);
          } catch (err) {
            warnings.push(
              `Failed to parse PST message: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
          processed++;
          if (on_progress && processed % 10 === 0) {
            on_progress({
              current: processed,
              total: total_estimate,
              percentage: Math.min(
                95,
                Math.round((processed / total_estimate) * 100),
              ),
            });
          }
          message = folder.getNextChild();
        }
      }

      if (folder.hasSubfolders) {
        const subfolders = folder.getSubFolders();

        for (const subfolder of subfolders) {
          process_folder(subfolder);
        }
      }
    };

    const root = pst.getRootFolder();

    process_folder(root);

    if (on_progress) {
      on_progress({ current: processed, total: processed, percentage: 100 });
    }

    if (emails.length === 0) {
      errors.push("No emails found in PST file");
    }

    return { emails, errors, warnings };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : "Unknown error";

    if (
      error_message.includes("Buffer") ||
      error_message.includes("not defined")
    ) {
      return {
        emails: [],
        errors: [
          "PST files require conversion. Please export your emails from Outlook as MBOX format instead, or use individual EML files.",
        ],
        warnings: [],
      };
    }

    return {
      emails: [],
      errors: [
        `Failed to parse PST file: ${error_message}. Try exporting as MBOX format from your email client.`,
      ],
      warnings: [],
    };
  }
}

function convert_pst_message(msg: PstMessage, index: number): ParsedEmail {
  const message_id =
    msg.internetMessageId ||
    `pst-import-${index}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}@astermail.local`;

  const from = msg.senderEmailAddress
    ? msg.senderName
      ? `${msg.senderName} <${msg.senderEmailAddress}>`
      : msg.senderEmailAddress
    : "unknown@unknown.com";

  const to: string[] = [];
  const cc: string[] = [];

  if (msg.displayTo) {
    to.push(
      ...msg.displayTo
        .split(";")
        .map((e: string) => e.trim())
        .filter(Boolean),
    );
  }
  if (msg.displayCC) {
    cc.push(
      ...msg.displayCC
        .split(";")
        .map((e: string) => e.trim())
        .filter(Boolean),
    );
  }

  const subject = msg.subject || "(No Subject)";
  const date = msg.clientSubmitTime || msg.messageDeliveryTime || new Date();

  const html_body = msg.bodyHTML || null;
  const text_body = msg.body || null;

  const attachments: ParsedAttachment[] = [];
  const attachment_count = msg.numberOfAttachments ?? 0;

  if (msg.hasAttachments && attachment_count > 0) {
    for (let i = 0; i < attachment_count; i++) {
      try {
        const att = msg.getAttachment(i);

        if (att && att.filename) {
          const content = att.fileInputStream?.read() || new Uint8Array(0);

          attachments.push({
            filename: att.filename,
            content_type: att.mimeTag || "application/octet-stream",
            content:
              content instanceof Uint8Array ? content : new Uint8Array(content),
            size: att.attachSize || content.length,
          });
        }
      } catch {
        // Skip attachment if we can't read it
      }
    }
  }

  return {
    message_id: message_id.replace(/[<>]/g, ""),
    from,
    to,
    cc,
    subject,
    date: date instanceof Date ? date : new Date(date),
    html_body,
    text_body,
    attachments,
    raw_headers: {},
  };
}

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

export async function parse_import_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  const format = await detect_file_format(file);

  switch (format) {
    case "mbox":
      return parse_mbox_file(file, on_progress);
    case "eml":
      return parse_eml_file(file);
    case "csv":
      return parse_csv_file(file, on_progress);
    case "pst":
      return parse_pst_file(file, on_progress);
    default:
      return {
        emails: [],
        errors: [
          `Could not detect file format for: ${file.name}. Supported formats: MBOX, EML, CSV, PST. Try renaming your file with the correct extension.`,
        ],
        warnings: [],
      };
  }
}

export async function compute_message_id_hash(
  message_id: string,
): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
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
  const emailMatch = from.match(/[\w.+-]+@[\w.-]+\.\w+/);

  if (emailMatch) {
    const parts = emailMatch[0].split("@");

    return parts[0].replace(/[._]/g, " ");
  }

  return from;
}
