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
  const endpoint = `/mail/v1/metadata/inbox${query_string ? `?${query_string}` : ""}`;

  return api_client.get<MessageListResponse>(endpoint);
}

export async function get_message(
  message_id: string,
): Promise<ApiResponse<EncryptedMessage>> {
  return api_client.get<EncryptedMessage>(`/mail/v1/metadata/${message_id}`);
}

export async function delete_message(
  message_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/mail/v1/metadata/${message_id}`,
  );
}

export async function mark_message_delivered(
  message_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `/mail/v1/metadata/${message_id}/delivered`,
    {},
  );
}

export async function update_message_metadata(
  message_id: string,
  metadata: UpdateMetadataRequest,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/metadata/${message_id}/metadata`,
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
  const endpoint = `/mail/v1/metadata${query_string ? `?${query_string}` : ""}`;

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
