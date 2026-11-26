//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ThreadAttachment } from "@/types/thread";
import type { CachedAttachmentMeta } from "@/services/attachment_meta_cache";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  get_cached_attachment_meta,
  prefetch_attachment_meta,
} from "@/services/attachment_meta_cache";
import { listed_attachment_rows } from "@/services/crypto/inbound_attachment_keys";
import { ignore_error } from "@/lib/ignore_error";
import {
  extract_body_inline_refs,
  without_body_inline_images,
} from "@/lib/cid_resolver";
import {
  get_shown_decrypted_mime_attachments,
  mime_attachment_bytes,
  subscribe_decrypted_mime_attachments,
} from "@/services/decrypted_mime_attachments";

export interface MobileThreadAttachment extends ThreadAttachment {
  data?: ArrayBuffer;
}

export function to_thread_attachments(
  meta: CachedAttachmentMeta[],
  fallback_filename: string,
): ThreadAttachment[] {
  return listed_attachment_rows(meta)
    .slice()
    .sort((a, b) => a.seq_num - b.seq_num)
    .map((item) => ({
      id: item.id,
      filename: item.filename || fallback_filename,
      content_type: item.content_type || "application/octet-stream",
      size: item.size_bytes,
      content_id: item.content_id,
    }));
}

export function use_thread_message_attachments(
  mail_item_id: string,
  enabled: boolean,
  fallback_filename: string,
  body_html?: string,
  decrypted_content_tag?: string,
  is_own_message = false,
): MobileThreadAttachment[] {
  const [attachments, set_attachments] = useState<ThreadAttachment[]>(() => {
    if (!enabled) return [];
    const cached = get_cached_attachment_meta(mail_item_id);

    return cached ? to_thread_attachments(cached, fallback_filename) : [];
  });

  useEffect(() => {
    if (!enabled || !mail_item_id) {
      set_attachments([]);

      return;
    }

    let cancelled = false;
    const cached = get_cached_attachment_meta(mail_item_id);

    if (cached) {
      set_attachments(to_thread_attachments(cached, fallback_filename));

      return;
    }

    set_attachments([]);
    prefetch_attachment_meta([mail_item_id])
      .then(() => {
        if (cancelled) return;
        const loaded = get_cached_attachment_meta(mail_item_id);

        set_attachments(
          loaded ? to_thread_attachments(loaded, fallback_filename) : [],
        );
      })
      .catch((caught) =>
        ignore_error("pages/mobile/use_thread_message_attachments", caught),
      );

    return () => {
      cancelled = true;
    };
  }, [mail_item_id, enabled, fallback_filename]);

  const inline_refs = useMemo(
    () =>
      body_html
        ? extract_body_inline_refs(body_html, is_own_message)
        : undefined,
    [body_html, is_own_message],
  );

  const decrypted_parts = useSyncExternalStore(
    subscribe_decrypted_mime_attachments,
    () =>
      get_shown_decrypted_mime_attachments(mail_item_id, decrypted_content_tag),
  );

  return useMemo(() => {
    const decrypted = without_body_inline_images(decrypted_parts, inline_refs);

    if (decrypted.length > 0) {
      return decrypted.map((part, index) => ({
        id: `${mail_item_id}:mime:${index}`,
        filename: part.filename || fallback_filename,
        content_type: part.content_type || "application/octet-stream",
        size: part.data.byteLength,
        content_id: part.content_id,
        data: mime_attachment_bytes(part),
      }));
    }

    return without_body_inline_images(attachments, inline_refs);
  }, [
    attachments,
    decrypted_parts,
    inline_refs,
    mail_item_id,
    fallback_filename,
  ]);
}
