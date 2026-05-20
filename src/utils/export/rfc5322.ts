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
import type { DecryptedEnvelope } from "@/types/email";
import {
  emit_address_header,
  emit_header,
  emit_raw_header_passthrough,
  emit_unstructured_header,
  filename_param,
  format_rfc5322_date,
  generate_message_id,
  header_is_body_owned,
  header_is_verbatim_candidate,
  type Address,
} from "./headers";
import {
  base64_encode_stream,
  classify_text_encoding,
  quoted_printable_encode,
} from "./mime_encoders";
import { safe_boundary_for } from "./boundary";

export interface ExportAttachment {
  filename: string;
  mime_type: string;
  size?: number;
  is_inline?: boolean;
  content_id?: string;
  open(): AsyncIterable<Uint8Array> | Uint8Array;
}

export interface SerializeOptions {
  generate_message_id_if_missing?: boolean;
  drop_bcc?: boolean;
  is_sent_or_draft?: boolean;
}

const CRLF = "\r\n";
const enc = new TextEncoder();

function bytes(s: string): Uint8Array {
  return enc.encode(s);
}

function normalize_crlf(s: string): string {
  return s.replace(/\r\n|\r|\n/g, CRLF);
}

function any_unsafe_for_7bit(text: string): boolean {
  return classify_text_encoding(enc.encode(text)) !== "7bit";
}

function pick_text_encoding(text: string): "7bit" | "quoted-printable" {
  return any_unsafe_for_7bit(text) ? "quoted-printable" : "7bit";
}

function emit_text_body(text: string, encoding: "7bit" | "quoted-printable"): Uint8Array {
  const normalized = normalize_crlf(text);
  if (encoding === "7bit") return bytes(normalized);
  return bytes(quoted_printable_encode(normalized));
}

