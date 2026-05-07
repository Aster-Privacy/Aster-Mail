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
import type { MailItemMetadata } from "@/types/email";

import { api_client, type ApiResponse } from "./client";

export interface MailItemFolder {
  token: string;
  name: string;
  color: string;
  icon?: string;
}

export type MailItemLabel = MailItemFolder;

export interface MailItem {
  id: string;
  item_type: "received" | "sent" | "draft" | "scheduled" | "outbox";
  encrypted_envelope: string;
  envelope_nonce: string;
  ephemeral_key?: string;
  ephemeral_pq_key?: string;
  sender_sealed?: string;
  folder_token: string;
  is_external: boolean;
  has_recipient_key?: boolean;
  thread_token?: string;
  thread_message_count?: number;
  created_at: string;
  labels?: MailItemLabel[];
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  scheduled_at?: string;
  send_status?: string;
  message_ts?: string;
  snoozed_until?: string;
  is_trashed?: boolean;
  is_spam?: boolean;
  is_read?: boolean;
  folders?: MailItemFolder[];
  tag_tokens?: string[];
  metadata?: MailItemMetadata;
  expires_at?: string;
  expiry_type?: "sender" | "recipient";
  phishing_level?: "safe" | "suspicious" | "dangerous";
}

export interface MailItemsListResponse {
  items: MailItem[];
  total: number;
  next_cursor?: string;
  has_more: boolean;
}

export interface ListMailItemsParams {
  limit?: number;
  offset?: number;
  cursor?: string;
  item_type?: "received" | "sent" | "draft" | "scheduled" | "all";
  is_snoozed?: boolean;
  is_starred?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  ids?: string[];
  folder_filter_token?: string;
  label_token?: string;
  tag_token?: string;
  routing_token?: string;
  group_by_thread?: boolean;
}

export interface ListEncryptedMailItemsParams {
  limit?: number;
  cursor?: string;
  item_type?: "received" | "sent" | "draft" | "scheduled";
}

export interface CreateMailItemRequest {
  item_type: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  folder_token: string;
  content_hash: string;
  ephemeral_key?: string;
  ephemeral_pq_key?: string;
  sender_sealed?: string;
  scheduled_at?: string;
  is_external?: boolean;
  thread_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
}

export interface CreateMailItemResponse {
  id: string;
  success: boolean;
}

export interface UpdateMailItemRequest {
  folder_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
}

export interface BulkUpdateRequest {
  ids: string[];
}

export interface MailItemFolderRequest {
  folder_token: string;
}

export interface MailItemFoldersResponse {
  folders: string[];
}

export type MailItemLabelRequest = MailItemFolderRequest;
export type MailItemLabelsResponse = MailItemFoldersResponse;

export interface MoveToFolderRequest {
  folder_token: string;
}

export interface RestoreMailItemRequest {
  target?: "inbox" | "archive";
}

export interface MailUserStatsResponse {
  total_items: number;
  inbox: number;
  sent: number;
  drafts: number;
  scheduled: number;
  starred: number;
  archived: number;
  spam: number;
  trash: number;
  unread: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
}

export async function get_mail_stats(): Promise<
  ApiResponse<MailUserStatsResponse>
> {
  return api_client.get<MailUserStatsResponse>("/mail/v1/messages/stats");
}

export async function list_mail_items(
  params: ListMailItemsParams = {},
): Promise<ApiResponse<MailItemsListResponse>> {
  if (params.ids && params.ids.length > 0) {
    return api_client.post<MailItemsListResponse>("/mail/v1/messages/batch", {
      ids: params.ids,
      limit: params.limit,
    });
  }

  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset !== undefined)
    query_params.set("offset", params.offset.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);
  if (params.item_type) query_params.set("item_type", params.item_type);
  if (params.is_snoozed !== undefined)
    query_params.set("is_snoozed", String(params.is_snoozed));
  if (params.is_starred !== undefined)
    query_params.set("is_starred", String(params.is_starred));
  if (params.is_trashed !== undefined)
    query_params.set("is_trashed", String(params.is_trashed));
  if (params.is_archived !== undefined)
    query_params.set("is_archived", String(params.is_archived));
  if (params.is_spam !== undefined)
    query_params.set("is_spam", String(params.is_spam));
  if (params.label_token) query_params.set("label_token", params.label_token);
  if (params.tag_token) query_params.set("tag_token", params.tag_token);
  if (params.routing_token)
    query_params.set("routing_token", params.routing_token);
  if (params.group_by_thread !== undefined)
    query_params.set("group_by_thread", params.group_by_thread.toString());

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MailItemsListResponse>(endpoint);
}

