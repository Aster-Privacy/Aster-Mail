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
  list_attachments,
  type MailAttachment,
} from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";
import {
  is_previewable_image,
  build_previewable_image_blob,
} from "@/lib/attachment_utils";

export interface AttachmentBytes {
  encrypted_data: string;
  data_nonce: string;
}

const MAX_CACHED_PREVIEWS = 80;

const HARD_MAX_CACHED_PREVIEWS = 400;

const PREVIEW_EVICT_GRACE_MS = 5000;

const preview_touched_at = new Map<string, number>();
const MAX_CACHED_BYTE_MAPS = 20;

const preview_urls = new Map<string, string>();
const byte_maps = new Map<string, Map<string, AttachmentBytes>>();
const record_fetches = new Map<string, Promise<MailAttachment[]>>();

function touch<T>(store: Map<string, T>, key: string, value: T): void {
  store.delete(key);
  store.set(key, value);
}

export function get_cached_preview_url(
  attachment_id: string,
): string | undefined {
  const url = preview_urls.get(attachment_id);

  if (url) {
    touch(preview_urls, attachment_id, url);
    preview_touched_at.set(attachment_id, Date.now());
  }

  return url;
}

export function set_cached_preview_url(
  attachment_id: string,
  url: string,
): string {
  const existing = preview_urls.get(attachment_id);

  if (existing) {
    if (existing !== url) URL.revokeObjectURL(url);
    touch(preview_urls, attachment_id, existing);

    return existing;
  }

  touch(preview_urls, attachment_id, url);
  preview_touched_at.set(attachment_id, Date.now());
  evict_stale_previews();

  return url;
}

function evict_stale_previews(): void {
  const now = Date.now();

  while (preview_urls.size > MAX_CACHED_PREVIEWS) {
    const over_hard_limit = preview_urls.size > HARD_MAX_CACHED_PREVIEWS;
    let victim: string | undefined;

    for (const key of preview_urls.keys()) {
      const touched = preview_touched_at.get(key) ?? 0;

      if (over_hard_limit || now - touched > PREVIEW_EVICT_GRACE_MS) {
        victim = key;
        break;
      }
    }

    if (victim === undefined) break;

    const evicted = preview_urls.get(victim);

    preview_urls.delete(victim);
    preview_touched_at.delete(victim);
    if (evicted) URL.revokeObjectURL(evicted);
  }
}

export function get_cached_attachment_bytes(
  mail_item_id: string,
): Map<string, AttachmentBytes> | undefined {
  const bytes = byte_maps.get(mail_item_id);

  if (bytes) touch(byte_maps, mail_item_id, bytes);

  return bytes;
}

const record_fetch_failures = new Set<string>();

export function attachment_records_fetch_failed(mail_item_id: string): boolean {
  return record_fetch_failures.has(mail_item_id);
}

function fetch_records(mail_item_id: string): Promise<MailAttachment[]> {
  const in_flight = record_fetches.get(mail_item_id);

  if (in_flight) return in_flight;

  const task = (async () => {
    try {
      const response = await list_attachments(mail_item_id);

      if (response.error || !response.data) {
        record_fetch_failures.add(mail_item_id);

        return [];
      }

      const records = response.data.attachments ?? [];

      if (records.length > 0) {
        const byte_map = new Map<string, AttachmentBytes>(
          records.map((att) => [
            att.id,
            { encrypted_data: att.encrypted_data, data_nonce: att.data_nonce },
          ]),
        );

        touch(byte_maps, mail_item_id, byte_map);

        while (byte_maps.size > MAX_CACHED_BYTE_MAPS) {
          const oldest = byte_maps.keys().next().value;

          if (oldest === undefined) break;
          byte_maps.delete(oldest);
        }
      }

      record_fetch_failures.delete(mail_item_id);

      return records;
    } catch {
      record_fetch_failures.add(mail_item_id);

      return [];
    }
  })().finally(() => {
    record_fetches.delete(mail_item_id);
  });

  record_fetches.set(mail_item_id, task);

  return task;
}

export function fetch_attachment_records(
  mail_item_id: string,
): Promise<MailAttachment[]> {
  return fetch_records(mail_item_id);
}

export async function fetch_attachment_bytes(
  mail_item_id: string,
): Promise<Map<string, AttachmentBytes>> {
  const cached = get_cached_attachment_bytes(mail_item_id);

  if (cached) return cached;

  await fetch_records(mail_item_id);

  return get_cached_attachment_bytes(mail_item_id) ?? new Map();
}

export async function prefetch_attachment_previews(
  mail_item_id: string,
): Promise<void> {
  const records = await fetch_records(mail_item_id);

  await Promise.all(
    records.map(async (att) => {
      if (get_cached_preview_url(att.id)) return;

      try {
        const meta = await decrypt_attachment_meta(
          att.encrypted_meta,
          att.meta_nonce,
          att.mail_item_id,
          att.seq_num,
        );

        if (!is_previewable_image(meta.content_type)) return;

        const data = await decrypt_attachment_data(
          att.encrypted_data,
          att.data_nonce,
          meta.session_key,
          att.mail_item_id,
          att.seq_num,
        );

        set_cached_preview_url(
          att.id,
          URL.createObjectURL(
            build_previewable_image_blob(data, meta.content_type),
          ),
        );
      } catch {
        return;
      }
    }),
  );
}

export function clear_attachment_preview_cache(): void {
  for (const url of preview_urls.values()) URL.revokeObjectURL(url);
  preview_touched_at.clear();
  preview_urls.clear();
  byte_maps.clear();
  record_fetches.clear();
  record_fetch_failures.clear();
}
