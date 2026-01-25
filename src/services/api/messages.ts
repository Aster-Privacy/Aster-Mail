import { api_client, ApiResponse } from "./client";

interface EncryptedMessage {
  id: string;
  routing_token: string;
  ephemeral_public_key: string;
  ephemeral_pq_public_key?: string;
  used_prekey_id?: number;
  used_signed_prekey_id?: number;
  used_pq_prekey_id?: number;
  ciphertext: string;
  sender_sealed_data?: string;
  message_size_bytes: number;
  created_at: string;
}

interface MessageListResponse {
  messages: EncryptedMessage[];
  total: number;
}

interface ListMessagesParams {
  limit?: number;
  offset?: number;
}

interface MailboxMetadata {
  id: string;
  message_id: string;
  folder_token: string;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_pinned: boolean;
}

interface MailboxMetadataListResponse {
  metadata: MailboxMetadata[];
  total: number;
}

interface UpdateMetadataRequest {
  folder_token: string;
  encrypted_metadata: string;
  metadata_nonce: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_archived?: boolean;
}

export async function list_messages(
  params: ListMessagesParams = {},
): Promise<ApiResponse<MessageListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());

  const query_string = query_params.toString();
  const endpoint = `/messages/inbox${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MessageListResponse>(endpoint);
}

export async function get_message(
  message_id: string,
): Promise<ApiResponse<EncryptedMessage>> {
  return api_client.get<EncryptedMessage>(`/messages/${message_id}`);
}

export async function delete_message(
  message_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/messages/${message_id}`);
}

export async function mark_message_delivered(
  message_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `/messages/${message_id}/delivered`,
    {},
  );
}

export async function update_message_metadata(
  message_id: string,
  metadata: UpdateMetadataRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/messages/${message_id}/metadata`,
    metadata,
  );
}

export async function list_mailbox_metadata(
  params: ListMessagesParams = {},
): Promise<ApiResponse<MailboxMetadataListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());

  const query_string = query_params.toString();
  const endpoint = `/messages/metadata${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MailboxMetadataListResponse>(endpoint);
}

export type {
  EncryptedMessage,
  MessageListResponse,
  ListMessagesParams,
  MailboxMetadata,
  MailboxMetadataListResponse,
  UpdateMetadataRequest,
};
