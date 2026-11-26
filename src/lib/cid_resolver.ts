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
import type { AttachmentMeta } from "@/services/crypto/attachment_crypto";

import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";
import { array_to_base64 } from "@/services/crypto/envelope";
import {
  fetch_attachment_records,
  attachment_records_fetch_failed,
} from "@/services/attachment_preview_cache";
import { get_cached_attachment_meta } from "@/services/attachment_meta_cache";
import { get_decrypted_mime_attachments } from "@/services/decrypted_mime_attachments";
import {
  char_set_predicate,
  trim_end_index,
  trim_end_while,
  trim_start_index,
} from "@/lib/linear_trim";
import { ascii_lower, next_char_table, table_lookup } from "@/lib/html_text";
import { email_timestamp_ms } from "@/utils/email_timestamp";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/apng",
  "image/jfif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-citrix-jpeg": "image/jpeg",
  "image/x-citrix-png": "image/png",
  "image/x-ms-bmp": "image/bmp",
  "image/x-bmp": "image/bmp",
  "image/tif": "image/tiff",
  "image/x-tiff": "image/tiff",
  "image/vnd.microsoft.icon": "image/x-icon",
  "image/jpg": "image/jpeg",
};

const IMAGE_EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  apng: "image/apng",
  jfif: "image/jpeg",
  ico: "image/x-icon",
};

const GENERIC_CONTENT_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
  "content/unknown",
]);

function normalize_content_type(raw: string | undefined | null): string {
  const base = (raw || "").split(";")[0].trim().toLowerCase();

  return CONTENT_TYPE_ALIASES[base] ?? base;
}

function extension_content_type(filename: string | undefined | null): string {
  const match = /[.]([a-z0-9]+)\s*$/i.exec((filename || "").trim());

  if (!match) return "";

  return IMAGE_EXTENSION_TYPES[match[1].toLowerCase()] ?? "";
}

export function resolved_image_content_type(meta: {
  content_type?: string;
  filename?: string;
  content_id?: string;
  is_inline?: boolean;
}): string | null {
  const declared = normalize_content_type(meta.content_type);

  if (ALLOWED_IMAGE_TYPES.has(declared)) return declared;

  if (GENERIC_CONTENT_TYPES.has(declared)) {
    const inferred = extension_content_type(meta.filename);

    if (inferred) return inferred;

    if (meta.content_id || meta.is_inline === true) return "image/png";
  }

  return null;
}

export interface CidResolutionResult {
  html: string;
  blob_urls: string[];
  unresolved: number;
  records_unavailable?: boolean;
}

export type CidUrlMode = "blob" | "data";

const CID_ATTRIBUTES = "src|background|poster|lowsrc";

const CID_SRCSET_ATTRIBUTES = "srcset|imagesrcset";

const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function cid_attribute_pattern(cid_body: string): RegExp {
  return new RegExp(
    `\\b(${CID_ATTRIBUTES})\\s*=\\s*(["'])cid:(${cid_body})\\2`,
    "gi",
  );
}

function cid_css_url_pattern(cid_body: string): RegExp {
  return new RegExp(`url\\(\\s*(["']?)cid:(${cid_body})\\1\\s*\\)`, "gi");
}

function cid_srcset_pattern(): RegExp {
  return new RegExp(
    `\\b(${CID_SRCSET_ATTRIBUTES})\\s*=\\s*(["'])([^"']*)\\2`,
    "gi",
  );
}

interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

const SRCSET_WHITESPACE_CODES = new Set([32, 9, 10, 13, 12]);

function is_srcset_whitespace(character: string): boolean {
  return SRCSET_WHITESPACE_CODES.has(character.charCodeAt(0));
}

function parse_srcset(value: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let position = 0;

  while (position < value.length) {
    while (
      position < value.length &&
      (is_srcset_whitespace(value[position]) || value[position] === ",")
    ) {
      position += 1;
    }

    if (position >= value.length) break;

    const url_start = position;

    while (position < value.length && !is_srcset_whitespace(value[position])) {
      position += 1;
    }

    let url = value.slice(url_start, position);
    let descriptor = "";

    if (url.endsWith(",")) {
      url = trim_end_while(url, is_comma_code);
    } else {
      const descriptor_start = position;

      while (position < value.length && value[position] !== ",") {
        position += 1;
      }

      descriptor = value.slice(descriptor_start, position).trim();

      if (position < value.length) position += 1;
    }

    if (url) candidates.push({ url, descriptor });
  }

  return candidates;
}

