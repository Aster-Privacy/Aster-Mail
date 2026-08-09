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
import type { ReactionSummary } from "@/services/api/mail";
import type { SenderVerificationStatus } from "@/types/email";

export interface ThreadMessage {
  id: string;
  item_type: "received" | "sent" | "draft";
  encrypted_envelope: string;
  envelope_nonce: string;
  is_read: boolean;
  is_trashed: boolean;
  message_ts: string;
  created_at: string;
}

export interface DecryptedThreadMessage {
  id: string;
  item_type: "received" | "sent" | "draft";
  sender_name: string;
  sender_email: string;
  display_sender_name?: string;
  display_sender_email?: string;
  forwarding_service?: string;
  sender_verification?: SenderVerificationStatus;
  subject: string;
  body: string;
  html_content?: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_deleted: boolean;
  is_external: boolean;
  has_recipient_key?: boolean;
  is_sending?: boolean;
  send_status?: string;
  send_error?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  attachments?: ThreadAttachment[];
  to_recipients?: { name: string; email: string }[];
  cc_recipients?: { name: string; email: string }[];
  bcc_recipients?: { name: string; email: string }[];
  raw_headers?: { name: string; value: string }[];
  spf_result?: string;
  dkim_result?: string;
  dmarc_result?: string;
  spam_score?: number;
  spam_signals?: { name: string; score: number; category: string }[];
  is_spam?: boolean;
  message_group_id?: string;
  is_reaction?: boolean;
  reactions?: ReactionSummary[];
}

export interface ThreadAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  content_id?: string;
}

export interface ThreadContext {
  thread_token: string;
  original_email_id: string;
  in_reply_to?: string;
}
