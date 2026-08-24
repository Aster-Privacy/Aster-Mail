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

export interface FolderDefinition {
  id: string;
  folder_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  is_system: boolean;
  is_locked: boolean;
  folder_type: string;
  is_password_protected: boolean;
  password_set: boolean;
  password_salt?: string;
  sort_order: number;
  parent_token?: string;
  item_count?: number;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface FoldersListResponse {
  folders: FolderDefinition[];
  total: number;
  has_more: boolean;
}

export interface ListFoldersParams {
  include_system?: boolean;
  limit?: number;
  offset?: number;
  include_counts?: boolean;
  parent_token?: string;
}

export interface CreateFolderRequest {
  folder_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  is_system?: boolean;
  sort_order?: number;
  parent_token?: string;
  folder_type?: string;
}

export interface CreateFolderResponse {
  id: string;
  folder_token: string;
  success: boolean;
}

export interface UpdateFolderRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  sort_order?: number;
  parent_token?: string;
  is_locked?: boolean;
}

export interface BulkDeleteFoldersRequest {
  folder_ids: string[];
}

export interface BulkDeleteFoldersResponse {
  deleted: number;
  failed: string[];
}

export interface BulkReorderFoldersRequest {
  folders: { id: string; sort_order: number }[];
}

export interface BulkReorderFoldersResponse {
  updated: number;
}

export interface FolderStatsResponse {
  total_folders: number;
  system_folders: number;
  custom_folders: number;
  total_labeled_items: number;
}

export interface FolderCountsResponse {
  counts: { folder_token: string; count: number; unread_count: number }[];
}

interface ApiLabelResponse {
  id: string;
  label_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  encrypted_icon?: string;
  icon_nonce?: string;
  is_system: boolean;
  is_locked: boolean;
  folder_type: string;
  is_password_protected: boolean;
  password_set: boolean;
  sort_order: number;
  parent_token?: string;
  item_count?: number;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

interface ApiLabelsListResponse {
  labels: ApiLabelResponse[];
  total: number;
  has_more: boolean;
}

const FOLDER_PAGE_SIZE = 500;
const FOLDER_PAGE_LIMIT = 10;

export async function list_folders(
  params: ListFoldersParams = {},
): Promise<ApiResponse<FoldersListResponse>> {
  if (params.limit !== undefined || params.offset !== undefined) {
    return fetch_folder_page(params);
  }

  const folders: FolderDefinition[] = [];
  let total = 0;

  for (let page = 0; page < FOLDER_PAGE_LIMIT; page += 1) {
    const response = await fetch_folder_page({
      ...params,
      limit: FOLDER_PAGE_SIZE,
      offset: page * FOLDER_PAGE_SIZE,
    });

    if (response.error || !response.data) {
      return folders.length > 0
        ? { data: { folders, total, has_more: false } }
        : response;
    }

    folders.push(...response.data.folders);
    total = response.data.total;

    if (!response.data.has_more || response.data.folders.length === 0) {
      return { data: { folders, total, has_more: false } };
    }
  }

  return { data: { folders, total, has_more: true } };
}

async function fetch_folder_page(
  params: ListFoldersParams = {},
): Promise<ApiResponse<FoldersListResponse>> {
  const query_params = new URLSearchParams();

  if (params.include_system !== undefined) {
    query_params.set("include_system", params.include_system.toString());
  }
  if (params.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params.offset !== undefined) {
    query_params.set("offset", params.offset.toString());
  }
  if (params.include_counts !== undefined) {
    query_params.set("include_counts", params.include_counts.toString());
  }
  if (params.parent_token !== undefined) {
    query_params.set("parent_token", params.parent_token);
  }

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/labels${query_string ? `?${query_string}` : ""}`;

  const response = await api_client.get<ApiLabelsListResponse>(endpoint, {
    cache_ttl: 60_000,
  });

  if (response.data) {
    return {
      ...response,
      data: {
        folders: response.data.labels.map((label) => ({
          id: label.id,
          folder_token: label.label_token,
          encrypted_name: label.encrypted_name,
          name_nonce: label.name_nonce,
          encrypted_color: label.encrypted_color,
          color_nonce: label.color_nonce,
          encrypted_icon: label.encrypted_icon,
          icon_nonce: label.icon_nonce,
          is_system: label.is_system,
          is_locked: label.is_locked,
          folder_type: label.folder_type,
          is_password_protected: label.is_password_protected,
          password_set: label.password_set,
          sort_order: label.sort_order,
          parent_token: label.parent_token,
          item_count: label.item_count,
          unread_count: label.unread_count,
          created_at: label.created_at,
          updated_at: label.updated_at,
        })),
        total: response.data.total,
        has_more: response.data.has_more,
      },
    };
  }

  return { error: response.error, code: response.code };
}

export async function get_folder(
  folder_id: string,
): Promise<ApiResponse<FolderDefinition>> {
  return api_client.get<FolderDefinition>(`/mail/v1/labels/${folder_id}`);
}

export async function create_folder(
  data: CreateFolderRequest,
): Promise<ApiResponse<CreateFolderResponse>> {
  const api_data: Record<string, unknown> = {
    label_token: data.folder_token,
    encrypted_name: data.encrypted_name,
    name_nonce: data.name_nonce,
  };

  if (data.encrypted_color !== undefined) {
    api_data.encrypted_color = data.encrypted_color;
  }
  if (data.color_nonce !== undefined) {
    api_data.color_nonce = data.color_nonce;
  }
  if (data.encrypted_icon !== undefined) {
    api_data.encrypted_icon = data.encrypted_icon;
  }
  if (data.icon_nonce !== undefined) {
    api_data.icon_nonce = data.icon_nonce;
  }
  if (data.is_system !== undefined) {
    api_data.is_system = data.is_system;
  }
  if (data.sort_order !== undefined) {
    api_data.sort_order = data.sort_order;
  }
  if (data.parent_token !== undefined) {
    api_data.parent_token = data.parent_token;
  }
  if (data.folder_type !== undefined) {
    api_data.folder_type = data.folder_type;
  }

  const response = await api_client.post<{
    id: string;
    label_token: string;
    success: boolean;
  }>("/mail/v1/labels", api_data);

  if (response.data) {
    return {
      ...response,
      data: {
        id: response.data.id,
        folder_token: response.data.label_token,
        success: response.data.success,
      },
    };
  }

  return {
    error: response.error,
    code: response.code,
    server_code: response.server_code,
  };
}

export async function update_folder(
  folder_id: string,
  data: UpdateFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/labels/${folder_id}`,
    data,
  );
}