function serialize_srcset(candidates: SrcsetCandidate[]): string {
  return candidates
    .map(({ url, descriptor }) => (descriptor ? `${url} ${descriptor}` : url))
    .join(", ");
}

function candidate_cid(url: string): string | null {
  return url.toLowerCase().startsWith("cid:") ? url.slice(4) : null;
}

function escape_regexp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extract_cid_references(html: string): string[] {
  const cids: string[] = [];
  const patterns = [
    cid_attribute_pattern(`[^"']+`),
    cid_css_url_pattern(`[^"')\\s]+`),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      cids.push(pattern === patterns[0] ? match[3] : match[2]);
    }
  }

  const srcset_pattern = cid_srcset_pattern();
  let srcset_match: RegExpExecArray | null;

  while ((srcset_match = srcset_pattern.exec(html)) !== null) {
    for (const { url } of parse_srcset(srcset_match[3])) {
      const cid = candidate_cid(url);

      if (cid) cids.push(cid);
    }
  }

  return cids;
}

const UNSAFE_RESOLVED_URL = /["'<>\s]/;

export function replace_cid_reference(
  html: string,
  cid: string,
  url: string,
): string {
  if (UNSAFE_RESOLVED_URL.test(url)) return html;

  const escaped = escape_regexp(cid);

  return html
    .replace(
      cid_attribute_pattern(escaped),
      (_match, attribute: string, quote: string) =>
        `${attribute}=${quote}${url}${quote}`,
    )
    .replace(
      cid_css_url_pattern(escaped),
      (_match, quote: string) => `url(${quote}${url}${quote})`,
    )
    .replace(
      cid_srcset_pattern(),
      (match, attribute: string, quote: string, value: string) => {
        const candidates = parse_srcset(value);
        let changed = false;

        const rebuilt = candidates.map((candidate) => {
          const candidate_id = candidate_cid(candidate.url);

          if (candidate_id === null) return candidate;

          if (candidate_id.toLowerCase() !== cid.toLowerCase()) {
            return candidate;
          }

          changed = true;

          return { url, descriptor: candidate.descriptor };
        });

        if (!changed) return match;

        return `${attribute}=${quote}${serialize_srcset(rebuilt)}${quote}`;
      },
    );
}

export function strip_unresolved_cid_references(
  html: string,
  pending = false,
): string {
  const marker = pending ? ` data-cid-pending="1"` : "";

  return html
    .replace(
      new RegExp(
        `\\b(${CID_ATTRIBUTES})\\s*=\\s*(["'])[^"']*cid:[^"']*\\2`,
        "gi",
      ),
      (_match, attribute: string, quote: string) =>
        `${attribute}=${quote}${TRANSPARENT_GIF}${quote}${marker}`,
    )
    .replace(
      cid_srcset_pattern(),
      (match, attribute: string, quote: string, value: string) => {
        const candidates = parse_srcset(value);

        if (!candidates.some(({ url }) => candidate_cid(url) !== null)) {
          return match;
        }

        const kept = candidates.filter(
          ({ url }) => candidate_cid(url) === null,
        );

        if (kept.length === 0) {
          return `${attribute}=${quote}${TRANSPARENT_GIF}${quote}${marker}`;
        }

        return `${attribute}=${quote}${serialize_srcset(kept)}${quote}${marker}`;
      },
    )
    .replace(cid_css_url_pattern(`[^"')\\s]+`), `url(${TRANSPARENT_GIF})`);
}

const is_comma_code = char_set_predicate(",");

const is_open_angle_code = char_set_predicate("<");

const is_close_angle_code = char_set_predicate(">");

function is_quote_code(code: number): boolean {
  return code === 34 || code === 39;
}

function previous_valid_table(
  length: number,
  is_valid: (index: number) => boolean,
): Int32Array {
  const table = new Int32Array(length);
  let previous = -1;

  for (let index = 0; index < length; index += 1) {
    if (is_valid(index)) previous = index;
    table[index] = previous;
  }

  return table;
}

export function extract_cid_inline_filenames(html: string): Set<string> {
  const filenames = new Set<string>();
  const lower = ascii_lower(html);
  const length = html.length;
  const next_quote = next_char_table(html, is_quote_code);
  const next_gt = next_char_table(html, (code) => code === 62);

  const quoted_value_end = (open: number): number => {
    if (!is_quote_code(html.charCodeAt(open))) return -1;

    const close = table_lookup(next_quote, open + 1);

    return close > open + 1 ? close : -1;
  };

  const alt_end = (index: number): number =>
    lower.startsWith("alt=", index) ? quoted_value_end(index + 4) : -1;

  const src_end = (index: number): number => {
    if (!lower.startsWith("src=", index)) return -1;
    if (!is_quote_code(html.charCodeAt(index + 4))) return -1;
    if (!lower.startsWith("cid:", index + 5)) return -1;

    const close = table_lookup(next_quote, index + 9);

    return close > index + 9 ? close : -1;
  };

  const previous_alt = previous_valid_table(
    length,
    (index) => alt_end(index) !== -1,
  );
  const previous_src = previous_valid_table(
    length,
    (index) => src_end(index) !== -1,
  );

  const rightmost_before_gt = (table: Int32Array, from: number): number => {
    const gt = table_lookup(next_gt, from);
    const limit = (gt === -1 ? length : gt) - 1;

    if (limit < from) return -1;

    const found = table[limit];

    return found >= from ? found : -1;
  };

  let index = 0;

  while (index < length) {
    let name = "";
    let end = -1;
    const src_close = src_end(index);

    if (src_close !== -1) {
      const alt_start = rightmost_before_gt(previous_alt, src_close + 1);

      if (alt_start !== -1) {
        end = alt_end(alt_start) + 1;
        name = html.slice(alt_start + 5, end - 1);
      }
    }

    if (end === -1) {
      const alt_close = alt_end(index);

      if (alt_close !== -1) {
        const src_start = rightmost_before_gt(previous_src, alt_close + 1);

        if (src_start !== -1) {
          end = src_end(src_start) + 1;
          name = html.slice(index + 5, alt_close);
        }
      }
    }

    if (end === -1) {
      index += 1;
      continue;
    }

    const normalized = name.toLowerCase().trim();

    if (normalized) filenames.add(normalized);

    index = end;
  }

  return filenames;
}

function decode_percent(value: string): string {
  if (!value.includes("%")) return value;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalize_cid(value: string): string {
  return strip_cid_brackets(decode_percent(value)).trim().toLowerCase();
}

export function strip_cid_brackets(value: string): string {
  const start = trim_start_index(value, is_open_angle_code);

  if (start === value.length) return "";

  const end = Math.max(start, trim_end_index(value, is_close_angle_code));

  return start === 0 && end === value.length ? value : value.slice(start, end);
}

function strip_extension(value: string): string {
  return value.replace(/\.[^.]+$/, "");
}

export interface BodyInlineRefs {
  cids: Set<string>;
  filenames: Set<string>;
  embeds_data_images?: boolean;
}

const GENERATED_INLINE_CID_PATTERN =
  /^img_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@astermail\.org$/;

export function is_generated_inline_cid(content_id: string): boolean {
  return GENERATED_INLINE_CID_PATTERN.test(normalize_cid(content_id));
}

const EMBEDDED_DATA_IMAGE_TAG =
  /<img\b[^>]*?\ssrc\s*=\s*["']?\s*data:image\//i;

export function extract_body_inline_refs(
  html: string,
  own_message = false,
): BodyInlineRefs | undefined {
  const refs = extract_cid_references(html);
  const embeds_data_images =
    own_message && EMBEDDED_DATA_IMAGE_TAG.test(html);

  if (refs.length === 0) {
    return embeds_data_images
      ? { cids: new Set(), filenames: new Set(), embeds_data_images }
      : undefined;
  }

  const filenames = new Set<string>();

  for (const name of extract_cid_inline_filenames(html)) {
    filenames.add(name.replace(/^cid:/, ""));
  }

  return {
    cids: new Set(refs.map(normalize_cid)),
    filenames,
    embeds_data_images,
  };
}

export interface InlineImageCandidate {
  filename?: string | null;
  content_type?: string | null;
  content_id?: string;
}

export function is_body_inline_image(
  item: InlineImageCandidate,
  refs: BodyInlineRefs | undefined,
): boolean {
  if (!refs) return false;

  const as_image = resolved_image_content_type({
    content_type: item.content_type ?? undefined,
    filename: item.filename ?? undefined,
    content_id: item.content_id,
  });

  if (as_image === null) return false;

  if (item.content_id && refs.cids.has(normalize_cid(item.content_id))) {
    return true;
  }

  if (
    refs.embeds_data_images &&
    item.content_id &&
    is_generated_inline_cid(item.content_id) &&
    ascii_lower(item.content_type ?? "").startsWith("image/")
  ) {
    return true;
  }

  if (!item.filename) return false;

  const name = normalize_cid(item.filename);

  return (
    refs.cids.has(name) ||
    refs.cids.has(strip_extension(name)) ||
    refs.filenames.has(name)
  );
}

export function without_body_inline_images<T extends InlineImageCandidate>(
  items: T[],
  refs: BodyInlineRefs | undefined,
): T[] {
  if (!refs) return items;

  const kept = items.filter((item) => !is_body_inline_image(item, refs));

  return kept.length === items.length ? items : kept;
}

interface CidReplacement {
  original_cid: string;
  blob?: Blob;
  data_url?: string;
}

interface CidResolutionPlan {
  html: string;
  replacements: CidReplacement[];
  unresolved: number;
  records_unavailable?: boolean;
  is_final: boolean;
}

const in_flight_resolutions = new Map<string, Promise<CidResolutionPlan>>();

function resolution_key(
  mail_item_id: string,
  url_mode: CidUrlMode,
  html: string,
): string {
  let hash = 5381;

  for (let i = 0; i < html.length; i++) {
    hash = ((hash << 5) + hash + html.charCodeAt(i)) | 0;
  }

  return `${mail_item_id}:${url_mode}:${html.length}:${hash}`;
}

function apply_cid_plan(plan: CidResolutionPlan): CidResolutionResult {
  if (plan.is_final) {
    return {
      html: plan.html,
      blob_urls: [],
      unresolved: plan.unresolved,
      records_unavailable: plan.records_unavailable,
    };
  }

  const blob_urls: string[] = [];
  let resolved_html = plan.html;

  for (const replacement of plan.replacements) {
    let url = replacement.data_url;

    if (!url && replacement.blob) {
      url = URL.createObjectURL(replacement.blob);
      blob_urls.push(url);
    }

    if (!url) continue;

    resolved_html = replace_cid_reference(
      resolved_html,
      replacement.original_cid,
      url,
    );
  }

  return {
    html: strip_unresolved_cid_references(resolved_html),
    blob_urls,
    unresolved: plan.unresolved,
  };
}

const MAX_RELATED_MESSAGES = 20;
const MAX_RELATED_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RELATED_TOTAL_BYTES = 10 * 1024 * 1024;

export function earlier_thread_message_ids(
  messages: readonly { id: string; timestamp: string }[],
  current_id: string,
): string[] {
  const current = messages.find((message) => message.id === current_id);
  const current_ms = current ? email_timestamp_ms(current.timestamp) : 0;

  if (current_ms <= 0) return [];

  return messages
    .map((message) => ({
      id: message.id,
      ms: email_timestamp_ms(message.timestamp),
    }))
    .filter(
      (entry) =>
        entry.id !== current_id && entry.ms > 0 && entry.ms < current_ms,
    )
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_RELATED_MESSAGES)
    .map((entry) => entry.id);
}

function image_replacement(
  original_cid: string,
  data: ArrayBuffer | Uint8Array,
  content_type: string,
  url_mode: CidUrlMode,
): CidReplacement {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  return url_mode === "data"
    ? {
        original_cid,
        data_url: `data:${content_type};base64,${array_to_base64(bytes)}`,
      }
    : {
        original_cid,
        blob: new Blob([bytes as BlobPart], { type: content_type }),
      };
}

async function plan_related_cid_replacements(
  missing: Map<string, string>,
  related_mail_item_ids: readonly string[],
  url_mode: CidUrlMode,
): Promise<CidReplacement[]> {
  const replacements: CidReplacement[] = [];
  let total_bytes = 0;

  for (const related_id of related_mail_item_ids.slice(
    0,
    MAX_RELATED_MESSAGES,
  )) {
    if (missing.size === 0) break;

    const local_parts = get_decrypted_mime_attachments(related_id);

    if (local_parts.length > 0) {
      for (const part of local_parts) {
        if (!part.content_id) continue;

        const key = normalize_cid(part.content_id);
        const original_cid = missing.get(key);
        const content_type = resolved_image_content_type(part);

        if (!original_cid || content_type === null) continue;

        const part_bytes = part.data.byteLength;

        if (
          part_bytes > MAX_RELATED_IMAGE_BYTES ||
          total_bytes + part_bytes > MAX_RELATED_TOTAL_BYTES
        ) {
          continue;
        }

        total_bytes += part_bytes;
        replacements.push(
          image_replacement(original_cid, part.data, content_type, url_mode),
        );
        missing.delete(key);
      }

      continue;
    }

    let records: Awaited<ReturnType<typeof fetch_attachment_records>>;

    try {
      records = await fetch_attachment_records(related_id);
    } catch {
      continue;
    }

    const cached_by_id = new Map(
      (get_cached_attachment_meta(related_id) ?? []).map((item) => [
        item.id,
        item,
      ]),
    );

    for (const att of records) {
      if (missing.size === 0) break;
      if (
        att.size_bytes > MAX_RELATED_IMAGE_BYTES ||
        total_bytes + att.size_bytes > MAX_RELATED_TOTAL_BYTES
      ) {
        continue;
      }

      const cached = cached_by_id.get(att.id);

      if (
        cached &&
        (!cached.content_id || !missing.has(normalize_cid(cached.content_id)))
      ) {
        continue;
      }

      try {
        const meta = await decrypt_attachment_meta(
          att.encrypted_meta,
          att.meta_nonce,
          att.mail_item_id,
          att.seq_num,
        );

        if (!meta.content_id) continue;

        const key = normalize_cid(meta.content_id);
        const original_cid = missing.get(key);
        const content_type = resolved_image_content_type(meta);

        if (!original_cid || content_type === null) continue;

        const data = await decrypt_attachment_data(
          att.encrypted_data,
          att.data_nonce,
          meta.session_key,
          att.mail_item_id,
          att.seq_num,
        );
        const data_bytes = data.byteLength;

        if (
          data_bytes > MAX_RELATED_IMAGE_BYTES ||
          total_bytes + data_bytes > MAX_RELATED_TOTAL_BYTES
        ) {
          continue;
        }

        total_bytes += data_bytes;
        replacements.push(
          image_replacement(original_cid, data, content_type, url_mode),
        );
        missing.delete(key);
      } catch {
        continue;
      }
    }
  }

  return replacements;
}

async function with_related_replacements(
  html: string,
  cid_refs: string[],
  plan: CidResolutionPlan,
  mail_item_id: string,
  related_mail_item_ids: readonly string[],
  url_mode: CidUrlMode,
): Promise<CidResolutionPlan> {
  const related = related_mail_item_ids.filter(
    (id) => id.length > 0 && id !== mail_item_id,
  );

  if (related.length === 0 || plan.records_unavailable) return plan;

  const own_replacements = plan.is_final ? [] : plan.replacements;
  const matched = new Set(
    own_replacements.map((replacement) =>
      normalize_cid(replacement.original_cid),
    ),
  );
  const missing = new Map<string, string>();

  for (const ref of cid_refs) {
    const key = normalize_cid(ref);

    if (!matched.has(key)) missing.set(key, ref);
  }

  if (missing.size === 0) return plan;

  const extra = await plan_related_cid_replacements(
    missing,
    related,
    url_mode,
  );

  if (extra.length === 0) return plan;

  return {
    html: plan.is_final ? html : plan.html,
    replacements: [...own_replacements, ...extra],
    unresolved: Math.max(plan.unresolved - extra.length, 0),
    is_final: false,
  };
}

export async function resolve_cid_references(
  html: string,
  mail_item_id: string,
  url_mode: CidUrlMode = "blob",
  related_mail_item_ids: readonly string[] = [],
): Promise<CidResolutionResult> {
  const cid_refs = extract_cid_references(html);

  if (cid_refs.length === 0) {
    return { html, blob_urls: [], unresolved: 0 };
  }

  const key = resolution_key(mail_item_id, url_mode, html);
  let task = in_flight_resolutions.get(key);

  if (!task) {
    const created = plan_cid_resolution(
      html,
      mail_item_id,
      url_mode,
      cid_refs,
    ).finally(() => {
      if (in_flight_resolutions.get(key) === created) {
        in_flight_resolutions.delete(key);
      }
    });

    in_flight_resolutions.set(key, created);
    task = created;
  }

  return apply_cid_plan(
    await with_related_replacements(
      html,
      cid_refs,
      await task,
      mail_item_id,
      related_mail_item_ids,
      url_mode,
    ),
  );
}

async function plan_cid_resolution(
  html: string,
  mail_item_id: string,
  url_mode: CidUrlMode,
  cid_refs: string[],
): Promise<CidResolutionPlan> {
  const local_parts = get_decrypted_mime_attachments(mail_item_id);

  if (local_parts.length > 0) {
    return plan_local_cid_resolution(html, url_mode, cid_refs, local_parts);
  }

  const records = await fetch_attachment_records(mail_item_id);

  if (records.length === 0) {
    const records_unavailable = attachment_records_fetch_failed(mail_item_id);

    return {
      html: strip_unresolved_cid_references(html, records_unavailable),
      replacements: [],
      unresolved: cid_refs.length,
      records_unavailable,
      is_final: true,
    };
  }

  const unresolved_cids = new Map<string, string>();

  for (const ref of cid_refs) {
    unresolved_cids.set(normalize_cid(ref), ref);
  }

  const distinct_ref_count = unresolved_cids.size;

  const cached_meta = get_cached_attachment_meta(mail_item_id);
  const cached_by_id = new Map(
    (cached_meta ?? []).map((item) => [item.id, item]),
  );
  const meta_cache_covers_records =
    cached_meta !== null && records.every((att) => cached_by_id.has(att.id));

  type MatchTarget = {
    att: (typeof records)[number];
    meta?: AttachmentMeta;
    content_id?: string;
    filename?: string;
    content_type?: string;
    is_inline?: boolean;
  };

  let meta_results: PromiseSettledResult<unknown>[] = [];
  let decrypted_attachments: MatchTarget[];

  if (meta_cache_covers_records) {
    decrypted_attachments = records.flatMap((att) => {
      const item = cached_by_id.get(att.id);

      if (!item) return [];

      const target: MatchTarget = {
        att,
        content_id: item.content_id,
        filename: item.filename ?? undefined,
        content_type: item.content_type ?? undefined,
        is_inline: item.is_inline,
      };

      return resolved_image_content_type(target) !== null ? [target] : [];
    });
  } else {
    const settled = await Promise.allSettled(
      records.map((att) =>
        decrypt_attachment_meta(
          att.encrypted_meta,
          att.meta_nonce,
          att.mail_item_id,
          att.seq_num,
        ).then((meta) => ({ att, meta })),
      ),
    );

    meta_results = settled;
    decrypted_attachments = settled
      .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
      .filter(({ meta }) => resolved_image_content_type(meta) !== null)
      .map(({ att, meta }) => ({
        att,
        meta,
        content_id: meta.content_id,
        filename: meta.filename,
        content_type: meta.content_type,
        is_inline: meta.is_inline,
      }));
  }

  const match_strategies: ((target: MatchTarget) => string | undefined)[] = [
    (target) =>
      target.content_id ? normalize_cid(target.content_id) : undefined,
    (target) => (target.filename ? normalize_cid(target.filename) : undefined),
    (target) =>
      target.filename
        ? normalize_cid(strip_extension(target.filename))
        : undefined,
  ];

  type DecryptedEntry = MatchTarget;
  const to_fetch: (DecryptedEntry & { original_cid: string })[] = [];
  const consumed = new Set<DecryptedEntry>();

  for (const strategy of match_strategies) {
    if (unresolved_cids.size === 0) break;

    for (const entry of decrypted_attachments) {
      if (consumed.has(entry)) continue;

      const key = strategy(entry);

      if (!key) continue;

      const original_cid = unresolved_cids.get(key);

      if (!original_cid) continue;

      to_fetch.push({ ...entry, original_cid });
      unresolved_cids.delete(key);
      consumed.add(entry);
    }
  }

  if (unresolved_cids.size > 0) {
    const remaining_attachments = decrypted_attachments.filter(
      (e) => !consumed.has(e) && e.is_inline !== false,
    );
    const remaining_refs = Array.from(unresolved_cids.values());

    if (remaining_attachments.length === remaining_refs.length) {
      for (let i = 0; i < remaining_refs.length; i++) {
        to_fetch.push({
          ...remaining_attachments[i],
          original_cid: remaining_refs[i],
        });
      }
    }
  }

  const data_results = await Promise.allSettled(
    to_fetch.map(async (entry): Promise<CidReplacement> => {
      const { att, original_cid } = entry;
      const meta =
        entry.meta ??
        (await decrypt_attachment_meta(
          att.encrypted_meta,
          att.meta_nonce,
          att.mail_item_id,
          att.seq_num,
        ));

      const data = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
        att.mail_item_id,
        att.seq_num,
      );

      const content_type = resolved_image_content_type(meta) ?? "image/png";

      if (url_mode === "data") {
        return {
          original_cid,
          data_url: `data:${content_type};base64,${array_to_base64(data)}`,
        };
      }

      return {
        original_cid,
        blob: new Blob([data], { type: content_type }),
      };
    }),
  );

  const replacements = data_results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );

  const failed = [...meta_results, ...data_results].some(
    (r) => r.status === "rejected",
  );

  return {
    html,
    replacements,
    unresolved: failed
      ? Math.max(distinct_ref_count - replacements.length, 0)
      : 0,
    is_final: false,
  };
}

