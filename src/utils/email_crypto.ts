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
import * as openpgp from "openpgp";

import { ignore_error } from "@/lib/ignore_error";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import {
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { decrypt_message } from "@/services/crypto/key_manager";
import {
  discover_external_keys_batch,
  type ExternalKeyInfo,
} from "@/services/api/keys";

export const RATCHET_UNDECRYPTABLE_SENTINEL =
  "\x00ASTER_RATCHET_UNDECRYPTABLE\x00";

export function is_ratchet_envelope(body: string | null | undefined): boolean {
  if (!body) return false;

  return parse_ratchet_envelope(body) !== null;
}

export async function try_decrypt_ratchet_body(
  body_text: string,
  our_email: string,
  sender_email: string,
  message_id?: string,
): Promise<string> {
  if (!body_text.startsWith("{")) return body_text;

  const envelope = parse_ratchet_envelope(body_text);

  if (!envelope) {
    if (body_text.includes('"type":"double_ratchet')) {
      return RATCHET_UNDECRYPTABLE_SENTINEL;
    }

    return body_text;
  }

  let vault = get_vault_from_memory();

  if (!vault) {
    await wait_for_keys_ready();
    vault = get_vault_from_memory();
  }

  if (!vault) return RATCHET_UNDECRYPTABLE_SENTINEL;

  try {
    const decrypted = await decrypt_ratchet_message(
      our_email,
      sender_email,
      envelope,
      vault,
      message_id,
    );

    return decrypted ?? RATCHET_UNDECRYPTABLE_SENTINEL;
  } catch {
    return RATCHET_UNDECRYPTABLE_SENTINEL;
  }
}

const PGP_MESSAGE_BEGIN = "-----BEGIN PGP MESSAGE-----";

function find_header_body_split(
  text: string,
): { headers: string; body: string } | null {
  const crlf = text.indexOf("\r\n\r\n");
  const lf = text.indexOf("\n\n");
  let pos = -1;
  let skip = 2;

  if (crlf >= 0 && lf >= 0) {
    pos = Math.min(crlf, lf);
    skip = crlf <= lf ? 4 : 2;
  } else if (crlf >= 0) {
    pos = crlf;
    skip = 4;
  } else if (lf >= 0) {
    pos = lf;
    skip = 2;
  }

  if (pos < 0) return null;

  return {
    headers: text.substring(0, pos),
    body: text.substring(pos + skip),
  };
}

const CHARSET_ALIASES: Record<string, string> = {
  "us-ascii": "utf-8",
  ascii: "utf-8",
  utf8: "utf-8",
  "utf-8": "utf-8",
  "unicode-1-1-utf-8": "utf-8",
  latin1: "windows-1252",
  "iso-8859-1": "windows-1252",
  "iso8859-1": "windows-1252",
  cp1252: "windows-1252",
};

function get_charset(headers: string): string {
  const match = headers.match(/charset\s*=\s*"?([A-Za-z0-9._:+-]+)"?/i);
  const raw = match?.[1]?.toLowerCase();

  if (!raw) return "utf-8";

  return CHARSET_ALIASES[raw] ?? raw;
}

function decode_bytes(bytes: Uint8Array, charset: string): string {
  if (charset === "utf-8") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }

  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }
}

function base64_to_bytes(input: string): Uint8Array | null {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, "");

  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }

    return bytes;
  } catch {
    return null;
  }
}

function quoted_printable_to_bytes(input: string): Uint8Array {
  const unfolded = input.replace(/=[ \t]*\r?\n/g, "");
  const bytes: number[] = [];

  for (let i = 0; i < unfolded.length; i += 1) {
    const char = unfolded[i] as string;

    if (char === "=" && i + 2 < unfolded.length) {
      const hex = unfolded.substring(i + 1, i + 3);

      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }

    const code = char.charCodeAt(0);

    if (code < 0x80) {
      bytes.push(code);
    } else {
      for (const byte of new TextEncoder().encode(char)) bytes.push(byte);
    }
  }

  return new Uint8Array(bytes);
}

