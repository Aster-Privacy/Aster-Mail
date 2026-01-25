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
  counts: { folder_token: string; count: number }[];
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
  created_at: string;
  updated_at: string;
}

interface ApiLabelsListResponse {
  labels: ApiLabelResponse[];
  total: number;
  has_more: boolean;
}

export async function list_folders(
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
  const endpoint = `/folders${query_string ? `?${query_string}` : ""}`;

  const response = await api_client.get<ApiLabelsListResponse>(endpoint);

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
  return api_client.get<FolderDefinition>(`/folders/${folder_id}`);
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

  const response = await api_client.post<{
    id: string;
    label_token: string;
    success: boolean;
  }>("/folders", api_data);

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

  return { error: response.error, code: response.code };
}

export async function update_folder(
  folder_id: string,
  data: UpdateFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/folders/${folder_id}`, data);
}

export async function delete_folder(
  folder_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/folders/${folder_id}`);
}

export async function bulk_delete_folders(
  folder_ids: string[],
): Promise<ApiResponse<BulkDeleteFoldersResponse>> {
  return api_client.post<BulkDeleteFoldersResponse>("/folders/bulk/delete", {
    label_ids: folder_ids,
  });
}

export async function bulk_reorder_folders(
  folders: { id: string; sort_order: number }[],
): Promise<ApiResponse<BulkReorderFoldersResponse>> {
  return api_client.post<BulkReorderFoldersResponse>("/folders/bulk/reorder", {
    labels: folders,
  });
}

export async function get_folder_stats(): Promise<
  ApiResponse<FolderStatsResponse>
> {
  return api_client.get<FolderStatsResponse>("/folders/stats");
}

export async function get_folder_counts(): Promise<
  ApiResponse<FolderCountsResponse>
> {
  const response = await api_client.get<{
    counts: { label_token: string; count: number }[];
  }>("/folders/counts");

  if (response.data) {
    return {
      ...response,
      data: {
        counts: response.data.counts.map((item) => ({
          folder_token: item.label_token,
          count: item.count,
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
    `/folders/${folder_id}/password`,
    data,
  );
}

export async function verify_folder_password(
  folder_id: string,
  data: VerifyFolderPasswordRequest,
): Promise<ApiResponse<VerifyFolderPasswordResponse>> {
  return api_client.post<VerifyFolderPasswordResponse>(
    `/folders/${folder_id}/password/verify`,
    data,
  );
}

export async function change_folder_password(
  folder_id: string,
  data: ChangeFolderPasswordRequest,
): Promise<ApiResponse<ChangeFolderPasswordResponse>> {
  return api_client.put<ChangeFolderPasswordResponse>(
    `/folders/${folder_id}/password`,
    data,
  );
}

export async function remove_folder_password(
  folder_id: string,
  data: RemoveFolderPasswordRequest,
): Promise<ApiResponse<RemoveFolderPasswordResponse>> {
  return api_client.delete<RemoveFolderPasswordResponse>(
    `/folders/${folder_id}/password`,
    { data },
  );
}
