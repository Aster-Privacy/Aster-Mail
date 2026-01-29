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
}

export interface QueueEmailResponse {
  queue_id: string;
  scheduled_send_at: string;
  can_cancel_until: string;
}

export type QueuedEmailStatusType =
  | "pending"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

export interface QueuedEmailStatus {
  queue_id: string;
  status: QueuedEmailStatusType;
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
  return api_client.post<QueueEmailResponse>("/undo-send/queue", request);
}

export async function cancel_email(
  queue_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(`/undo-send/${queue_id}`);
}

export async function get_queued_email_status(
  queue_id: string,
): Promise<ApiResponse<QueuedEmailStatus>> {
  return api_client.get<QueuedEmailStatus>(`/undo-send/${queue_id}/status`);
}

export async function get_pending_emails(): Promise<
  ApiResponse<PendingEmailsResponse>
> {
  return api_client.get<PendingEmailsResponse>("/undo-send/pending");
}

export async function send_queued_now(
  queue_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/undo-send/${queue_id}/send-now`,
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