export interface DeleteFolderRequest {
  password_hash?: string;
  totp_code?: string;
  purge_contents?: boolean;
}

export interface DeleteFolderResponse {
  status: string;
  purged_items?: number;
}

export async function delete_folder(
  folder_id: string,
  data?: DeleteFolderRequest,
): Promise<ApiResponse<DeleteFolderResponse>> {
  return api_client.delete<DeleteFolderResponse>(
    `/mail/v1/labels/${folder_id}`,
    data ? { data } : undefined,
  );
}

export async function bulk_delete_folders(
  folder_ids: string[],
): Promise<ApiResponse<BulkDeleteFoldersResponse>> {
  return api_client.post<BulkDeleteFoldersResponse>(
    "/mail/v1/labels/bulk/delete",
    {
      label_ids: folder_ids,
    },
  );
}

export async function bulk_reorder_folders(
  folders: { id: string; sort_order: number }[],
): Promise<ApiResponse<BulkReorderFoldersResponse>> {
  return api_client.post<BulkReorderFoldersResponse>(
    "/mail/v1/labels/bulk/reorder",
    {
      labels: folders,
    },
  );
}

export async function get_folder_stats(): Promise<
  ApiResponse<FolderStatsResponse>
> {
  return api_client.get<FolderStatsResponse>("/mail/v1/labels/stats");
}

export async function get_folder_counts(): Promise<
  ApiResponse<FolderCountsResponse>
> {
  const response = await api_client.get<{
    counts: { label_token: string; count: number; unread_count?: number }[];
  }>("/mail/v1/labels/counts", { skip_cache: true });

  if (response.data) {
    return {
      ...response,
      data: {
        counts: response.data.counts.map((item) => ({
          folder_token: item.label_token,
          count: item.count,
          unread_count: item.unread_count ?? 0,
        })),
      },
    };
  }

  return { error: response.error, code: response.code };
}

export interface SetFolderPasswordRequest {
  password_hash: string;
  password_salt: string;
  encrypted_folder_key: string;
  folder_key_nonce: string;
}

export interface SetFolderPasswordResponse {
  success: boolean;
}

export interface VerifyFolderPasswordRequest {
  password_hash: string;
}

export interface VerifyFolderPasswordResponse {
  verified: boolean;
  encrypted_folder_key?: string;
  folder_key_nonce?: string;
  unlock_token?: string;
  unlock_expires_at?: string;
}

export interface LockFolderRequest {
  unlock_token: string | null;
  all_sessions: boolean;
}

export interface LockFolderResponse {
  status?: string;
}

export interface ChangeFolderPasswordRequest {
  old_password_hash: string;
  new_password_hash: string;
  new_password_salt: string;
  new_encrypted_folder_key: string;
  new_folder_key_nonce: string;
}

export interface ChangeFolderPasswordResponse {
  success: boolean;
}

export interface RemoveFolderPasswordRequest {
  password_hash: string;
}

export interface RemoveFolderPasswordResponse {
  success: boolean;
}

export async function set_folder_password(
  folder_id: string,
  data: SetFolderPasswordRequest,
): Promise<ApiResponse<SetFolderPasswordResponse>> {
  return api_client.post<SetFolderPasswordResponse>(
    `/mail/v1/labels/${folder_id}/password`,
    data,
  );
}

export async function verify_folder_password(
  folder_id: string,
  data: VerifyFolderPasswordRequest,
): Promise<ApiResponse<VerifyFolderPasswordResponse>> {
  return api_client.post<VerifyFolderPasswordResponse>(
    `/mail/v1/labels/${folder_id}/password/verify`,
    data,
  );
}

export async function lock_folder_session(
  folder_id: string,
  data: LockFolderRequest,
): Promise<ApiResponse<LockFolderResponse>> {
  return api_client.post<LockFolderResponse>(
    `/mail/v1/labels/${folder_id}/lock`,
    data,
  );
}

export async function change_folder_password(
  folder_id: string,
  data: ChangeFolderPasswordRequest,
): Promise<ApiResponse<ChangeFolderPasswordResponse>> {
  return api_client.put<ChangeFolderPasswordResponse>(
    `/mail/v1/labels/${folder_id}/password`,
    data,
  );
}

export async function remove_folder_password(
  folder_id: string,
  data: RemoveFolderPasswordRequest,
): Promise<ApiResponse<RemoveFolderPasswordResponse>> {
  return api_client.delete<RemoveFolderPasswordResponse>(
    `/mail/v1/labels/${folder_id}/password`,
    { data },
  );
}
