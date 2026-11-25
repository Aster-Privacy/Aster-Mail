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
import type { verifiable_decrypted_message } from "@/services/crypto/key_manager_pgp";
import type { SenderVerificationStatus } from "@/types/email";

import { load_openpgp } from "@/services/crypto/openpgp_loader";
import { extract_mime_attachments } from "@/utils/mime_attachment_parts";
import {
  decrypted_content_tag,
  set_decrypted_mime_attachments,
} from "@/services/decrypted_mime_attachments";
import { ignore_error } from "@/lib/ignore_error";
import {
  find_pgp_block,
  replace_html_tags,
  split_html_tags,
} from "@/lib/address_scans";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import {
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { decrypt_message_verifiable_with_any_key } from "@/services/crypto/key_manager";
import {
  resolve_inline_pgp_sender_keys,
  settle_sender_verification,
} from "@/services/crypto/sender_verification";
import { derive_public_keys_from_private } from "@/services/crypto/key_manager_pgp_messages";
import {
  inspect_nested_signed_mime,
  verify_nested_signed_part,
} from "@/services/crypto/nested_signed_mime";
import {
  get_external_decryption_keys,
  settle_external_pgp_key_load,
} from "@/services/crypto/external_pgp_key";
import { is_trusted_ratchet_plaintext } from "@/services/crypto/ratchet_verification_status";
import {
  parse_sealed_details,
  serialize_sealed_details,
  type SealedMessageDetails,
} from "@/utils/sealed_message_details";
import {
  discover_external_keys_batch,
  type ExternalKeyInfo,
} from "@/services/api/keys";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  RATCHET_PENDING_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
} from "@/utils/undecryptable_body";
import {
  capture_decrypt_readiness,
  settle_decrypt_failure,
  settle_decrypt_success,
  type DecryptReadiness,
} from "@/services/crypto/decrypt_readiness";

export {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  RATCHET_PENDING_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
};

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

  const before = capture_decrypt_readiness();
  let vault = get_vault_from_memory();

  if (!vault) {
    await wait_for_keys_ready();
    vault = get_vault_from_memory();
  }

  if (!vault) {
    settle_decrypt_failure(message_id, { ...before, keys_settled: false });

    return RATCHET_PENDING_SENTINEL;
  }

  return settle_ratchet_attempt(message_id, before, () =>
    decrypt_ratchet_message(
      our_email,
      sender_email,
      envelope,
      vault,
      message_id,
    ),
  );
}

export async function settle_ratchet_attempt(
  message_id: string | undefined,
  before: DecryptReadiness,
  attempt: () => Promise<string | null>,
): Promise<string> {
  let decrypted: string | null = null;
  let caught: unknown;

  try {
    decrypted = await attempt();
  } catch (error) {
    caught = error ?? new Error("ratchet decrypt failed");
  }

  if (decrypted !== null && decrypted !== undefined) {
    settle_decrypt_success(message_id);

    return decrypted;
  }

  return settle_decrypt_failure(message_id, before, caught) === "pending"
    ? RATCHET_PENDING_SENTINEL
    : RATCHET_UNDECRYPTABLE_SENTINEL;
}

export function is_ratchet_verified_body(
  raw_body: string | null | undefined,
  decrypted_body: string | null | undefined,
  message_id?: string,
): boolean {
  return (
    is_ratchet_envelope(raw_body) &&
    !!decrypted_body &&
    decrypted_body !== RATCHET_UNDECRYPTABLE_SENTINEL &&
    decrypted_body !== RATCHET_PENDING_SENTINEL &&
    !is_ratchet_envelope(decrypted_body) &&
    is_trusted_ratchet_plaintext(decrypted_body, message_id)
  );
}

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

export function normalize_charset(raw: string): string {
  const lower = raw.trim().toLowerCase();

  return CHARSET_ALIASES[lower] ?? lower;
}

function get_charset(headers: string): string {
  const match = headers.match(/charset\s*=\s*"?([A-Za-z0-9._:+-]+)"?/i);
  const raw = match?.[1];

  if (!raw) return "utf-8";

  return normalize_charset(raw);
}

