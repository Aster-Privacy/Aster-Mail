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
import { is_previewable_image } from "@/lib/attachment_utils";

export interface AttachmentBytes {
  encrypted_data: string;
  data_nonce: string;
}

const MAX_CACHED_PREVIEWS = 80;
const MAX_CACHED_BYTE_MAPS = 20;

const preview_urls = new Map<string, string>();
const byte_maps = new Map<string, Map<string, AttachmentBytes>>();
const record_fetches = new Map<string, Promise<MailAttachment[]>>();

function touch<T>(store: Map<string, T>, key: string, value: T): void {
  store.delete(key);
  store.set(key, value);
}

export function get_cached_preview_url(attachment_id: string): string | undefined {
  const url = preview_urls.get(attachment_id);

  if (url) touch(preview_urls, attachment_id, url);

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

  while (preview_urls.size > MAX_CACHED_PREVIEWS) {
    const oldest = preview_urls.keys().next().value;

    if (oldest === undefined) break;
    const evicted = preview_urls.get(oldest);

    preview_urls.delete(oldest);
    if (evicted) URL.revokeObjectURL(evicted);
  }

  return url;
}

export function get_cached_attachment_bytes(
  mail_item_id: string,
): Map<string, AttachmentBytes> | undefined {
  const bytes = byte_maps.get(mail_item_id);

  if (bytes) touch(byte_maps, mail_item_id, bytes);

  return bytes;
}

function fetch_records(mail_item_id: string): Promise<MailAttachment[]> {
  const in_flight = record_fetches.get(mail_item_id);

  if (in_flight) return in_flight;

  const task = (async () => {
    try {
      const response = await list_attachments(mail_item_id);
      const records = response.data?.attachments ?? [];

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

      return records;
    } catch {
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
          URL.createObjectURL(new Blob([data], { type: meta.content_type })),
        );
      } catch {
        return;
      }
    }),
  );
}

export function clear_attachment_preview_cache(): void {
  for (const url of preview_urls.values()) URL.revokeObjectURL(url);
  preview_urls.clear();
  byte_maps.clear();
  record_fetches.clear();
}