function decode_transfer_encoding(body: string, headers: string): string {
  const encoding_match = headers.match(
    /content-transfer-encoding\s*:\s*(\S+)/i,
  );
  const encoding =
    encoding_match?.[1]?.toLowerCase().replace(/;$/, "") ?? "7bit";
  const charset = get_charset(headers);

  if (encoding === "base64") {
    const bytes = base64_to_bytes(body);

    if (!bytes) return body;

    return decode_bytes(bytes, charset);
  }

  if (encoding === "quoted-printable") {
    return decode_bytes(quoted_printable_to_bytes(body), charset);
  }

  if (charset !== "utf-8") {
    const bytes = new Uint8Array(body.length);
    let is_byte_string = true;

    for (let i = 0; i < body.length; i += 1) {
      const code = body.charCodeAt(i);

      if (code > 0xff) {
        is_byte_string = false;
        break;
      }

      bytes[i] = code;
    }

    if (is_byte_string) return decode_bytes(bytes, charset);
  }

  return body;
}

function get_boundary(headers: string): string | null {
  const match = headers.match(/boundary="?([^\s";]+)"?/i);

  return match?.[1] ?? null;
}

interface MultipartResult {
  content: string;
  is_html: boolean;
}

const MAX_MULTIPART_DEPTH = 10;

function extract_text_from_multipart(
  body: string,
  boundary: string,
  prefer_html: boolean,
  depth = 0,
): MultipartResult | null {
  if (depth > MAX_MULTIPART_DEPTH) return null;

  const parts = body.split(`--${boundary}`);
  let plain_result: MultipartResult | null = null;
  let html_result: MultipartResult | null = null;

  for (const part of parts) {
    const trimmed = part.replace(/^[\r\n]+/, "");

    if (trimmed.startsWith("--") || trimmed.length === 0) continue;

    const split = find_header_body_split(trimmed);

    if (!split) continue;

    const lower_headers = split.headers.toLowerCase();
    const nested_boundary = get_boundary(split.headers);

    if (nested_boundary && lower_headers.includes("multipart/")) {
      const nested = extract_text_from_multipart(
        split.body,
        nested_boundary,
        prefer_html,
        depth + 1,
      );

      if (nested?.is_html) {
        if (!html_result) html_result = nested;
      } else if (nested && !plain_result) {
        plain_result = nested;
      }

      continue;
    }

    if (is_attachment_disposition(lower_headers)) continue;

    if (lower_headers.includes("text/html")) {
      if (!html_result) {
        html_result = {
          content: decode_transfer_encoding(split.body.trim(), lower_headers),
          is_html: true,
        };
      }
    } else if (lower_headers.includes("text/plain") && !plain_result) {
      plain_result = {
        content: decode_transfer_encoding(split.body.trim(), lower_headers),
        is_html: false,
      };
    }
  }

  return prefer_html
    ? (html_result ?? plain_result)
    : (plain_result ?? html_result);
}

function is_attachment_disposition(lower_headers: string): boolean {
  return /content-disposition\s*:\s*attachment/i.test(lower_headers);
}

function extract_mime_body(raw: string): string {
  const split = find_header_body_split(raw);

  if (!split) return raw;
  if (!/^content-type\s*:/im.test(split.headers)) return raw;

  const boundary = get_boundary(split.headers);

  if (boundary) {
    const result = extract_text_from_multipart(split.body, boundary, true);

    if (result) return result.content;
  }

  const lower_headers = split.headers.toLowerCase();

  if (
    lower_headers.includes("text/plain") ||
    lower_headers.includes("text/html")
  ) {
    return decode_transfer_encoding(split.body.trim(), lower_headers);
  }

  return split.body.trim();
}

export function try_extract_mime_body(text: string): string {
  if (!/^content-type\s*:/im.test(text)) return text;

  try {
    return extract_mime_body(text);
  } catch {
    return text;
  }
}

export const PGP_UNDECRYPTABLE_SENTINEL = "\x00ASTER_PGP_UNDECRYPTABLE\x00";

export const PGP_PASSWORD_PROTECTED_SENTINEL =
  "\x00ASTER_PGP_PASSWORD_PROTECTED\x00";

const PGP_BLOCK_PATTERN =
  /-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/;

export interface PgpBlockSplit {
  block: string;
  rest: string;
}

