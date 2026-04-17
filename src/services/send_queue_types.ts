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
import type { RecipientKeyResult } from "@/utils/email_crypto";
import type { PendingSend } from "./undo_send_manager";

export type SendErrorType =
  | "vault_unavailable"
  | "encryption_failed"
  | "send_failed"
  | "rate_limited"
  | "recipient_error"
  | "mixed_recipients";

export class SendError extends Error {
  type: SendErrorType;

  constructor(message: string, type: SendErrorType = "send_failed") {
    super(message);
    this.type = type;
    this.name = "SendError";
  }
}

export function create_error(type: SendErrorType, message: string): SendError {
  return new SendError(message, type);
}

export function format_time_remaining(resets_at: string): string {
  const reset_time = new Date(resets_at).getTime();
  const now = Date.now();
  const diff_ms = reset_time - now;

  if (diff_ms <= 0) return "a moment";

  const hours = Math.floor(diff_ms / 3600000);
  const minutes = Math.ceil((diff_ms % 3600000) / 60000);

  if (hours > 0) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
}

export interface EncryptionOptions {
  auto_discover_keys: boolean;
  encrypt_emails: boolean;
  require_encryption: boolean;
}

export interface EmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  envelope_subject?: string;
  body: string;
  thread_id?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  encryption_options?: EncryptionOptions;
  recipient_keys?: RecipientKeyResult[];
  expires_at?: string;
  expiry_password?: string;
  attachments?: import("@/components/compose/compose_shared").Attachment[];
  forward_original_mail_id?: string;
}

export interface QueueCallbacks {
  on_complete: () => void;
  on_cancel: () => void;
  on_error?: (error: SendError) => void;
}

export interface QueuedEmailInternal extends EmailParams {
  id: string;
  scheduled_time: number;
  timeout_id: number;
  callbacks: QueueCallbacks;
}

export interface QueuedEmail extends EmailParams {
  id: string;
  scheduled_time: number;
  timeout_id: number;
  on_complete: () => void;
  on_cancel: () => void;
  on_error?: (error: string) => void;
}

export interface MailEnvelope {
  version: number;
  subject: string;
  body_text: string;
  body_html?: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
}

export interface EncryptionResult {
  encrypted_body: string;
  is_encrypted: boolean;
}

export interface EnvelopeData {
  encrypted_envelope: string;
  envelope_nonce: string;
  folder_token: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
}

export type SendReadinessResult =
  | { ready: true }
  | { ready: false; error: SendError };

export interface ServerQueueEmailParams extends EmailParams {
  thread_id?: string;
  in_reply_to?: string;
  server_attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
  }>;
}

export interface ServerQueueCallbacks {
  on_sent?: () => void;
  on_cancelled?: () => void;
  on_error?: (error: string) => void;
}

export interface ServerQueueResult {
  queue_id: string;
  pending_send: PendingSend;
}
