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
import { list_mail_items } from "@/services/api/mail";
import { filter_locked_mail_items } from "@/services/locked_folders";
import { build_view_list_params } from "@/hooks/email_list_helpers/views";

export const SCOPE_ID_PAGE_SIZE = 500;

export const SCOPE_ID_MAX = 50_000;

export interface CollectScopeIdsOptions {
  view: string;
  exclude_ids?: string[];
  signal?: AbortSignal;
  on_progress?: (collected: number) => void;
}

export interface CollectedScopeIds {
  ids: string[];
  capped: boolean;
}

export async function collect_scope_ids({
  view,
  exclude_ids = [],
  signal,
  on_progress,
}: CollectScopeIdsOptions): Promise<CollectedScopeIds> {
  const base_params = build_view_list_params(view);
  const excluded = new Set(exclude_ids);
  const seen = new Set<string>();
  const ids: string[] = [];

  let offset = 0;
  let capped = false;

  for (;;) {
    if (signal?.aborted) break;

    const response = await list_mail_items({
      ...base_params,
      limit: SCOPE_ID_PAGE_SIZE,
      offset,
      order: "desc",
      group_by_thread: false,
      skip_total: true,
      include_envelope: false,
    });

    if (response.error || !response.data) {
      throw new Error(response.error || "failed to list conversations");
    }

    const items = response.data.items;

    if (items.length === 0) break;

    offset += items.length;

    for (const item of filter_locked_mail_items(items)) {
      if (item.is_reaction === true) continue;
      if (excluded.has(item.id) || seen.has(item.id)) continue;

      seen.add(item.id);
      ids.push(item.id);

      if (ids.length >= SCOPE_ID_MAX) {
        capped = true;
        break;
      }
    }

    on_progress?.(ids.length);

    if (capped || !response.data.has_more) break;
  }

  return { ids, capped };
}