export async function list_encrypted_mail_items(
  params: ListEncryptedMailItemsParams = {},
): Promise<ApiResponse<MailItemsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);
  if (params.item_type) query_params.set("item_type", params.item_type);

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages/encrypted${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MailItemsListResponse>(endpoint);
}

const prefetch_cache = new Map<string, Promise<ApiResponse<MailItem>>>();

export function prefetch_mail_item(item_id: string): void {
  if (prefetch_cache.has(item_id)) return;
  const promise = api_client.get<MailItem>(`/mail/v1/messages/${item_id}`);

  prefetch_cache.set(item_id, promise);
  setTimeout(() => prefetch_cache.delete(item_id), 60_000);
}

export async function get_mail_item(
  item_id: string,
): Promise<ApiResponse<MailItem>> {
  const cached = prefetch_cache.get(item_id);

  if (cached) {
    prefetch_cache.delete(item_id);

    return cached;
  }

  return api_client.get<MailItem>(`/mail/v1/messages/${item_id}`);
}

export async function create_mail_item(
  data: CreateMailItemRequest,
): Promise<ApiResponse<CreateMailItemResponse>> {
  return api_client.post<CreateMailItemResponse>("/mail/v1/messages", data);
}

export async function update_mail_item(
  item_id: string,
  data: UpdateMailItemRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    `/mail/v1/messages/${item_id}`,
    data,
  );
}

export async function delete_mail_item(
  item_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/mail/v1/messages/${item_id}`);
}

export async function bulk_update_mail_items(
  data: BulkUpdateRequest,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.put<{ status: string; affected: number }>(
    "/mail/v1/messages/bulk",
    data,
  );
}

export async function add_mail_item_folder(
  item_id: string,
  data: MailItemFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `/mail/v1/messages/${item_id}/labels`,
    data,
  );
}

export async function remove_mail_item_folder(
  item_id: string,
  folder_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/mail/v1/messages/${item_id}/labels/${folder_token}`,
  );
}

export async function get_mail_item_folders(
  item_id: string,
): Promise<ApiResponse<MailItemFoldersResponse>> {
  return api_client.get<MailItemFoldersResponse>(
    `/mail/v1/messages/${item_id}/labels`,
  );
}

export const add_mail_item_label = add_mail_item_folder;
export const remove_mail_item_label = remove_mail_item_folder;
export const get_mail_item_labels = get_mail_item_folders;

export async function move_mail_item(
  item_id: string,
  data: MoveToFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/${item_id}/move`,
    data,
  );
}

export async function restore_mail_item(
  item_id: string,
  data: RestoreMailItemRequest = {},
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/${item_id}/restore`,
    data,
  );
}

export async function permanent_delete_mail_item(
  item_id: string,
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  return api_client.delete<{ success: boolean; deleted_count: number }>(
    `/mail/v1/messages/${item_id}/permanent`,
  );
}

export async function bulk_permanent_delete(
  ids: string[],
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  return api_client.delete<{ success: boolean; deleted_count: number }>(
    "/mail/v1/messages/trash/bulk",
    { data: { ids } },
  );
}

export async function empty_trash(): Promise<
  ApiResponse<{ success: boolean; deleted_count: number }>
> {
  return api_client.delete<{ success: boolean; deleted_count: number }>(
    "/mail/v1/messages/trash",
    { timeout: 120000 },
  );
}

export type BulkScopeAction =
  | "trash"
  | "archive"
  | "unarchive"
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "mark_spam"
  | "unmark_spam"
  | "restore_trash";

export interface BulkScopeFilter {
  item_type?: string;
  is_archived?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
  is_starred?: boolean;
  is_snoozed?: boolean;
}

export interface BulkScopeRequest {
  action: BulkScopeAction;
  scope: BulkScopeFilter;
  exclude_ids?: string[];
}