export function split_pgp_block(text: string): PgpBlockSplit | null {
  const match = PGP_BLOCK_PATTERN.exec(text);

  if (!match) return null;

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const remainder = `${before}\n${after}`;
  const visible = remainder
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { block: match[0], rest: visible.length > 0 ? remainder.trim() : "" };
}

export async function is_password_encrypted_pgp(
  armored: string,
): Promise<boolean> {
  try {
    const message = await openpgp.readMessage({ armoredMessage: armored });

    return message.getEncryptionKeyIDs().length === 0;
  } catch {
    return false;
  }
}

export function encode_password_protected_body(
  block: string,
  rest: string,
): string {
  return PGP_PASSWORD_PROTECTED_SENTINEL + JSON.stringify({ block, rest });
}

export function is_password_protected_body(
  body: string | undefined | null,
): boolean {
  return !!body && body.startsWith(PGP_PASSWORD_PROTECTED_SENTINEL);
}

export function decode_password_protected_body(body: string): PgpBlockSplit {
  const encoded = body.slice(PGP_PASSWORD_PROTECTED_SENTINEL.length);

  try {
    const parsed = JSON.parse(encoded) as Partial<PgpBlockSplit>;

    return { block: parsed.block ?? "", rest: parsed.rest ?? "" };
  } catch {
    return { block: encoded, rest: "" };
  }
}

export async function decrypt_pgp_with_password(
  armored: string,
  password: string,
): Promise<string> {
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const result = await openpgp.decrypt({ message, passwords: [password] });
  const plaintext = result.data.toString();

  return /^content-type\s*:/im.test(plaintext)
    ? extract_mime_body(plaintext)
    : plaintext;
}

export interface ResolvedPgpBody {
  body: string;
  decrypted: boolean;
}

export async function resolve_inbound_pgp_body(
  body_text: string,
): Promise<ResolvedPgpBody> {
  if (!body_text.includes(PGP_MESSAGE_BEGIN)) {
    return { body: body_text, decrypted: false };
  }

  const split = split_pgp_block(body_text);
  const block = split?.block ?? body_text;
  const rest = split?.rest ?? "";

  if (await is_password_encrypted_pgp(block)) {
    return {
      body: encode_password_protected_body(block, rest),
      decrypted: false,
    };
  }

  const unavailable = rest || PGP_UNDECRYPTABLE_SENTINEL;

  let vault = get_vault_from_memory();
  let passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) {
    await wait_for_keys_ready();
    vault = get_vault_from_memory();
    passphrase = get_passphrase_from_memory();
  }

  if (!vault || !passphrase) return { body: unavailable, decrypted: false };

  const keys_to_try = [
    vault.identity_key,
    ...(vault.previous_keys ?? []),
  ].filter((k): k is string => !!k);

  if (keys_to_try.length === 0) return { body: unavailable, decrypted: false };

  for (const secret_key of keys_to_try) {
    try {
      let decrypted = await decrypt_message(block, secret_key, passphrase);

      if (/^content-type\s*:/im.test(decrypted)) {
        decrypted = extract_mime_body(decrypted);
      }

      return { body: decrypted, decrypted: true };
    } catch (e) {
      if (import.meta.env.DEV) console.error("pgp_decrypt_failed", e);
    }
  }

  return { body: unavailable, decrypted: false };
}

export async function try_decrypt_pgp_body(body_text: string): Promise<string> {
  const resolved = await resolve_inbound_pgp_body(body_text);

  return resolved.body;
}

export const ASTER_SUBJECT_BUNDLE_MARKER = "ASTER_BUNDLE_V2";

const BUNDLE_MARKER_DELIMITER = "\x01";

export const ASTER_SUBJECT_BUNDLE_PREFIX =
  BUNDLE_MARKER_DELIMITER +
  ASTER_SUBJECT_BUNDLE_MARKER +
  BUNDLE_MARKER_DELIMITER;

export interface SubjectBundle {
  subject: string | null;
  body: string;
}

export function build_subject_bundle(subject: string, body: string): string {
  const existing = extract_subject_bundle(body);

  return (
    ASTER_SUBJECT_BUNDLE_PREFIX +
    JSON.stringify({
      s: subject || (existing.subject ?? ""),
      b: existing.body,
    })
  );
}