function plan_local_cid_resolution(
  html: string,
  url_mode: CidUrlMode,
  cid_refs: string[],
  parts: ReturnType<typeof get_decrypted_mime_attachments>,
): CidResolutionPlan {
  const images = parts.filter(
    (part) => resolved_image_content_type(part) !== null,
  );
  const replacements: CidReplacement[] = [];
  const consumed = new Set<(typeof images)[number]>();
  const keys_for = (part: (typeof images)[number]): string[] =>
    [
      part.content_id,
      part.filename,
      part.filename ? strip_extension(part.filename) : undefined,
    ].flatMap((value) => (value ? [normalize_cid(value)] : []));
  const distinct_refs = new Map<string, string>();

  for (const ref of cid_refs) distinct_refs.set(normalize_cid(ref), ref);

  for (const [key, original_cid] of distinct_refs) {
    const part = images.find(
      (candidate) => !consumed.has(candidate) && keys_for(candidate).includes(key),
    );

    if (!part) continue;

    consumed.add(part);

    const content_type = resolved_image_content_type(part) ?? "image/png";

    replacements.push(
      url_mode === "data"
        ? {
            original_cid,
            data_url: `data:${content_type};base64,${array_to_base64(part.data)}`,
          }
        : {
            original_cid,
            blob: new Blob([part.data], {
              type: content_type,
            }),
          },
    );
  }

  return {
    html,
    replacements,
    unresolved: Math.max(distinct_refs.size - replacements.length, 0),
    is_final: false,
  };
}

export function revoke_cid_blob_urls(blob_urls: string[]): void {
  for (const url of blob_urls) {
    URL.revokeObjectURL(url);
  }
}
