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
import {
  DEFAULT_ATTACHMENT_CONTENT_TYPE,
  resolve_attachment_meta,
} from "@/services/crypto/attachment_crypto";
import {
  attachment_keys_version,
  get_attachment_entry,
  listed_attachment_rows,
} from "@/services/crypto/inbound_attachment_keys";
import { ignore_error } from "@/lib/ignore_error";

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
const MAX_META_BATCH_SIZE = 50;
const PREFETCH_FAILURE_PAUSE_MS = 30_000;

let prefetch_paused_until = 0;

interface MetaCacheEntry {
  items: CachedAttachmentMeta[];
  keys_version: number;
}

const meta_cache = new Map<string, MetaCacheEntry>();
const meta_in_flight = new Map<string, Promise<void>>();

function current_cache_entry(mail_item_id: string): MetaCacheEntry | null {
  const entry = meta_cache.get(mail_item_id);

  if (!entry) return null;

  if (entry.keys_version !== attachment_keys_version(mail_item_id)) {
    meta_cache.delete(mail_item_id);

    return null;
  }

  return entry;
}

function with_sealed_fields(item: CachedAttachmentMeta): CachedAttachmentMeta {
  const sealed = get_attachment_entry(item.mail_item_id, item.seq_num);

  if (sealed?.sealed !== true) return item;

  const filename = sealed.filename ?? null;

  return {
    ...item,
    filename,
    content_type:
      filename === null
        ? null
        : (sealed.content_type ?? DEFAULT_ATTACHMENT_CONTENT_TYPE),
    content_id: sealed.content_id,
    is_inline: sealed.is_inline === true,
  };
}

export function get_cached_attachment_meta(
  mail_item_id: string,
): CachedAttachmentMeta[] | null {
  const entry = current_cache_entry(mail_item_id);

  if (!entry) return null;

  return listed_attachment_rows(entry.items).map(with_sealed_fields);
}

export function clear_attachment_meta_cache(): void {
  meta_cache.clear();
  prefetch_paused_until = 0;
}

function store_cached_meta(
  mail_item_id: string,
  items: CachedAttachmentMeta[],
  keys_version: number,
): void {
  if (items.some((item) => item.filename === null)) return;

  if (
    !meta_cache.has(mail_item_id) &&
    meta_cache.size >= MAX_CACHED_MAIL_ITEMS
  ) {
    const oldest = meta_cache.keys().next();

    if (!oldest.done) meta_cache.delete(oldest.value);
  }

  meta_cache.set(mail_item_id, { items, keys_version });
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
  const is_paused = Date.now() < prefetch_paused_until;

  for (const mail_item_id of mail_item_ids) {
    if (!mail_item_id) continue;
    if (current_cache_entry(mail_item_id)) continue;

    const in_flight = meta_in_flight.get(mail_item_id);

    if (in_flight) {
      pending.push(in_flight);
      continue;
    }

    if (is_paused) continue;

    if (!to_fetch.includes(mail_item_id)) to_fetch.push(mail_item_id);
  }

  if (to_fetch.length > 0) {
    const task = (async () => {
      try {
        for (
          let offset = 0;
          offset < to_fetch.length;
          offset += MAX_META_BATCH_SIZE
        ) {
          const chunk = to_fetch.slice(offset, offset + MAX_META_BATCH_SIZE);
          const versions = new Map(
            chunk.map((id) => [id, attachment_keys_version(id)]),
          );
          const response = await batch_attachment_meta(chunk);
          const items = response.data?.items;

          if (response.error) {
            prefetch_paused_until = Date.now() + PREFETCH_FAILURE_PAUSE_MS;
            break;
          }

          if (!items) continue;

          for (const mail_item_id of chunk) {
            const list = listed_attachment_rows(items[mail_item_id] ?? []);
            const cached = await Promise.all(list.map(to_cached_meta));

            store_cached_meta(
              mail_item_id,
              cached,
              versions.get(mail_item_id) ?? 0,
            );
          }
        }
      } catch (caught) {
        ignore_error("services/attachment_meta_cache:task", caught);
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