const BUNDLE_FRAMING_PATTERN = /^[\s\u0000-\u001f\u007f\ufeff\u200b-\u200f]*$/;

const JSON_STRING_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function read_lenient_json_string(
  text: string,
  open_quote_index: number,
): { value: string; next_index: number } | null {
  if (text[open_quote_index] !== '"') return null;
  let value = "";
  let index = open_quote_index + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') return { value, next_index: index + 1 };
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }
    const escape = text[index + 1];

    if (escape === undefined) break;
    if (escape === "u") {
      const code = text.slice(index + 2, index + 6);

      if (/^[0-9a-fA-F]{4}$/.test(code)) {
        value += String.fromCharCode(parseInt(code, 16));
        index += 6;
        continue;
      }
      value += escape;
      index += 2;
      continue;
    }
    value += JSON_STRING_ESCAPES[escape] ?? escape;
    index += 2;
  }

  return { value, next_index: text.length };
}

function scan_bundle_payload(payload: string): SubjectBundle | null {
  const open_brace = payload.indexOf("{");

  if (open_brace === -1) return null;

  let subject: string | null = null;
  let body: string | null = null;
  let index = open_brace + 1;

  while (index < payload.length) {
    const key_quote = payload.indexOf('"', index);

    if (key_quote === -1) break;
    const key = read_lenient_json_string(payload, key_quote);

    if (!key) break;
    const colon = payload.indexOf(":", key.next_index);

    if (colon === -1) break;
    let value_start = colon + 1;

    while (value_start < payload.length && /\s/.test(payload[value_start])) {
      value_start += 1;
    }
    if (value_start >= payload.length) break;
    if (payload[value_start] !== '"') {
      const comma = payload.indexOf(",", value_start);

      if (comma === -1) break;
      index = comma + 1;
      continue;
    }
    const value = read_lenient_json_string(payload, value_start);

    if (!value) break;
    if (key.value === "s") subject = value.value;
    if (key.value === "b") body = value.value;
    if (subject !== null && body !== null) break;
    index = value.next_index;
  }

  if (body === null) return null;

  return { subject, body };
}

const MAX_SUBJECT_BUNDLE_DEPTH = 8;

function unwrap_subject_bundle_layer(text: string): SubjectBundle | null {
  const marker_index = text.indexOf(ASTER_SUBJECT_BUNDLE_MARKER);

  if (marker_index === -1) return null;

  const start_index =
    marker_index > 0 && text[marker_index - 1] === BUNDLE_MARKER_DELIMITER
      ? marker_index - 1
      : marker_index;

  if (!BUNDLE_FRAMING_PATTERN.test(text.slice(0, start_index))) return null;

  let payload_index = marker_index + ASTER_SUBJECT_BUNDLE_MARKER.length;

  if (text[payload_index] === BUNDLE_MARKER_DELIMITER) payload_index += 1;

  const payload = text.slice(payload_index);

  try {
    const parsed = JSON.parse(payload);

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.s === "string" &&
      typeof parsed.b === "string"
    ) {
      return { subject: parsed.s, body: parsed.b };
    }
  } catch (caught) {
    ignore_error("utils/email_crypto:unwrap_subject_bundle_layer", caught);
  }

  return scan_bundle_payload(payload);
}

export function extract_subject_bundle(decrypted: string): SubjectBundle {
  if (!decrypted) return { subject: null, body: decrypted };

  let subject: string | null = null;
  let body = decrypted;
  let unwrapped = false;

  for (let depth = 0; depth < MAX_SUBJECT_BUNDLE_DEPTH; depth += 1) {
    const layer = unwrap_subject_bundle_layer(body);

    if (!layer) break;
    if (!subject) subject = layer.subject;
    body = layer.body;
    unwrapped = true;
  }

  if (!unwrapped) return { subject: null, body: decrypted };

  return { subject: subject ?? "", body };
}

export function unwrap_bundle_html(html: string | undefined): {
  html: string | undefined;
  subject: string | null;
} {
  if (!html || !html.includes(ASTER_SUBJECT_BUNDLE_MARKER)) {
    return { html, subject: null };
  }

  const bundle = extract_subject_bundle(html);

  if (bundle.subject === null) return { html, subject: null };

  return { html: bundle.body || undefined, subject: bundle.subject };
}

