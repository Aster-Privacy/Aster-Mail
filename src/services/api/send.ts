import { api_client, type ApiResponse } from "./client";

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
}

export async function send_simple_email(
  request: SimpleSendRequest,
): Promise<ApiResponse<SimpleSendResponse>> {
  return api_client.post<SimpleSendResponse>("/send", request);
}

export async function queue_send_email(
  request: QueuedSendRequest,
): Promise<ApiResponse<QueuedSendResponse>> {
  return api_client.post<QueuedSendResponse>("/undo-send/queue", request);
}

export async function send_external_email(
  request: ExternalSendRequest,
): Promise<ApiResponse<SimpleSendResponse>> {
  return api_client.post<SimpleSendResponse>("/send/external", request);
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
};
