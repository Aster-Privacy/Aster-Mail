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
import {
  batch_attachment_meta,
  type AttachmentMetaItem,
} from "@/services/api/attachments";
import { resolve_attachment_meta } from "@/services/crypto/attachment_crypto";

export interface CachedAttachmentMeta {
  id: string;
  mail_item_id: string;
  seq_num: number;
  size_bytes: number;
  encrypted_meta: string;
  meta_nonce: string;
  filename: string | null;
  content_type: string | null;
  content_id?: string;
  is_inline?: boolean;
}

const MAX_CACHED_MAIL_ITEMS = 200;

const meta_cache = new Map<string, CachedAttachmentMeta[]>();
const meta_in_flight = new Map<string, Promise<void>>();

export function get_cached_attachment_meta(
  mail_item_id: string,
): CachedAttachmentMeta[] | null {
  return meta_cache.get(mail_item_id) ?? null;
}

export function clear_attachment_meta_cache(): void {
  meta_cache.clear();
}

function store_cached_meta(
  mail_item_id: string,
  items: CachedAttachmentMeta[],
): void {
  if (!meta_cache.has(mail_item_id) && meta_cache.size >= MAX_CACHED_MAIL_ITEMS) {
    const oldest = meta_cache.keys().next();

    if (!oldest.done) meta_cache.delete(oldest.value);
  }

  meta_cache.set(mail_item_id, items);
}

async function to_cached_meta(
  item: AttachmentMetaItem,
): Promise<CachedAttachmentMeta> {
  const base = {
    id: item.id,
    mail_item_id: item.mail_item_id,
    seq_num: item.seq_num,
    encrypted_meta: item.encrypted_meta,
    meta_nonce: item.meta_nonce,
  };

  const meta = await resolve_attachment_meta({
    encrypted_meta: item.encrypted_meta,
    meta_nonce: item.meta_nonce,
    mail_item_id: item.mail_item_id,
    seq_num: item.seq_num,
    size_bytes: item.size_bytes,
  });

  return {
    ...base,
    size_bytes: meta.size_bytes || item.size_bytes,
    filename: meta.filename,
    content_type: meta.content_type,
    content_id: meta.content_id,
    is_inline: meta.is_inline,
  };
}

export function prefetch_attachment_meta(
  mail_item_ids: string[],
): Promise<void> {
  const pending: Promise<void>[] = [];
  const to_fetch: string[] = [];

  for (const mail_item_id of mail_item_ids) {
    if (!mail_item_id) continue;
    if (meta_cache.has(mail_item_id)) continue;

    const in_flight = meta_in_flight.get(mail_item_id);

    if (in_flight) {
      pending.push(in_flight);
      continue;
    }

    if (!to_fetch.includes(mail_item_id)) to_fetch.push(mail_item_id);
  }

  if (to_fetch.length > 0) {
    const task = (async () => {
      try {
        const response = await batch_attachment_meta(to_fetch);
        const items = response.data?.items;

        if (!items) return;

        for (const mail_item_id of to_fetch) {
          const list = items[mail_item_id] ?? [];
          const cached = await Promise.all(list.map(to_cached_meta));

          store_cached_meta(mail_item_id, cached);
        }
      } catch {
      } finally {
        for (const mail_item_id of to_fetch) {
          meta_in_flight.delete(mail_item_id);
        }
      }
    })();

    for (const mail_item_id of to_fetch) {
      meta_in_flight.set(mail_item_id, task);
    }

    pending.push(task);
  }

  return Promise.all(pending).then(() => undefined);
}
