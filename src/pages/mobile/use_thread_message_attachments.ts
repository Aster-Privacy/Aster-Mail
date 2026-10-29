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

import { useEffect, useState } from "react";

import {
  get_cached_attachment_meta,
  prefetch_attachment_meta,
} from "@/services/attachment_meta_cache";
import { listed_attachment_rows } from "@/services/crypto/inbound_attachment_keys";
import { ignore_error } from "@/lib/ignore_error";

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
): ThreadAttachment[] {
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

  return attachments;
}