export interface BulkScopeResponse {
  batch_id: string;
  affected_count: number;
  undoable: boolean;
}

export async function bulk_action_by_scope(
  data: BulkScopeRequest,
): Promise<ApiResponse<BulkScopeResponse>> {
  return api_client.post<BulkScopeResponse>("/mail/v1/messages/bulk/scope", data, {
    timeout: 120000,
  });
}

export interface BulkUndoResponse {
  success: boolean;
  restored_count: number;
}

export async function bulk_undo(
  batch_id: string,
): Promise<ApiResponse<BulkUndoResponse>> {
  return api_client.post<BulkUndoResponse>(
    "/mail/v1/messages/bulk/undo",
    { batch_id },
    { timeout: 120000 },
  );
}

export async function bulk_add_folder(
  ids: string[],
  folder_token: string,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.post<{ status: string; affected: number }>(
    "/mail/v1/messages/bulk/labels",
    {
      ids,
      label_token: folder_token,
    },
  );
}

export async function bulk_remove_folder(
  ids: string[],
  folder_token: string,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.post<{ status: string; affected: number }>(
    "/mail/v1/messages/bulk/labels/remove",
    {
      ids,
      label_token: folder_token,
    },
  );
}

export const bulk_add_label = bulk_add_folder;
export const bulk_remove_label = bulk_remove_folder;

export interface SyncMailItemsParams {
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface SyncMailItemsResponse {
  items: MailItem[];
  next_cursor?: string;
  has_more: boolean;
  sync_token: string;
}

export interface MigrationStatusResponse {
  is_migrated: boolean;
  migration_version: number;
}

export interface PatchMetadataRequest {
  encrypted_metadata: string;
  metadata_nonce: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
}

export interface BulkPatchMetadataItem {
  id: string;
  encrypted_metadata: string;
  metadata_nonce: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
}

export interface BulkPatchMetadataRequest {
  items: BulkPatchMetadataItem[];
}

export async function sync_mail_items(
  params: SyncMailItemsParams = {},
): Promise<ApiResponse<SyncMailItemsResponse>> {
  const query_params = new URLSearchParams();

  if (params.since) query_params.set("since", params.since);
  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages/sync${query_string ? `?${query_string}` : ""}`;

  return api_client.get<SyncMailItemsResponse>(endpoint, {
    cache_ttl: 30_000,
  });
}

export async function get_migration_status(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.get<MigrationStatusResponse>(
    "/mail/v1/messages/migration/status",
  );
}

export async function start_migration(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.post<MigrationStatusResponse>(
    "/mail/v1/messages/migration/start",
    {},
  );
}

export async function complete_migration(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.post<MigrationStatusResponse>(
    "/mail/v1/messages/migration/complete",
    {},
  );
}

export async function patch_mail_item_metadata(
  item_id: string,
  data: PatchMetadataRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    `/mail/v1/messages/${item_id}/metadata`,
    data,
  );
}

export async function bulk_patch_metadata(
  data: BulkPatchMetadataRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    "/mail/v1/messages/bulk/metadata",
    data,
  );
}

export interface BatchedBulkResult {
  success: boolean;
  affected_total: number;
  failed_ids: string[];
  was_cancelled: boolean;
}

export interface BatchedBulkOptions {
  signal?: AbortSignal;
  on_progress?: (completed: number, total: number) => void;
}

async function run_batched_operation(
  ids: string[],
  batch_size: number,
  api_call: (batch: string[]) => Promise<ApiResponse<unknown>>,
  options?: BatchedBulkOptions,
): Promise<BatchedBulkResult> {
  const { process_batches } = await import("@/services/batch_processor");

  const result = await process_batches({
    ids,
    batch_size,
    signal: options?.signal,
    on_progress: options?.on_progress,
    process_batch: async (batch) => {
      const response = await api_call(batch);

      return !response.error;
    },
  });

  return {
    success: result.failed === 0 && !result.was_cancelled,
    affected_total: result.succeeded,
    failed_ids: result.failed_ids,
    was_cancelled: result.was_cancelled,
  };
}

export async function batched_bulk_update(
  request: BulkUpdateRequest,
  options?: BatchedBulkOptions,
): Promise<BatchedBulkResult> {
  const { BATCH_LIMITS } = await import("@/constants/batch_config");
  const { ids, ...fields } = request;

  return run_batched_operation(
    ids,
    BATCH_LIMITS.MAIL_BULK,
    (batch) => bulk_update_mail_items({ ids: batch, ...fields }),
    options,
  );
}

export async function batched_bulk_add_folder(
  ids: string[],
  folder_token: string,
  options?: BatchedBulkOptions,
): Promise<BatchedBulkResult> {
  const { BATCH_LIMITS } = await import("@/constants/batch_config");

  return run_batched_operation(
    ids,
    BATCH_LIMITS.LABELS,
    (batch) => bulk_add_folder(batch, folder_token),
    options,
  );
}

export async function batched_bulk_remove_folder(
  ids: string[],
  folder_token: string,
  options?: BatchedBulkOptions,
): Promise<BatchedBulkResult> {
  const { BATCH_LIMITS } = await import("@/constants/batch_config");

  return run_batched_operation(
    ids,
    BATCH_LIMITS.LABELS,
    (batch) => bulk_remove_folder(batch, folder_token),
    options,
  );
}

export async function batched_bulk_permanent_delete(
  ids: string[],
  options?: BatchedBulkOptions,
): Promise<BatchedBulkResult> {
  const { BATCH_LIMITS } = await import("@/constants/batch_config");

  return run_batched_operation(
    ids,
    BATCH_LIMITS.MAIL_BULK,
    (batch) => bulk_permanent_delete(batch),
    options,
  );
}

export interface MailThread {
  user_id: string;
  thread_token: string;
  encrypted_meta: string;
  meta_nonce: string;
  message_count: number;
  unread_count: number;
  latest_ts: string;
  created_at: string;
}

export interface ThreadMessageItem {
  id: string;
  item_type: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  is_external?: boolean;
  send_status?: string;
  message_ts: string;
  created_at: string;
  metadata?: MailItemMetadata;
}

export interface ThreadWithMessages {
  thread: MailThread;
  messages: ThreadMessageItem[];
}

export interface ThreadsListResponse {
  threads: MailThread[];
  total: number;
}

export interface ListThreadsParams {
  limit?: number;
  offset?: number;
  folder_token?: string;
}

export interface CreateThreadRequest {
  thread_token: string;
  encrypted_meta: string;
  meta_nonce: string;
}

export async function list_threads(
  params: ListThreadsParams = {},
): Promise<ApiResponse<ThreadsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());
  if (params.folder_token)
    query_params.set("folder_token", params.folder_token);

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages/threads${query_string ? `?${query_string}` : ""}`;

  return api_client.get<ThreadsListResponse>(endpoint);
}

export async function get_thread(
  thread_token: string,
): Promise<ApiResponse<MailThread>> {
  return api_client.get<MailThread>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}`,
  );
}

export async function get_thread_messages(
  thread_token: string,
): Promise<ApiResponse<ThreadWithMessages>> {
  return api_client.get<ThreadWithMessages>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/messages`,
  );
}

