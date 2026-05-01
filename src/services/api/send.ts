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

interface SendAttachmentPayload {
  encrypted_data: string;
  data_nonce: string;
  sender_encrypted_meta: string;
  sender_meta_nonce: string;
  recipient_encrypted_meta?: string;
  size_bytes: number;
}

interface ExternalAttachmentPayload {
  data: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_id?: string;
}

interface SimpleSendRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  is_e2e_encrypted?: boolean;
  encryption_type?: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
  folder_token?: string;
  thread_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  expires_at?: string;
  attachments?: SendAttachmentPayload[];
  forward_original_mail_id?: string;
  in_reply_to?: string;
}

interface SimpleSendResponse {
  success: boolean;
  message: string;
  mail_item_id?: string;
  pgp_encrypted_count?: number;
  pgp_fingerprints?: string[];
}

interface QueuedSendRequest extends SimpleSendRequest {
  delay_seconds: number;
  thread_id?: string;
  in_reply_to?: string;
}

interface QueuedSendResponse {
  success: boolean;
  queue_id: string;
  scheduled_send_at: string;
  can_cancel_until: string;
}

interface SendOptions {
  bypass_queue?: boolean;
  delay_seconds?: number;
  thread_id?: string;
  in_reply_to?: string;
}

interface ExternalSendRequest {
  encrypted_recipients: string;
  encrypted_subject: string;
  encrypted_body: string;
  ephemeral_key: string;
  nonce: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
  folder_token?: string;
  thread_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  acknowledge_server_readable: boolean;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  expires_at?: string;
  expiry_password?: string;
  attachments?: ExternalAttachmentPayload[];
}

export async function send_simple_email(
  request: SimpleSendRequest,
): Promise<ApiResponse<SimpleSendResponse>> {
  return api_client.post<SimpleSendResponse>("/mail/v1/send", request);
}

export async function queue_send_email(
  request: QueuedSendRequest,
): Promise<ApiResponse<QueuedSendResponse>> {
  return api_client.post<QueuedSendResponse>(
    "/mail/v1/undo_send/queue",
    request,
  );
}

export async function send_external_email(
  request: ExternalSendRequest,
): Promise<ApiResponse<SimpleSendResponse>> {
  return api_client.post<SimpleSendResponse>("/mail/v1/send/external", request);
}

export async function send_email(
  request: SimpleSendRequest,
  options: SendOptions = {},
): Promise<ApiResponse<SimpleSendResponse | QueuedSendResponse>> {
  if (options.bypass_queue || !options.delay_seconds) {
    return send_simple_email(request);
  }

  const queued_request: QueuedSendRequest = {
    ...request,
    delay_seconds: options.delay_seconds,
    thread_id: options.thread_id,
    in_reply_to: options.in_reply_to,
  };

  return queue_send_email(queued_request);
}

export type {
  SimpleSendRequest,
  SimpleSendResponse,
  QueuedSendRequest,
  QueuedSendResponse,
  SendOptions,
  ExternalSendRequest,
  SendAttachmentPayload,
  ExternalAttachmentPayload,
};
