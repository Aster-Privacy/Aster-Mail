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

export interface AttachmentRef {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface QueueEmailRequest {
  recipient: string;
  subject: string;
  body: string;
  delay_seconds?: number;
  is_encrypted?: boolean;
  attachments?: AttachmentRef[];
  thread_id?: string;
  in_reply_to?: string;
  cc?: string[];
  bcc?: string[];
  encrypted_envelope?: string;
  envelope_nonce?: string;
  folder_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  forward_original_mail_id?: string;
}

export interface QueueEmailResponse {
  queue_id: string;
  scheduled_send_at: string;
  can_cancel_until: string;
}

export interface QueuedEmailStatus {
  queue_id: string;
  status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  scheduled_send_at: string;
  created_at: string;
  recipient: string;
  subject: string;
  error_message?: string;
}

export interface PendingEmailsResponse {
  emails: QueuedEmailStatus[];
  total: number;
}

export async function queue_email(
  request: QueueEmailRequest,
): Promise<ApiResponse<QueueEmailResponse>> {
  return api_client.post<QueueEmailResponse>(
    "/mail/v1/undo_send/queue",
    request,
  );
}

export async function cancel_email(
  queue_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/mail/v1/undo_send/${queue_id}`,
  );
}

export async function get_queued_email_status(
  queue_id: string,
): Promise<ApiResponse<QueuedEmailStatus>> {
  return api_client.get<QueuedEmailStatus>(
    `/mail/v1/undo_send/${queue_id}/status`,
  );
}

export async function get_pending_emails(): Promise<
  ApiResponse<PendingEmailsResponse>
> {
  return api_client.get<PendingEmailsResponse>("/mail/v1/undo_send/pending");
}

export async function send_queued_now(
  queue_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/mail/v1/undo_send/${queue_id}/send-now`,
    {},
  );
}

export const undo_send_api = {
  queue_email,
  cancel_email,
  get_status: get_queued_email_status,
  get_pending: get_pending_emails,
  send_now: send_queued_now,
};
