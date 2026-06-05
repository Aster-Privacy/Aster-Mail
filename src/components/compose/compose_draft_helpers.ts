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
import type { Badge } from "@/services/api/user";
import type { DraftAttachmentData } from "@/services/api/multi_drafts";
import type { Attachment } from "@/components/compose/compose_shared";

import {
  array_buffer_to_base64,
  base64_to_array_buffer,
} from "@/components/compose/compose_base64";

export function attachments_to_draft_data(
  attachments: Attachment[],
): DraftAttachmentData[] {
  return attachments.map((att) => ({
    id: att.id,
    name: att.name,
    size: att.size,
    size_bytes: att.size_bytes,
    mime_type: att.mime_type,
    data_base64: array_buffer_to_base64(att.data),
    content_id: att.content_id,
  }));
}

export function draft_data_to_attachments(
  data: DraftAttachmentData[],
): Attachment[] {
  return data.map((da) => ({
    id: da.id,
    name: da.name,
    size: da.size,
    size_bytes: da.size_bytes,
    mime_type: da.mime_type,
    data: base64_to_array_buffer(da.data_base64),
    content_id: da.content_id,
  }));
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function escape_html_attr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function build_badge_html(badges: Badge[]): string {
  if (badges.length === 0) return "";

  const items = badges
    .map((b) => {
      const safe_color = HEX_COLOR_RE.test(b.color) ? b.color : "#6366f1";
      const safe_name = escape_html_attr(b.display_name);
      return `<span style="display:inline-block;color:${safe_color};border:1px solid ${safe_color}40;background-color:${safe_color}15;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">&#9733; ${safe_name}</span>`;
    })
    .join(" ");

  return `<br><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding:4px 0;">${items}</td></tr></table>`;
}
