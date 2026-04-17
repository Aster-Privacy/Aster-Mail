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
import { api_client, type ApiResponse } from "./client";

export interface TagDefinition {
  id: string;
  tag_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order: number;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TagsListResponse {
  tags: TagDefinition[];
  total: number;
  has_more: boolean;
}

export interface ListTagsParams {
  include_counts?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateTagRequest {
  tag_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order?: number;
}

export interface CreateTagResponse {
  id: string;
  tag_token: string;
  success: boolean;
}

export interface UpdateTagRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order?: number;
}

export interface TagCountsResponse {
  counts: { tag_token: string; count: number }[];
}

export async function list_tags(
  params: ListTagsParams = {},
): Promise<ApiResponse<TagsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.include_counts !== undefined) {
    query_params.set("include_counts", params.include_counts.toString());
  }
  if (params.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params.offset !== undefined) {
    query_params.set("offset", params.offset.toString());
  }

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/tags${query_string ? `?${query_string}` : ""}`;

  return api_client.get<TagsListResponse>(endpoint, { cache_ttl: 60_000 });
}

export async function get_tag(
  tag_id: string,
): Promise<ApiResponse<TagDefinition>> {
  return api_client.get<TagDefinition>(`/mail/v1/tags/${tag_id}`);
}

export async function create_tag(
  data: CreateTagRequest,
): Promise<ApiResponse<CreateTagResponse>> {
  return api_client.post<CreateTagResponse>("/mail/v1/tags", data);
}

export async function update_tag(
  tag_id: string,
  data: UpdateTagRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/mail/v1/tags/${tag_id}`, data);
}

export async function delete_tag(
  tag_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/mail/v1/tags/${tag_id}`);
}

export async function bulk_delete_tags(
  tag_ids: string[],
): Promise<ApiResponse<{ deleted: number; failed: string[] }>> {
  return api_client.post<{ deleted: number; failed: string[] }>(
    "/mail/v1/tags/bulk/delete",
    { tag_ids },
  );
}

export async function bulk_reorder_tags(
  tags: { id: string; sort_order: number }[],
): Promise<ApiResponse<{ updated: number }>> {
  return api_client.post<{ updated: number }>("/mail/v1/tags/bulk/reorder", {
    tags,
  });
}

export async function get_tag_counts(): Promise<
  ApiResponse<TagCountsResponse>
> {
  return api_client.get<TagCountsResponse>("/mail/v1/tags/counts", {
    cache_ttl: 60_000,
  });
}

export async function add_tag_to_item(
  item_id: string,
  data: { tag_token: string },
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `/mail/v1/messages/${item_id}/tags`,
    data,
  );
}

export async function remove_tag_from_item(
  item_id: string,
  tag_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/mail/v1/messages/${item_id}/tags/${encodeURIComponent(tag_token)}`,
  );
}

export async function bulk_add_tag(
  ids: string[],
  tag_token: string,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.post<{ status: string; affected: number }>(
    "/mail/v1/messages/bulk/tags",
    { ids, tag_token },
  );
}

export async function bulk_remove_tag(
  ids: string[],
  tag_token: string,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.post<{ status: string; affected: number }>(
    "/mail/v1/messages/bulk/tags/remove",
    { ids, tag_token },
  );
}
