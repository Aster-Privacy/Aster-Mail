import { api_client, type ApiResponse } from "./client";

import { format_bytes } from "@/lib/utils";

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
}

export interface BatchUnarchiveRequest {
  ids: string[];
}

export interface BatchUnarchiveResponse {
  success: boolean;
  unarchived_count: number;
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
  return api_client.post<BatchArchiveResponse>("/archive/batch", data);
}

export async function batch_unarchive(
  data: BatchUnarchiveRequest,
): Promise<ApiResponse<BatchUnarchiveResponse>> {
  return api_client.post<BatchUnarchiveResponse>(
    "/archive/unarchive/batch",
    data,
  );
}

export async function get_archive_stats(): Promise<
  ApiResponse<ArchiveStatsResponse>
> {
  return api_client.get<ArchiveStatsResponse>("/archive/stats");
}

export async function promote_archive_tier(
  data: PromoteTierRequest,
): Promise<ApiResponse<PromoteTierResponse>> {
  return api_client.post<PromoteTierResponse>("/archive/promote", data);
}

export async function search_archive(
  data: SearchArchiveRequest,
): Promise<ApiResponse<SearchArchiveResponse>> {
  return api_client.post<SearchArchiveResponse>("/archive/search", data);
}

export function format_archive_tier(tier: string): string {
  const tier_labels: Record<string, string> = {
    hot: "Recently Archived",
    warm: "Older Items",
    cold: "Long-term Archive",
  };

  return tier_labels[tier] || tier;
}

export function get_tier_color(tier: string): string {
  const tier_colors: Record<string, string> = {
    hot: "#ef4444",
    warm: "#f59e0b",
    cold: "#3b82f6",
  };

  return tier_colors[tier] || "#6b7280";
}

export { format_bytes as format_archive_size };
