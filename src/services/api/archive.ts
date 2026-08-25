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

import { BATCH_LIMITS } from "@/constants/batch_config";

export interface ArchiveTierStats {
  tier: string;
  item_count: number;
  total_size_bytes: number;
  oldest_archived_at: string | null;
  newest_archived_at: string | null;
}

export interface ArchiveActivity {
  id: string;
  mail_item_id: string;
  action: string;
  old_tier: string | null;
  new_tier: string | null;
  created_at: string;
}

export interface ArchiveStatsResponse {
  total_archived: number;
  total_size_bytes: number;
  tiers: ArchiveTierStats[];
  recent_activity: ArchiveActivity[];
}

export interface BatchArchiveRequest {
  ids: string[];
  tier?: string;
}

export interface BatchArchiveResponse {
  success: boolean;
  archived_count: number;
  total_size_bytes: number;
  failed_ids?: string[];
}

export interface BatchUnarchiveRequest {
  ids: string[];
}

export interface BatchUnarchiveResponse {
  success: boolean;
  unarchived_count: number;
  failed_ids?: string[];
}

export interface PromoteTierRequest {
  days_old?: number;
  from_tier: string;
  to_tier: string;
}

export interface PromoteTierResponse {
  success: boolean;
  promoted_count: number;
}

export interface ArchiveSearchItem {
  id: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  ephemeral_key?: string;
  ephemeral_pq_key?: string;
  folder_token: string;
  is_read: boolean;
  is_starred: boolean;
  archive_tier: string;
  archived_at: string;
  size_bytes: number;
  has_attachments: boolean;
  message_ts: string;
}

export interface SearchArchiveRequest {
  query_token: string;
  tier_filter?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  cursor?: string;
}

export interface SearchArchiveResponse {
  items: ArchiveSearchItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export async function batch_archive(
  data: BatchArchiveRequest,
): Promise<ApiResponse<BatchArchiveResponse>> {
  return api_client.post<BatchArchiveResponse>("/mail/v1/archive/batch", data);
}

export async function batch_unarchive(
  data: BatchUnarchiveRequest,
): Promise<ApiResponse<BatchUnarchiveResponse>> {
  return api_client.post<BatchUnarchiveResponse>(
    "/mail/v1/archive/unarchive/batch",
    data,
  );
}

export interface BatchedArchiveResult {
  succeeded_ids: string[];
  failed_ids: string[];
}

function partition_batch(
  batch: string[],
  reported_failed_ids: string[] | undefined,
  succeeded_ids: string[],
  failed_ids: string[],
): void {
  if (!Array.isArray(reported_failed_ids)) {
    succeeded_ids.push(...batch);

    return;
  }

  const reported = new Set(reported_failed_ids);

  for (const id of batch) {
    if (reported.has(id)) {
      failed_ids.push(id);
    } else {
      succeeded_ids.push(id);
    }
  }
}

export async function batched_archive(
  ids: string[],
  tier = "hot",
): Promise<BatchedArchiveResult> {
  const succeeded_ids: string[] = [];
  const failed_ids: string[] = [];

  for (let i = 0; i < ids.length; i += BATCH_LIMITS.ARCHIVE) {
    const batch = ids.slice(i, i + BATCH_LIMITS.ARCHIVE);
    const response = await batch_archive({ ids: batch, tier }).catch(
      () => null,
    );

    if (response && !response.error && response.data?.success === true) {
      partition_batch(
        batch,
        response.data.failed_ids,
        succeeded_ids,
        failed_ids,
      );
    } else {
      failed_ids.push(...batch);
    }
  }

  return { succeeded_ids, failed_ids };
}

export async function batched_unarchive(
  ids: string[],
): Promise<BatchedArchiveResult> {
  const succeeded_ids: string[] = [];
  const failed_ids: string[] = [];

  for (let i = 0; i < ids.length; i += BATCH_LIMITS.ARCHIVE) {
    const batch = ids.slice(i, i + BATCH_LIMITS.ARCHIVE);
    const response = await batch_unarchive({ ids: batch }).catch(() => null);

    if (response && !response.error && response.data?.success === true) {
      partition_batch(
        batch,
        response.data.failed_ids,
        succeeded_ids,
        failed_ids,
      );
    } else {
      failed_ids.push(...batch);
    }
  }

  return { succeeded_ids, failed_ids };
}

export async function get_archive_stats(): Promise<
  ApiResponse<ArchiveStatsResponse>
> {
  return api_client.get<ArchiveStatsResponse>("/mail/v1/archive/stats");
}

export async function promote_archive_tier(
  data: PromoteTierRequest,
): Promise<ApiResponse<PromoteTierResponse>> {
  return api_client.post<PromoteTierResponse>("/mail/v1/archive/promote", data);
}

export async function search_archive(
  data: SearchArchiveRequest,
): Promise<ApiResponse<SearchArchiveResponse>> {
  return api_client.post<SearchArchiveResponse>(
    "/mail/v1/archive/search",
    data,
  );
}
