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
import type { } from "@/types/contacts";
import type { } from "@/services/api/user";


import {
  type Attachment,
  
  
  
  
  
  
  
  
  
  MAX_INLINE_IMAGES,
  MAX_INLINE_IMAGE_SIZE,
  MAX_TOTAL_INLINE_SIZE,
  
} from "@/components/compose/compose_shared";
import { array_to_base64 } from "@/services/crypto/envelope";


export const escape_regexp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalize_cid = (value: string): string =>
  value.replace(/^<+|>+$/g, "").trim();

export const escape_html_attr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const is_embeddable_inline_image = (att: Attachment): boolean =>
  typeof att.mime_type === "string" &&
  /^image\/[a-z0-9.+-]+$/i.test(att.mime_type) &&
  att.mime_type.toLowerCase() !== "image/svg+xml";

export interface InlineSubstitutionResult {
  content: string;
  embedded_attachment_ids: Set<string>;
}

export function apply_inline_image_substitutions(
  base_content: string,
  all_attachments: Attachment[],
): InlineSubstitutionResult {
  let content = base_content;
  const embedded_attachment_ids = new Set<string>();
  let embedded_bytes = 0;
  let embedded_count = 0;

  const within_budget = (att: Attachment): boolean =>
    embedded_count < MAX_INLINE_IMAGES &&
    att.size_bytes <= MAX_INLINE_IMAGE_SIZE &&
    embedded_bytes + att.size_bytes <= MAX_TOTAL_INLINE_SIZE;

  const to_data_url = (att: Attachment): string =>
    `data:${att.mime_type};base64,${array_to_base64(new Uint8Array(att.data))}`;

  const embed = (att: Attachment): string => {
    embedded_bytes += att.size_bytes;
    embedded_count += 1;
    embedded_attachment_ids.add(att.id);

    return to_data_url(att);
  };

  const inline_atts = all_attachments.filter(
    (att) => att.content_id && is_embeddable_inline_image(att),
  );
  const unreferenced: Attachment[] = [];

  for (const att of inline_atts) {
    const cid = normalize_cid(att.content_id || "");

    if (!cid) {
      unreferenced.push(att);
      continue;
    }

    const cid_variants = Array.from(new Set([cid, escape_html_attr(cid)]));
    const pattern = new RegExp(
      `src=["']cid:(?:${cid_variants.map(escape_regexp).join("|")})["']`,
      "gi",
    );
    const referenced = pattern.test(content);

    pattern.lastIndex = 0;

    if (!referenced) {
      unreferenced.push(att);
      continue;
    }

    if (within_budget(att)) {
      const url = embed(att);

      content = content.replace(pattern, () => `src="${url}"`);
    }
  }

  const blob_srcs = content.match(/src="blob:[^"]*"/g) || [];

  for (const blob_match of blob_srcs) {
    const att = unreferenced.shift();

    if (att && within_budget(att)) {
      const url = embed(att);

      content = content.replace(blob_match, () => `src="${url}"`);
    } else {
      content = content.replace(blob_match, () => 'src=""');
    }
  }

  for (const att of unreferenced) {
    if (!within_budget(att)) continue;

    const url = embed(att);

    content += `<br><img src="${url}" alt="${escape_html_attr(att.name)}" style="max-width:100%">`;
  }

  return { content, embedded_attachment_ids };
}

export interface UseForwardModalProps {
  is_open: boolean;
  on_close: () => void;
  sender_name: string;
  sender_email: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
  is_external: boolean;
  original_mail_id?: string;
  thread_token?: string;
  thread_ghost_email?: string;
}

