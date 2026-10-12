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

import { ATTACHMENT_DETAIL_SCAN_LIMIT } from "./constants";
import { entry_haystack } from "./haystack";
import {
  AttachmentDetail,
  AttachmentDetails,
  envelope_attachments,
  matches_query,
  operator_needs_attachment_details,
} from "./matching";
import { scan_search_index } from "./scan";
import { CachedIndex, SearchOptions } from "./types";

import { type ParsedOperator } from "@/utils/search_operators";
import {
  get_cached_attachment_meta,
  prefetch_attachment_meta,
} from "@/services/attachment_meta_cache";

export async function load_attachment_details(
  index: CachedIndex,
  terms: string[],
  operators: ParsedOperator[],
  options: SearchOptions | undefined,
  is_aborted: () => boolean,
): Promise<AttachmentDetails | undefined> {
  if (!operators.some(operator_needs_attachment_details)) return undefined;

  const other_operators = operators.filter(
    (op) => !operator_needs_attachment_details(op),
  );
  const pending: string[] = [];

  await scan_search_index(
    index,
    (item, data) => {
      if (!data.metadata?.has_attachments) return true;
      if (!data.envelope || envelope_attachments(data.envelope)) return true;

      if (
        !matches_query(
          terms,
          other_operators,
          data.envelope,
          data.metadata,
          item,
          options?.label_name_to_tokens,
          options?.fields,
          options?.search_body !== false,
          data.search_body_text,
          entry_haystack(data),
        )
      ) {
        return true;
      }

      pending.push(item.id);

      return pending.length < ATTACHMENT_DETAIL_SCAN_LIMIT;
    },
    is_aborted,
  );

  if (is_aborted() || pending.length === 0) return undefined;

  const details = new Map<string, AttachmentDetail[]>();
  const missing: string[] = [];

  for (const id of pending) {
    const cached = get_cached_attachment_meta(id);

    if (cached) details.set(id, cached);
    else missing.push(id);
  }

  if (missing.length > 0) {
    await prefetch_attachment_meta(missing);

    for (const id of missing) {
      const cached = get_cached_attachment_meta(id);

      if (cached) details.set(id, cached);
    }
  }

  return details;
}
