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
import { } from "@/services/crypto/constants";
import type { } from "@/lib/i18n/types";

import { api_client, type ApiResponse } from "../client";

import { } from "@/lib/i18n/translations/en";
import { } from "@/services/crypto/secure_memory";
import { } from "@/services/crypto/legacy_keks";


import { AliasCountsResponse, AliasListResponse, AliasUnreadCountsResponse, EmailAlias, ListDeletedAliasesResponse } from "./types";
export async function list_aliases(params?: {
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<AliasListResponse>> {
  const query_params = new URLSearchParams();

  if (params?.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params?.offset !== undefined) {
    query_params.set("offset", params.offset.toString());
  }

  const query_string = query_params.toString();
  const endpoint = `/addresses/v1/aliases${query_string ? `?${query_string}` : ""}`;

  return api_client.get<AliasListResponse>(endpoint);
}

export const ALIAS_FETCH_PAGE_SIZE = 1000;
export const ALIAS_FETCH_MAX_PAGES = 100;

export async function fetch_alias_page_with_retry(
  limit: number,
  offset: number,
): Promise<AliasListResponse | null> {
  const first_attempt = await list_aliases({ limit, offset });

  if (first_attempt.data) return first_attempt.data;

  const second_attempt = await list_aliases({ limit, offset });

  return second_attempt.data ?? null;
}

export async function list_all_aliases(): Promise<{
  aliases: EmailAlias[];
  max_aliases: number;
  total: number;
  error?: string;
}> {
  const first_response = await list_aliases({
    limit: ALIAS_FETCH_PAGE_SIZE,
    offset: 0,
  });

  if (!first_response.data) {
    return {
      aliases: [],
      max_aliases: 0,
      total: 0,
      error: first_response.error,
    };
  }

  const first_page = first_response.data;
  const aliases = [...first_page.aliases];
  const max_aliases = first_page.max_aliases;
  const total = first_page.total;

  if (!first_page.has_more || first_page.aliases.length === 0) {
    return { aliases, max_aliases, total };
  }

  const effective_page_size = first_page.aliases.length;
  const remaining = Math.max(0, total - effective_page_size);
  const remaining_pages = Math.min(
    Math.ceil(remaining / effective_page_size),
    ALIAS_FETCH_MAX_PAGES - 1,
  );

  const page_results = await Promise.all(
    Array.from({ length: remaining_pages }, (_, i) =>
      fetch_alias_page_with_retry(
        effective_page_size,
        effective_page_size * (i + 1),
      ),
    ),
  );

  const seen_ids = new Set(aliases.map((a) => a.id));

  for (const page of page_results) {
    if (!page) continue;

    for (const alias of page.aliases) {
      if (seen_ids.has(alias.id)) continue;
      seen_ids.add(alias.id);
      aliases.push(alias);
    }
  }

  return { aliases, max_aliases, total };
}

export async function get_alias_counts(): Promise<
  ApiResponse<AliasCountsResponse>
> {
  const response = await api_client.get<Record<string, unknown>>(
    "/addresses/v1/aliases/counts",
  );

  if (response.data) {
    const d = response.data;

    return {
      data: {
        count: (d.count ?? d.current_count ?? 0) as number,
        max: (d.max ?? d.max_aliases ?? 0) as number,
        can_create: (d.can_create ?? false) as boolean,
      },
    };
  }

  return response as unknown as ApiResponse<AliasCountsResponse>;
}

export async function get_alias_unread_counts(): Promise<
  ApiResponse<AliasUnreadCountsResponse>
> {
  return api_client.get<AliasUnreadCountsResponse>(
    "/addresses/v1/aliases/unread-counts",
    { skip_cache: true },
  );
}

export async function list_deleted_aliases(): Promise<
  ApiResponse<ListDeletedAliasesResponse>
> {
  return api_client.get<ListDeletedAliasesResponse>(
    "/addresses/v1/aliases/deleted",
  );
}