export function decode_bytes(bytes: Uint8Array, charset: string): string {
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

export function quoted_printable_to_bytes(input: string): Uint8Array {
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

export const PGP_PASSWORD_PROTECTED_SENTINEL =
  "\x00ASTER_PGP_PASSWORD_PROTECTED\x00";

export function has_inbound_pgp_block(text: string): boolean {
  return find_pgp_block(text) !== null;
}

const QUOTED_PGP_BEGIN_LINE = /^[ \t]*>[ \t>]*-----BEGIN PGP MESSAGE-----/m;
const UNQUOTED_PGP_BEGIN_LINE = /^[ \t]*-----BEGIN PGP MESSAGE-----/m;

export function is_quoted_inbound_pgp(text: string, html: string): boolean {
  if (QUOTED_PGP_BEGIN_LINE.test(text) && !UNQUOTED_PGP_BEGIN_LINE.test(text)) {
    return true;
  }
  const begin = html.indexOf("-----BEGIN PGP MESSAGE-----");

  if (begin < 0) return false;
  const before = html.slice(0, begin).toLowerCase();
  const opened = before.match(/<blockquote\b/g)?.length ?? 0;
  const closed = before.match(/<\/blockquote\s*>/g)?.length ?? 0;

  return opened > closed;
}

export interface PgpBlockSplit {
  block: string;
  rest: string;
}

const HTML_ARMOR_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#43;": "+",
  "&#x2b;": "+",
  "&#47;": "/",
  "&#x2f;": "/",
  "&#61;": "=",
  "&#x3d;": "=",
  "&nbsp;": " ",
  "&amp;": "&",
};

const HTML_ARMOR_ENTITY_PATTERN =
  /&(?:lt|gt|quot|nbsp|amp|#39|#x27|#43|#x2b|#47|#x2f|#61|#x3d);/gi;

const ARMOR_BEGIN_LINE = "-----BEGIN PGP MESSAGE-----";
const ARMOR_END_LINE = "-----END PGP MESSAGE-----";
const ARMOR_HEADER_LINE = /^[A-Za-z][A-Za-z0-9-]*: /;
const ARMOR_DATA_LINE = /^=?[A-Za-z0-9+/]+=*$/;
const HTML_LINE_BREAK_TAG = /^<(?:br\b|\/(?:p|div|pre|li|tr|blockquote)\s*>)/i;

export function unwrap_html_armor(block: string): string {
  if (!/<[a-z/!]|&[#a-z0-9]+;/i.test(block)) return block;

  const lines = split_html_tags(block)
    .map((part) =>
      part.startsWith("<")
        ? HTML_LINE_BREAK_TAG.test(part)
          ? "\n"
          : ""
        : part,
    )
    .join("")
    .replace(
      HTML_ARMOR_ENTITY_PATTERN,
      (entity) => HTML_ARMOR_ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .split(/\r?\n/)
    .map((line) => line.replace(/ /g, " ").trim())
    .filter((line) => line.length > 0);

  if (
    lines[0] !== ARMOR_BEGIN_LINE ||
    lines[lines.length - 1] !== ARMOR_END_LINE
  ) {
    return block;
  }

  const data = lines
    .slice(1, -1)
    .filter((line) => !ARMOR_HEADER_LINE.test(line));

  if (data.length === 0 || !data.every((line) => ARMOR_DATA_LINE.test(line))) {
    return block;
  }

  return [ARMOR_BEGIN_LINE, "", ...data, ARMOR_END_LINE].join("\n");
}

export function split_pgp_block(text: string): PgpBlockSplit | null {
  const match = find_pgp_block(text);

  if (!match) return null;

  const raw_block = match.block;
  const block = unwrap_html_armor(raw_block);
  const start = match.index + match.prefix.length;
  const before = text.slice(0, start);
  const after = text.slice(start + raw_block.length);
  const remainder = `${before}\n${after}`;
  const visible = replace_html_tags(remainder, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { block, rest: visible.length > 0 ? remainder.trim() : "" };
}

export async function is_password_encrypted_pgp(
  armored: string,
): Promise<boolean> {
  const openpgp = await load_openpgp();

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
  const openpgp = await load_openpgp();

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
  verified: boolean;
  sender_verification?: SenderVerificationStatus;
  decrypted_attachments?: DecryptedAttachmentSummary[];
  decrypted_content_tag?: string;
}

interface sender_signature_evidence {
  has_signature: boolean;
  shown_text: string;
  verify: (keys: string[]) => Promise<SenderVerificationStatus>;
}

function signed_part_text(signed_text: string): string {
  return signed_text.startsWith("\r\n") ? signed_text.slice(2) : signed_text;
}

function signature_evidence(
  decrypted: verifiable_decrypted_message,
): sender_signature_evidence {
  if (decrypted.has_signature) {
    return {
      has_signature: true,
      shown_text: decrypted.plaintext,
      verify: async (keys) => (await decrypted.verify(keys)).verification,
    };
  }

  const nested = inspect_nested_signed_mime(decrypted.plaintext);

  if (nested.kind === "none") {
    return {
      has_signature: false,
      shown_text: decrypted.plaintext,
      verify: async () => "unsigned",
    };
  }

  if (nested.kind === "malformed") {
    return {
      has_signature: true,
      shown_text: decrypted.plaintext,
      verify: async () => "unknown",
    };
  }

  return {
    has_signature: true,
    shown_text: signed_part_text(nested.part.signed_text),
    verify: (keys) => verify_nested_signed_part(nested.part, keys),
  };
}

async function judge_sender_signature(
  evidence: sender_signature_evidence,
  sender_email: string | undefined,
  own_private_keys: string[],
): Promise<SenderVerificationStatus> {
  if (!evidence.has_signature) return "unsigned";
  if (!sender_email) return "no_keys";

  try {
    const sender_keys = await resolve_inline_pgp_sender_keys(sender_email);

    if (sender_keys.length === 0) return "no_keys";

    return await settle_sender_verification(
      sender_email,
      sender_keys,
      await evidence.verify(sender_keys),
      async () => {
        const own_keys =
          await derive_public_keys_from_private(own_private_keys);

        return (
          own_keys.length > 0 &&
          (await evidence.verify(own_keys)) === "verified"
        );
      },
    );
  } catch {
    return "unknown";
  }
}

export interface DecryptedAttachmentSummary {
  filename: string;
  content_type: string;
  content_id?: string;
}

function keep_decrypted_attachments(
  plaintext: string,
  mail_item_id: string | undefined,
  content_tag: string,
): DecryptedAttachmentSummary[] {
  const parts = /^content-type\s*:/im.test(plaintext)
    ? extract_mime_attachments(plaintext)
    : [];

  if (mail_item_id) {
    set_decrypted_mime_attachments(mail_item_id, parts, content_tag);
  }

  return parts.map(({ filename, content_type, content_id }) => ({
    filename,
    content_type,
    ...(content_id ? { content_id } : {}),
  }));
}

export async function resolve_inbound_pgp_body(
  body_text: string,
  sender_email?: string,
  mail_item_id?: string,
): Promise<ResolvedPgpBody> {
  const split = split_pgp_block(body_text);

  if (!split) {
    return { body: body_text, decrypted: false, verified: false };
  }

  const { block, rest } = split;

  if (await is_password_encrypted_pgp(block)) {
    return {
      body: encode_password_protected_body(block, rest),
      decrypted: false,
      verified: false,
    };
  }

  const unavailable: ResolvedPgpBody = {
    body: body_text,
    decrypted: false,
    verified: false,
  };

  let vault = get_vault_from_memory();
  let passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) {
    await wait_for_keys_ready();
    vault = get_vault_from_memory();
    passphrase = get_passphrase_from_memory();
  }

  if (!vault || !passphrase) return unavailable;

  const keys_to_try = [
    vault.identity_key,
    ...(vault.previous_keys ?? []),
  ].filter((k): k is string => !!k);

  const finish = async (
    decrypted: verifiable_decrypted_message,
  ): Promise<ResolvedPgpBody> => {
    const evidence = signature_evidence(decrypted);
    const shown = evidence.shown_text;
    const content_tag = await decrypted_content_tag(shown);
    const decrypted_attachments = keep_decrypted_attachments(
      shown,
      mail_item_id,
      content_tag,
    );

    const sender_verification = await judge_sender_signature(
      evidence,
      sender_email,
      keys_to_try,
    );

    return {
      body: /^content-type\s*:/im.test(shown)
        ? extract_mime_body(shown)
        : shown,
      decrypted: true,
      verified: sender_verification === "verified",
      sender_verification,
      decrypted_content_tag: content_tag,
      ...(decrypted_attachments.length > 0 ? { decrypted_attachments } : {}),
    };
  };

  if (keys_to_try.length > 0) {
    try {
      return await finish(
        await decrypt_message_verifiable_with_any_key(
          block,
          keys_to_try,
          passphrase,
        ),
      );
    } catch (e) {
      if (import.meta.env.DEV) console.error("pgp_decrypt_failed", e);
    }
  }

  await settle_external_pgp_key_load();

  const external_keys = get_external_decryption_keys();

  if (external_keys.length > 0) {
    try {
      return await finish(
        await decrypt_message_verifiable_with_any_key(
          block,
          [],
          passphrase,
          external_keys,
        ),
      );
    } catch (e) {
      if (import.meta.env.DEV) console.error("pgp_decrypt_failed", e);
    }
  }

  return unavailable;
}

export async function try_decrypt_pgp_body(
  body_text: string,
  mail_item_id?: string,
): Promise<string> {
  const resolved = await resolve_inbound_pgp_body(
    body_text,
    undefined,
    mail_item_id,
  );

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
  attachment_manifest?: unknown[];
  details?: SealedMessageDetails;
}

export function build_subject_bundle(
  subject: string,
  body: string,
  attachment_manifest: unknown[] = [],
  details?: SealedMessageDetails,
): string {
  const existing = extract_subject_bundle(body);

  return (
    ASTER_SUBJECT_BUNDLE_PREFIX +
    JSON.stringify({
      s: subject || (existing.subject ?? ""),
      b: existing.body,
      ...(attachment_manifest.length > 0 ? { attachment_manifest } : {}),
      ...(details ? { details: serialize_sealed_details(details) } : {}),
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
      const details = parse_sealed_details(parsed.details);

      return {
        subject: parsed.s,
        body: parsed.b,
        ...(Array.isArray(parsed.attachment_manifest)
          ? { attachment_manifest: parsed.attachment_manifest }
          : {}),
        ...(details ? { details } : {}),
      };
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
  let attachment_manifest: unknown[] | undefined;
  let details: SealedMessageDetails | undefined;

  for (let depth = 0; depth < MAX_SUBJECT_BUNDLE_DEPTH; depth += 1) {
    const layer = unwrap_subject_bundle_layer(body);

    if (!layer) break;
    if (!subject) subject = layer.subject;
    if (depth === 0) {
      attachment_manifest = layer.attachment_manifest;
      details = layer.details;
    }
    body = layer.body;
    unwrapped = true;
  }

  if (!unwrapped) return { subject: null, body: decrypted };

  return {
    subject: subject ?? "",
    body,
    ...(attachment_manifest ? { attachment_manifest } : {}),
    ...(details ? { details } : {}),
  };
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

export interface DecryptedBodyText {
  body: string;
  pgp_undecrypted: boolean;
  sealed: boolean;
  decrypted_attachments?: DecryptedAttachmentSummary[];
}

async function resolve_body_text(
  body_text: string,
  user_email: string,
  sender_email: string,
  message_id?: string,
): Promise<DecryptedBodyText> {
  if (!body_text) {
    return { body: body_text, pgp_undecrypted: false, sealed: false };
  }

  let result = await try_decrypt_ratchet_body(
    body_text,
    user_email,
    sender_email,
    message_id,
  );

  if (result === RATCHET_PENDING_SENTINEL) {
    return { body: result, pgp_undecrypted: false, sealed: false };
  }

  const sealed = is_ratchet_verified_body(body_text, result, message_id);
  const had_pgp_block = has_inbound_pgp_block(result);
  const pgp = await resolve_inbound_pgp_body(result, undefined, message_id);

  result = pgp.body;

  if (is_password_protected_body(result)) {
    return {
      body: decode_password_protected_body(result).rest.trim(),
      pgp_undecrypted: false,
      sealed,
    };
  }

  if (/^content-type\s*:/im.test(result)) {
    try {
      result = extract_mime_body(result);
    } catch (caught) {
      ignore_error("utils/email_crypto:decrypt_body_text", caught);
    }
  }

  return {
    body: result,
    pgp_undecrypted: had_pgp_block && !pgp.decrypted,
    sealed,
    decrypted_attachments: pgp.decrypted_attachments ?? [],
  };
}

export async function decrypt_body_text(
  body_text: string,
  user_email: string,
  sender_email: string,
  message_id?: string,
): Promise<string> {
  const resolved = await resolve_body_text(
    body_text,
    user_email,
    sender_email,
    message_id,
  );

  return resolved.body;
}

export interface DecryptedBodyBundle extends SubjectBundle {
  pgp_undecrypted: boolean;
  sealed: boolean;
  decrypted_attachments?: DecryptedAttachmentSummary[];
}

export async function decrypt_body_text_with_bundle(
  body_text: string,
  user_email: string,
  sender_email: string,
  message_id?: string,
): Promise<DecryptedBodyBundle> {
  const resolved = await resolve_body_text(
    body_text,
    user_email,
    sender_email,
    message_id,
  );

  return {
    ...extract_subject_bundle(resolved.body),
    pgp_undecrypted: resolved.pgp_undecrypted,
    sealed: resolved.sealed,
    ...(resolved.decrypted_attachments?.length
      ? { decrypted_attachments: resolved.decrypted_attachments }
      : {}),
  };
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
  const openpgp = await load_openpgp();

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

  const openpgp = await load_openpgp();

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