export async function mark_thread_read(
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/read`,
    {},
  );
}

export async function trash_thread(
  thread_token: string,
  is_trashed: boolean,
): Promise<ApiResponse<{ trashed: number }>> {
  return api_client.put<{ trashed: number }>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/trash`,
    { is_trashed },
  );
}

export async function create_thread(
  request: CreateThreadRequest,
): Promise<ApiResponse<{ thread_token: string; success: boolean }>> {
  return api_client.post<{ thread_token: string; success: boolean }>(
    "/mail/v1/messages/threads",
    request,
  );
}

export async function link_mail_to_thread(
  mail_item_id: string,
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/${mail_item_id}/thread`,
    {
      thread_token,
    },
  );
}

export async function report_spam_sender(
  sender_email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const normalized = sender_email.trim().toLowerCase();
  const hash_buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const sender_hash = Array.from(new Uint8Array(hash_buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return api_client.post("/mail/v1/spam_senders", { sender_hash });
}

export async function remove_spam_sender(
  sender_email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const normalized = sender_email.trim().toLowerCase();
  const hash_buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const sender_hash = Array.from(new Uint8Array(hash_buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return api_client.delete(
    `/mail/v1/spam_senders?sender_hash=${encodeURIComponent(sender_hash)}`,
  );
}
