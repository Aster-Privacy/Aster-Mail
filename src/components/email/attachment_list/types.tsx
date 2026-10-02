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
import type {} from "@/lib/i18n/types";

import { type CachedAttachmentMeta } from "@/services/attachment_meta_cache";
import { get_cached_preview_url } from "@/services/attachment_preview_cache";

export interface DecryptedAttachmentInfo {
  id: string;
  mail_item_id: string;
  seq_num: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  preview_url?: string;
}

export function build_cards_from_cached_meta(
  cached: CachedAttachmentMeta[],
  fallback_filename: string,
): DecryptedAttachmentInfo[] {
  const cards: DecryptedAttachmentInfo[] = [];

  for (const item of cached) {
    cards.push({
      id: item.id,
      mail_item_id: item.mail_item_id,
      seq_num: item.seq_num,
      filename: item.filename ?? fallback_filename,
      content_type: item.content_type ?? "application/octet-stream",
      size_bytes: item.size_bytes,
      encrypted_data: "",
      data_nonce: "",
      encrypted_meta: item.encrypted_meta,
      meta_nonce: item.meta_nonce,
      preview_url: get_cached_preview_url(item.id),
    });
  }

  return cards;
}

export const PREVIEW_READY_TIMEOUT_MS = 6000;

export interface AttachmentListProps {
  mail_item_id: string;
  is_external?: boolean;
  has_recipient_key?: boolean;
  e2e_verified?: boolean;
  is_local?: boolean;
  hint_attachment_count?: number;
}
