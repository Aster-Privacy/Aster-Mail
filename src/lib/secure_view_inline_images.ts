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

import { array_to_base64 } from "@/services/crypto/base64";
import {
  extract_cid_references,
  replace_cid_reference,
  resolved_image_content_type,
  strip_unresolved_cid_references,
} from "@/lib/cid_resolver";

export interface SecureViewInlineAttachment {
  filename: string;
  content_type: string;
  data: Uint8Array;
}

const MAX_INLINE_BYTES = 8 * 1024 * 1024;

function normalize_cid(cid: string): string {
  let value = cid.trim();

  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1);
  }

  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return value.toLowerCase();
    }
  }

  return value.toLowerCase();
}

function without_extension(value: string): string {
  const dot = value.lastIndexOf(".");

  return dot > 0 ? value.slice(0, dot) : value;
}

function matches_attachment(cid: string, filename: string): boolean {
  const normalized_cid = normalize_cid(cid);
  const normalized_name = filename.trim().toLowerCase();

  if (!normalized_cid || !normalized_name) return false;
  if (normalized_cid === normalized_name) return true;

  return (
    without_extension(normalized_cid) === without_extension(normalized_name)
  );
}

export function inline_secure_view_images(
  html: string,
  attachments: SecureViewInlineAttachment[],
): string {
  if (!html) return html;

  const references = extract_cid_references(html);

  if (references.length === 0) return html;

  let result = html;
  let budget = MAX_INLINE_BYTES;
  const seen = new Set<string>();

  for (const cid of references) {
    const key = normalize_cid(cid);

    if (seen.has(key)) continue;

    seen.add(key);

    const match = attachments.find((attachment) =>
      matches_attachment(cid, attachment.filename),
    );

    if (!match) continue;

    const content_type = resolved_image_content_type({
      content_type: match.content_type,
      filename: match.filename,
      is_inline: true,
    });

    if (!content_type) continue;
    if (match.data.length > budget) continue;

    budget -= match.data.length;

    result = replace_cid_reference(
      result,
      cid,
      `data:${content_type};base64,${array_to_base64(match.data)}`,
    );
  }

  return strip_unresolved_cid_references(result);
}
