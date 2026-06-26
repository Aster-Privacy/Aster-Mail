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

export type DeleteMode = "trash" | "permanent" | "archive";

export interface RetentionPolicy {
  id: string;
  folder_token: string;
  retention_days: number;
  delete_mode: DeleteMode;
  enabled: boolean;
  last_swept_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRetentionPolicyRequest {
  folder_token: string;
  retention_days: number;
  delete_mode: DeleteMode;
  enabled?: boolean;
}

export interface UpdateRetentionPolicyRequest {
  retention_days?: number;
  delete_mode?: DeleteMode;
  enabled?: boolean;
}

interface PoliciesListResponse {
  policies: RetentionPolicy[];
}

interface PreviewResponse {
  affected_count: number;
}

const BASE = "/mail/v1/retention-policies";

export async function list_retention_policies(): Promise<
  ApiResponse<RetentionPolicy[]>
> {
  const response = await api_client.get<PoliciesListResponse>(BASE);
  if (response.data) {
    return { data: response.data.policies };
  }
  return { error: response.error, code: response.code };
}

export async function create_retention_policy(
  req: CreateRetentionPolicyRequest,
): Promise<ApiResponse<RetentionPolicy>> {
  return api_client.post<RetentionPolicy>(BASE, req);
}

export async function update_retention_policy(
  id: string,
  patch: UpdateRetentionPolicyRequest,
): Promise<ApiResponse<RetentionPolicy>> {
  return api_client.patch<RetentionPolicy>(`${BASE}/${id}`, patch);
}

export async function delete_retention_policy(
  id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`${BASE}/${id}`);
}

export async function preview_retention_policy(
  folder_token: string,
  retention_days: number,
): Promise<ApiResponse<number>> {
  const qs = new URLSearchParams({
    folder_token,
    retention_days: String(retention_days),
  });
  const response = await api_client.get<PreviewResponse>(`${BASE}/preview?${qs.toString()}`);
  if (response.data) {
    return { data: response.data.affected_count };
  }
  return { error: response.error, code: response.code };
}
