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
import type { Attachment } from "@/components/compose/compose_shared";
import type { AttachmentMeta } from "@/services/crypto/attachment_crypto";

import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";
import {
  extract_cid_references,
  extract_cid_inline_filenames,
} from "@/lib/cid_resolver";
import {
  generate_attachment_id,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENTS_SIZE,
} from "@/components/compose/compose_shared";
import { format_bytes } from "@/lib/utils";

export interface LoadForwardAttachmentsOptions {
  body_html?: string;
  existing_bytes?: number;
  is_cancelled?: () => boolean;
}

function normalize_reference(value: string): string {
  return value
    .replace(/^<+|>+$/g, "")
    .trim()
    .toLowerCase();
}

function is_inline_source_attachment(
  meta: AttachmentMeta,
  inline_cids: Set<string>,
  inline_filenames: Set<string>,
): boolean {
  if (meta.is_inline) return true;

  const content_id = meta.content_id
    ? normalize_reference(meta.content_id)
    : "";

  if (content_id && inline_cids.has(content_id)) return true;

  const filename = meta.filename ? normalize_reference(meta.filename) : "";

  if (
    !content_id &&
    filename &&
    inline_filenames.size > 0 &&
    meta.content_type.startsWith("image/") &&
    inline_filenames.has(filename)
  ) {
    return true;
  }

  return false;
}

export async function load_forward_attachments(
  mail_item_id: string,
  options: LoadForwardAttachmentsOptions = {},
): Promise<Attachment[]> {
  const { body_html = "", existing_bytes = 0, is_cancelled } = options;

  if (!mail_item_id) return [];

  let response;

  try {
    response = await list_attachments(mail_item_id);
  } catch {
    return [];
  }

  const items = response.data?.attachments;

  if (response.error || !items || items.length === 0) return [];
  if (is_cancelled?.()) return [];

  const inline_cids = new Set(
    extract_cid_references(body_html).map(normalize_reference),
  );
  const inline_filenames = new Set(
    Array.from(extract_cid_inline_filenames(body_html)).map(
      normalize_reference,
    ),
  );

  const meta_results = await Promise.allSettled(
    items.map(async (item) => ({
      item,
      meta: await decrypt_attachment_meta(
        item.encrypted_meta,
        item.meta_nonce,
        item.mail_item_id,
        item.seq_num,
      ),
    })),
  );

  const carried: Attachment[] = [];
  let running_total = existing_bytes;

  for (const result of meta_results) {
    if (is_cancelled?.()) return carried;
    if (result.status !== "fulfilled") continue;

    const { item, meta } = result.value;

    if (is_inline_source_attachment(meta, inline_cids, inline_filenames)) {
      continue;
    }

    try {
      const data = await decrypt_attachment_data(
        item.encrypted_data,
        item.data_nonce,
        meta.session_key,
        item.mail_item_id,
        item.seq_num,
      );

      if (data.byteLength > MAX_ATTACHMENT_SIZE) continue;
      if (running_total + data.byteLength > MAX_TOTAL_ATTACHMENTS_SIZE)
        continue;

      running_total += data.byteLength;

      carried.push({
        id: generate_attachment_id(),
        name: meta.filename,
        size: format_bytes(data.byteLength),
        size_bytes: data.byteLength,
        mime_type: meta.content_type,
        data,
        content_id: meta.content_id,
      });
    } catch {
      continue;
    }
  }

  return carried;
}