export async function decrypt_body_text(
  body_text: string,
  user_email: string,
  sender_email: string,
  message_id?: string,
): Promise<string> {
  if (!body_text) return body_text;

  let result = await try_decrypt_ratchet_body(
    body_text,
    user_email,
    sender_email,
    message_id,
  );

  result = await try_decrypt_pgp_body(result);

  if (is_password_protected_body(result)) {
    return decode_password_protected_body(result).rest.trim();
  }

  if (/^content-type\s*:/im.test(result)) {
    try {
      result = extract_mime_body(result);
    } catch (caught) {
      ignore_error("utils/email_crypto:decrypt_body_text", caught);
    }
  }

  return result;
}

export async function decrypt_body_text_with_bundle(
  body_text: string,
  user_email: string,
  sender_email: string,
  message_id?: string,
): Promise<SubjectBundle> {
  const decrypted = await decrypt_body_text(
    body_text,
    user_email,
    sender_email,
    message_id,
  );

  return extract_subject_bundle(decrypted);
}

export interface RecipientKeyResult {
  email: string;
  has_key: boolean;
  public_key: string | null;
  fingerprint: string | null;
  source: string | null;
}

export interface ExternalEncryptionResult {
  recipients_with_keys: RecipientKeyResult[];
  recipients_without_keys: string[];
  all_have_keys: boolean;
  any_have_keys: boolean;
}

export async function discover_external_recipient_keys(
  emails: string[],
  auto_discover_enabled: boolean,
): Promise<ExternalEncryptionResult> {
  if (!auto_discover_enabled || emails.length === 0) {
    return {
      recipients_with_keys: [],
      recipients_without_keys: emails,
      all_have_keys: false,
      any_have_keys: false,
    };
  }

  const unique_emails = [...new Set(emails.map((e) => e.toLowerCase()))];
  const response = await discover_external_keys_batch(unique_emails);

  if (!response.data) {
    return {
      recipients_with_keys: [],
      recipients_without_keys: unique_emails,
      all_have_keys: false,
      any_have_keys: false,
    };
  }

  const key_map = new Map<string, ExternalKeyInfo>();

  for (const key_info of response.data) {
    key_map.set(key_info.email.toLowerCase(), key_info);
  }

  const recipients_with_keys: RecipientKeyResult[] = [];
  const recipients_without_keys: string[] = [];

  for (const email of unique_emails) {
    const key_info = key_map.get(email.toLowerCase());

    if (key_info?.found && key_info.public_key) {
      let is_valid_key = false;

      try {
        await openpgp.readKey({ armoredKey: key_info.public_key });
        is_valid_key = true;
      } catch {
        is_valid_key = false;
      }

      if (is_valid_key) {
        recipients_with_keys.push({
          email,
          has_key: true,
          public_key: key_info.public_key,
          fingerprint: key_info.fingerprint,
          source: key_info.source,
        });
      } else {
        recipients_without_keys.push(email);
      }
    } else {
      recipients_without_keys.push(email);
    }
  }

  return {
    recipients_with_keys,
    recipients_without_keys,
    all_have_keys:
      recipients_without_keys.length === 0 && recipients_with_keys.length > 0,
    any_have_keys: recipients_with_keys.length > 0,
  };
}

let own_public_key_cache: { private_key: string; public_key: string } | null =
  null;

export async function derive_own_public_key(): Promise<string | null> {
  const vault = get_vault_from_memory();

  if (!vault?.identity_key) return null;
  if (
    !vault.identity_key.trimStart().startsWith("-----BEGIN PGP PRIVATE KEY")
  ) {
    return null;
  }

  if (own_public_key_cache?.private_key === vault.identity_key) {
    return own_public_key_cache.public_key;
  }

  try {
    const private_key = await openpgp.readPrivateKey({
      armoredKey: vault.identity_key,
    });
    const public_key = private_key.toPublic().armor();

    own_public_key_cache = { private_key: vault.identity_key, public_key };

    return public_key;
  } catch {
    return null;
  }
}
