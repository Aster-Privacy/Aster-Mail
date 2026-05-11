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

import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/avif",
]);

export interface CidResolutionResult {
  html: string;
  blob_urls: string[];
}

export function extract_cid_references(html: string): string[] {
  const cid_regex = /src=["']cid:([^"']+)["']/gi;
  const cids: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = cid_regex.exec(html)) !== null) {
    cids.push(match[1]);
  }

  return cids;
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
): Promise<CidResolutionResult> {
  const cid_refs = extract_cid_references(html);

  if (cid_refs.length === 0) {
    return { html, blob_urls: [] };
  }

  const response = await list_attachments(mail_item_id);

  if (response.error || !response.data) {
    return { html, blob_urls: [] };
  }

  const normalize = (s: string): string =>
    s.replace(/^<+|>+$/g, "").trim().toLowerCase();
  const strip_ext = (s: string): string => s.replace(/\.[^.]+$/, "");
  const unresolved_cids = new Map<string, string>();

  for (const ref of cid_refs) {
    unresolved_cids.set(normalize(ref), ref);
  }

  const blob_urls: string[] = [];
  let resolved_html = html;

  const decrypted_attachments: { att: typeof response.data.attachments[number]; meta: AttachmentMeta }[] = [];

  for (const att of response.data.attachments) {
    try {
      const meta = await decrypt_attachment_meta(att.encrypted_meta, att.meta_nonce);

      if (ALLOWED_IMAGE_TYPES.has(meta.content_type.toLowerCase())) {
        decrypted_attachments.push({ att, meta });
      }
    } catch {
      continue;
    }
  }

  const match_strategies: ((meta: AttachmentMeta) => string | undefined)[] = [
    (meta) => meta.content_id ? normalize(meta.content_id) : undefined,
    (meta) => meta.filename ? normalize(meta.filename) : undefined,
    (meta) => meta.filename ? normalize(strip_ext(meta.filename)) : undefined,
  ];

  const substitute = async (att: typeof response.data.attachments[number], meta: AttachmentMeta, original_cid: string): Promise<boolean> => {
    try {
      const data = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
      );
      const blob = new Blob([data], { type: meta.content_type });
      const blob_url = URL.createObjectURL(blob);

      blob_urls.push(blob_url);

      const escaped_cid = original_cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const replace_regex = new RegExp(`src=["']cid:${escaped_cid}["']`, "gi");

      resolved_html = resolved_html.replace(replace_regex, `src="${blob_url}"`);

      return true;
    } catch {
      return false;
    }
  };

  const consumed = new Set<typeof decrypted_attachments[number]>();

  for (const strategy of match_strategies) {
    if (unresolved_cids.size === 0) break;

    for (const entry of decrypted_attachments) {
      if (consumed.has(entry)) continue;

      const key = strategy(entry.meta);

      if (!key) continue;

      const original_cid = unresolved_cids.get(key);

      if (!original_cid) continue;

      if (await substitute(entry.att, entry.meta, original_cid)) {
        unresolved_cids.delete(key);
        consumed.add(entry);
      }
    }
  }

  if (unresolved_cids.size > 0) {
    const remaining_attachments = decrypted_attachments.filter((e) => !consumed.has(e));
    const remaining_refs = Array.from(unresolved_cids.values());

    if (remaining_attachments.length === remaining_refs.length) {
      for (let i = 0; i < remaining_refs.length; i++) {
        await substitute(
          remaining_attachments[i].att,
          remaining_attachments[i].meta,
          remaining_refs[i],
        );
      }
    }
  }

  return { html: resolved_html, blob_urls };
}

export function revoke_cid_blob_urls(blob_urls: string[]): void {
  for (const url of blob_urls) {
    URL.revokeObjectURL(url);
  }
}