function html_to_text_fallback(html: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return stripped.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

interface BuiltHeaders {
  message_id: string;
  date: string;
  emitted_names: Set<string>;
  out: string;
}

function build_envelope_headers(
  env: DecryptedEnvelope,
  opts: SerializeOptions,
): BuiltHeaders {
  const emitted_names = new Set<string>();
  const parts: string[] = [];

  const raw_message_id = (env.raw_headers ?? []).find(
    (h) => h.name.toLowerCase() === "message-id",
  )?.value?.trim();
  const message_id =
    raw_message_id && raw_message_id.length > 0
      ? raw_message_id.startsWith("<") ? raw_message_id : `<${raw_message_id}>`
      : generate_message_id();

  const date = format_rfc5322_date(env.sent_at);

  const REPEATABLE = new Set([
    "received",
    "resent-from", "resent-to", "resent-cc", "resent-bcc",
    "resent-date", "resent-message-id", "resent-sender",
    "arc-seal", "arc-message-signature", "arc-authentication-results",
    "dkim-signature", "authentication-results",
    "x-original-to", "delivered-to",
  ]);
  for (const h of env.raw_headers ?? []) {
    const lower = h.name.toLowerCase();
    if (header_is_body_owned(lower)) continue;
    if (!header_is_verbatim_candidate(lower)) continue;
    if (lower === "message-id") continue;
    if (!REPEATABLE.has(lower) && emitted_names.has(lower)) continue;
    parts.push(emit_raw_header_passthrough(h.name, h.value));
    emitted_names.add(lower);
  }

  if (!emitted_names.has("message-id")) {
    parts.push(emit_header("Message-ID", message_id));
    emitted_names.add("message-id");
  }

  parts.push(emit_header("Date", date));
  emitted_names.add("date");

  if (env.from && env.from.email) {
    parts.push(emit_address_header("From", [env.from as Address]));
    emitted_names.add("from");
  }
  if (env.to && env.to.length > 0) {
    parts.push(emit_address_header("To", env.to as Address[]));
    emitted_names.add("to");
  }
  if (env.cc && env.cc.length > 0) {
    parts.push(emit_address_header("Cc", env.cc as Address[]));
    emitted_names.add("cc");
  }
  if (env.bcc && env.bcc.length > 0 && opts.is_sent_or_draft && !opts.drop_bcc) {
    parts.push(emit_address_header("Bcc", env.bcc as Address[]));
    emitted_names.add("bcc");
  }
  parts.push(emit_unstructured_header("Subject", env.subject ?? ""));
  emitted_names.add("subject");

  return { message_id, date, emitted_names, out: parts.join("") };
}

function partition_attachments(
  atts: ExportAttachment[],
  html: string | null,
): { inline: ExportAttachment[]; regular: ExportAttachment[] } {
  if (!html) return { inline: [], regular: atts };
  const inline: ExportAttachment[] = [];
  const regular: ExportAttachment[] = [];
  for (const a of atts) {
    if (a.is_inline && a.content_id && html.includes(`cid:${a.content_id}`)) {
      inline.push(a);
    } else {
      regular.push(a);
    }
  }
  return { inline, regular };
}

async function* emit_attachment_part(
  att: ExportAttachment,
): AsyncGenerator<Uint8Array> {
  const cid_header = att.content_id ? `Content-ID: <${att.content_id}>\r\n` : "";
  const disposition = att.is_inline ? "inline" : "attachment";
  yield bytes(
    `Content-Type: ${att.mime_type || "application/octet-stream"}; name="${
      att.filename.replace(/[\r\n"\\]/g, "_").slice(0, 200)
    }"\r\n` +
      cid_header +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: ${disposition}; ${filename_param(att.filename)}\r\n\r\n`,
  );
  const opened = att.open();
  const source: AsyncIterable<Uint8Array> =
    opened instanceof Uint8Array
      ? (async function* () { yield opened; })()
      : opened;
  for await (const chunk of base64_encode_stream(source)) yield chunk;
}

function* emit_text_part(
  mime_type: string,
  text: string,
): Generator<Uint8Array> {
  const encoding = pick_text_encoding(text);
  yield bytes(
    `Content-Type: ${mime_type}; charset=utf-8\r\n` +
      `Content-Transfer-Encoding: ${encoding}\r\n\r\n`,
  );
  yield emit_text_body(text, encoding);
  yield bytes(CRLF);
}

export async function* serialize_envelope(
  env: DecryptedEnvelope,
  attachments: ExportAttachment[] = [],
  opts: SerializeOptions = {},
): AsyncGenerator<Uint8Array> {
  const text_body = env.text_body ?? env.body_text ?? "";
  const html_body =
    (env.html_body ?? env.body_html ?? null) || null;
  const has_text = text_body.length > 0;
  const has_html = !!html_body;
  const { inline, regular } = partition_attachments(attachments, html_body);

  const headers = build_envelope_headers(env, opts);
  yield bytes(headers.out);
  yield bytes("MIME-Version: 1.0\r\n");

  if (!has_text && !has_html && attachments.length === 0) {
    yield bytes("Content-Type: text/plain; charset=utf-8\r\n");
    yield bytes("Content-Transfer-Encoding: 7bit\r\n\r\n");
    return;
  }

  const text_for_alt = has_text
    ? text_body
    : has_html
    ? html_to_text_fallback(html_body!)
    : "";

  const need_mixed = regular.length > 0;
  const need_related = inline.length > 0 && has_html;
  const need_alt = has_html && (has_text || !has_html ? has_text : true);

  if (!need_mixed && !need_related && !need_alt) {
    const which = has_html ? "text/html" : "text/plain";
    const body = has_html ? html_body! : text_body;
    for (const chunk of emit_text_part(which, body)) yield chunk;
    return;
  }

  const mixed_boundary = need_mixed
    ? safe_boundary_for(text_for_alt, html_body ?? "")
    : "";
  const alt_boundary = need_alt
    ? safe_boundary_for(text_for_alt, html_body ?? "", mixed_boundary)
    : "";
  const related_boundary = need_related
    ? safe_boundary_for(html_body ?? "", mixed_boundary, alt_boundary)
    : "";

  if (need_mixed) {
    yield bytes(`Content-Type: multipart/mixed; boundary="${mixed_boundary}"\r\n\r\n`);
    yield bytes(`--${mixed_boundary}\r\n`);
  }

  if (need_alt) {
    yield bytes(`Content-Type: multipart/alternative; boundary="${alt_boundary}"\r\n\r\n`);

    yield bytes(`--${alt_boundary}\r\n`);
    for (const chunk of emit_text_part("text/plain", text_for_alt)) yield chunk;

    yield bytes(`--${alt_boundary}\r\n`);
    if (need_related) {
      yield bytes(`Content-Type: multipart/related; boundary="${related_boundary}"\r\n\r\n`);
      yield bytes(`--${related_boundary}\r\n`);
      for (const chunk of emit_text_part("text/html", html_body!)) yield chunk;
      for (const att of inline) {
        yield bytes(`--${related_boundary}\r\n`);
        for await (const chunk of emit_attachment_part(att)) yield chunk;
        yield bytes(CRLF);
      }
      yield bytes(`--${related_boundary}--\r\n`);
    } else if (has_html) {
      for (const chunk of emit_text_part("text/html", html_body!)) yield chunk;
    }
    yield bytes(`--${alt_boundary}--\r\n`);
  } else if (has_html) {
    for (const chunk of emit_text_part("text/html", html_body!)) yield chunk;
  } else if (has_text) {
    for (const chunk of emit_text_part("text/plain", text_body)) yield chunk;
  }

  if (need_mixed) {
    for (const att of regular) {
      yield bytes(`--${mixed_boundary}\r\n`);
      for await (const chunk of emit_attachment_part(att)) yield chunk;
      yield bytes(CRLF);
    }
    yield bytes(`--${mixed_boundary}--\r\n`);
  }
}

export async function serialize_envelope_to_bytes(
  env: DecryptedEnvelope,
  attachments: ExportAttachment[] = [],
  opts: SerializeOptions = {},
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of serialize_envelope(env, attachments, opts)) {
    parts.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
