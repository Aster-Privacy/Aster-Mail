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
  thread_token?: string;
  thread_message_count?: number;
  created_at: string;
  labels?: MailItemLabel[];
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  size_bytes?: number;
  has_attachments?: boolean;
  attachment_count?: number;
  scheduled_at?: string;
  send_status?: string;
  message_ts?: string;
  snoozed_until?: string;
  folders?: MailItemFolder[];
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
  item_type?: "received" | "sent" | "draft" | "scheduled";
  is_starred?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  is_snoozed?: boolean;
  ids?: string[];
  folder_filter_token?: string;
  label_token?: string;
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
  size_bytes?: number;
  has_attachments?: boolean;
  attachment_count?: number;
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
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  folder_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
}

export interface BulkUpdateRequest {
  ids: string[];
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
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

export async function list_mail_items(
  params: ListMailItemsParams = {},
): Promise<ApiResponse<MailItemsListResponse>> {
  if (params.ids && params.ids.length > 0) {
    return api_client.post<MailItemsListResponse>("/mail/batch", {
      ids: params.ids,
      limit: params.limit,
    });
  }

  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);
  if (params.item_type) query_params.set("item_type", params.item_type);
  if (params.is_starred) query_params.set("is_starred", "true");
  if (params.is_trashed) query_params.set("is_trashed", "true");
  if (params.is_archived) query_params.set("is_archived", "true");
  if (params.is_spam) query_params.set("is_spam", "true");
  if (params.is_snoozed) query_params.set("is_snoozed", "true");

  const query_string = query_params.toString();
  const endpoint = `/mail${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MailItemsListResponse>(endpoint);
}

export async function get_mail_item(
  item_id: string,
): Promise<ApiResponse<MailItem>> {
  return api_client.get<MailItem>(`/mail/${item_id}`);
}

export async function create_mail_item(
  data: CreateMailItemRequest,
): Promise<ApiResponse<CreateMailItemResponse>> {
  return api_client.post<CreateMailItemResponse>("/mail", data);
}

export async function update_mail_item(
  item_id: string,
  data: UpdateMailItemRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    `/mail/${item_id}`,
    data,
  );
}

export async function delete_mail_item(
  item_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/mail/${item_id}`);
}

export async function get_mail_stats(): Promise<
  ApiResponse<MailUserStatsResponse>
> {
  return api_client.get<MailUserStatsResponse>("/mail/stats");
}

export async function bulk_update_mail_items(
  data: BulkUpdateRequest,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.put<{ status: string; affected: number }>(
    "/mail/bulk",
    data,
  );
}

export async function add_mail_item_folder(
  item_id: string,
  data: MailItemFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(`/mail/${item_id}/labels`, data);
}

export async function remove_mail_item_folder(
  item_id: string,
  folder_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/mail/${item_id}/labels/${folder_token}`,
  );
}

export async function get_mail_item_folders(
  item_id: string,
): Promise<ApiResponse<MailItemFoldersResponse>> {
  return api_client.get<MailItemFoldersResponse>(`/mail/${item_id}/labels`);
}

export const add_mail_item_label = add_mail_item_folder;
export const remove_mail_item_label = remove_mail_item_folder;
export const get_mail_item_labels = get_mail_item_folders;

export async function move_mail_item(
  item_id: string,
  data: MoveToFolderRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/mail/${item_id}/move`, data);
}

export async function restore_mail_item(
  item_id: string,
  data: RestoreMailItemRequest = {},
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/mail/${item_id}/restore`, data);
}

export async function permanent_delete_mail_item(
  item_id: string,
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  return api_client.delete<{ success: boolean; deleted_count: number }>(
    `/mail/${item_id}/permanent`,
  );
}

export async function bulk_permanent_delete(
  ids: string[],
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  return api_client.delete<{ success: boolean; deleted_count: number }>(
    "/mail/trash/bulk",
    { data: { ids } },
  );
}

export async function bulk_add_folder(
  ids: string[],
  folder_token: string,
): Promise<ApiResponse<{ status: string; affected: number }>> {
  return api_client.post<{ status: string; affected: number }>(
    "/mail/bulk/labels",
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
    "/mail/bulk/labels/remove",
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

export interface UpdateMetadataRequest {
  encrypted_metadata: string;
  metadata_nonce: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
}

export interface BulkUpdateMetadataItem {
  id: string;
  encrypted_metadata: string;
  metadata_nonce: string;
}

export interface BulkUpdateMetadataRequest {
  items: BulkUpdateMetadataItem[];
}

export async function sync_mail_items(
  params: SyncMailItemsParams = {},
): Promise<ApiResponse<SyncMailItemsResponse>> {
  const query_params = new URLSearchParams();

  if (params.since) query_params.set("since", params.since);
  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.cursor) query_params.set("cursor", params.cursor);

  const query_string = query_params.toString();
  const endpoint = `/mail/sync${query_string ? `?${query_string}` : ""}`;

  return api_client.get<SyncMailItemsResponse>(endpoint);
}

export async function get_migration_status(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.get<MigrationStatusResponse>("/mail/migration/status");
}

export async function start_migration(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.post<MigrationStatusResponse>("/mail/migration/start", {});
}

export async function complete_migration(): Promise<
  ApiResponse<MigrationStatusResponse>
> {
  return api_client.post<MigrationStatusResponse>(
    "/mail/migration/complete",
    {},
  );
}

export async function update_mail_item_metadata(
  item_id: string,
  data: UpdateMetadataRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    `/mail/${item_id}/metadata`,
    data,
  );
}

export async function bulk_update_metadata(
  data: BulkUpdateMetadataRequest,
): Promise<ApiResponse<{ success: boolean; updated_count: number }>> {
  return api_client.put<{ success: boolean; updated_count: number }>(
    "/mail/bulk/metadata",
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
  is_read: boolean;
  is_starred?: boolean;
  message_ts: string;
  created_at: string;
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
  is_starred?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  is_unread?: boolean;
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
  if (params.is_starred) query_params.set("is_starred", "true");
  if (params.is_trashed) query_params.set("is_trashed", "true");
  if (params.is_archived) query_params.set("is_archived", "true");
  if (params.is_spam) query_params.set("is_spam", "true");
  if (params.is_unread) query_params.set("is_unread", "true");

  const query_string = query_params.toString();
  const endpoint = `/mail/threads${query_string ? `?${query_string}` : ""}`;

  return api_client.get<ThreadsListResponse>(endpoint);
}

export async function get_thread(
  thread_token: string,
): Promise<ApiResponse<MailThread>> {
  return api_client.get<MailThread>(
    `/mail/threads/${encodeURIComponent(thread_token)}`,
  );
}

export async function get_thread_messages(
  thread_token: string,
): Promise<ApiResponse<ThreadWithMessages>> {
  return api_client.get<ThreadWithMessages>(
    `/mail/threads/${encodeURIComponent(thread_token)}/messages`,
  );
}

export async function mark_thread_read(
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/threads/${encodeURIComponent(thread_token)}/read`,
    {},
  );
}

export async function create_thread(
  request: CreateThreadRequest,
): Promise<ApiResponse<{ thread_token: string; success: boolean }>> {
  return api_client.post<{ thread_token: string; success: boolean }>(
    "/mail/threads",
    request,
  );
}

export async function link_mail_to_thread(
  mail_item_id: string,
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(`/mail/${mail_item_id}/thread`, {
    thread_token,
  });
}
