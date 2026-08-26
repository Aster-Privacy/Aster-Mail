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
  get_cached_preview_url,
} from "@/services/attachment_preview_cache";

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
      url = url.replace(/,+$/, "");
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

export function replace_cid_reference(
  html: string,
  cid: string,
  url: string,
): string {
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

export function extract_cid_inline_filenames(html: string): Set<string> {
  const regex =
    /src=["']cid:[^"']+["'][^>]*alt=["']([^"']+)["']|alt=["']([^"']+)["'][^>]*src=["']cid:[^"']+["']/gi;
  const filenames = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const name = (match[1] || match[2] || "").toLowerCase().trim();

    if (name) filenames.add(name);
  }

  return filenames;
}

export async function resolve_cid_references(
  html: string,
  mail_item_id: string,
  url_mode: CidUrlMode = "blob",
): Promise<CidResolutionResult> {
  const cid_refs = extract_cid_references(html);

  if (cid_refs.length === 0) {
    return { html, blob_urls: [], unresolved: 0 };
  }

  const records = await fetch_attachment_records(mail_item_id);

  if (records.length === 0) {
    const records_unavailable = attachment_records_fetch_failed(mail_item_id);

    return {
      html: strip_unresolved_cid_references(html, records_unavailable),
      blob_urls: [],
      unresolved: cid_refs.length,
      records_unavailable,
    };
  }

  const decode_percent = (s: string): string => {
    if (!s.includes("%")) return s;

    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const normalize = (s: string): string =>
    decode_percent(s)
      .replace(/^<+|>+$/g, "")
      .trim()
      .toLowerCase();
  const strip_ext = (s: string): string => s.replace(/\.[^.]+$/, "");
  const unresolved_cids = new Map<string, string>();

  for (const ref of cid_refs) {
    unresolved_cids.set(normalize(ref), ref);
  }

  const distinct_ref_count = unresolved_cids.size;
  const blob_urls: string[] = [];
  let resolved_html = html;

  const meta_results = await Promise.allSettled(
    records.map((att) =>
      decrypt_attachment_meta(
        att.encrypted_meta,
        att.meta_nonce,
        att.mail_item_id,
        att.seq_num,
      ).then((meta) => ({ att, meta })),
    ),
  );

  const decrypted_attachments = meta_results
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .filter(({ meta }) => resolved_image_content_type(meta) !== null);

  const match_strategies: ((meta: AttachmentMeta) => string | undefined)[] = [
    (meta) => (meta.content_id ? normalize(meta.content_id) : undefined),
    (meta) => (meta.filename ? normalize(meta.filename) : undefined),
    (meta) => (meta.filename ? normalize(strip_ext(meta.filename)) : undefined),
  ];

  type DecryptedEntry = (typeof decrypted_attachments)[number];
  const to_fetch: (DecryptedEntry & { original_cid: string })[] = [];
  const consumed = new Set<DecryptedEntry>();

  for (const strategy of match_strategies) {
    if (unresolved_cids.size === 0) break;

    for (const entry of decrypted_attachments) {
      if (consumed.has(entry)) continue;

      const key = strategy(entry.meta);

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
      (e) => !consumed.has(e) && e.meta.is_inline !== false,
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
    to_fetch.map(async ({ att, meta, original_cid }) => {
      const cached_url =
        url_mode === "blob" ? get_cached_preview_url(att.id) : undefined;

      if (cached_url) {
        return { original_cid, url: cached_url, is_blob: false };
      }

      const data = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
        att.mail_item_id,
        att.seq_num,
      );

      if (url_mode === "data") {
        return {
          original_cid,
          url: `data:${meta.content_type};base64,${array_to_base64(data)}`,
          is_blob: false,
        };
      }

      const blob = new Blob([data], { type: meta.content_type });

      return { original_cid, url: URL.createObjectURL(blob), is_blob: true };
    }),
  );

  let replaced = 0;

  for (const result of data_results) {
    if (result.status !== "fulfilled") continue;

    const { original_cid, url, is_blob } = result.value;

    if (is_blob) blob_urls.push(url);

    replaced += 1;
    resolved_html = replace_cid_reference(resolved_html, original_cid, url);
  }

  resolved_html = strip_unresolved_cid_references(resolved_html);

  const failed = [...meta_results, ...data_results].some(
    (r) => r.status === "rejected",
  );

  return {
    html: resolved_html,
    blob_urls,
    unresolved: failed ? Math.max(distinct_ref_count - replaced, 0) : 0,
  };
}

export function revoke_cid_blob_urls(blob_urls: string[]): void {
  for (const url of blob_urls) {
    URL.revokeObjectURL(url);
  }
}
