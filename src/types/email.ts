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
export interface EmailSender {
  name: string;
  email: string;
  avatar_url?: string;
}

export interface EmailAttachment {
  id?: string;
  name: string;
  size: string;
  mime_type?: string;
}

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
}

export interface UnsubscribeInfo {
  has_unsubscribe: boolean;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
  unsubscribe_mailto?: string;
  method: "link" | "mailto" | "one-click" | "none";
}

export interface Email {
  id: string;
  sender: EmailSender;
  subject: string;
  preview: string;
  body?: string;
  html_content?: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_trashed?: boolean;
  is_archived: boolean;
  has_attachment: boolean;
  attachments?: EmailAttachment[];
  labels?: EmailLabel[];
  thread_id?: string;
  in_reply_to?: string;
  unsubscribe_info?: UnsubscribeInfo;
  expires_at?: string;
  expiry_type?: "sender" | "recipient";
}

export interface EmailThread {
  id: string;
  emails: Email[];
  participant_count: number;
  last_activity: string;
}

export interface DecryptedEmail extends Email {
  body: string;
  html_content?: string;
  replies?: EmailReply[];
}

export interface EmailReply {
  id: string;
  sender: EmailSender;
  timestamp: string;
  body: string;
  attachments?: EmailAttachment[];
}

export interface EmailFilter {
  type: "all" | "read" | "unread" | "attachments" | "starred";
}

export function create_empty_email(id: string): Email {
  return {
    id,
    sender: { name: "", email: "" },
    subject: "",
    preview: "",
    timestamp: new Date().toISOString(),
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    has_attachment: false,
  };
}

export type MailItemType =
  | "received"
  | "sent"
  | "draft"
  | "scheduled"
  | "outbox";

export interface InboxEmailFolder {
  folder_token: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface InboxEmailTag {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  variant?: string;
}

export type InboxEmailLabel = InboxEmailFolder;

export interface InboxEmail {
  id: string;
  item_type: MailItemType;
  sender_name: string;
  sender_email: string;
  subject: string;
  preview: string;
  body_html?: string;
  timestamp: string;
  raw_timestamp?: string;
  is_pinned: boolean;
  is_starred: boolean;
  is_selected: boolean;
  is_read: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
  has_attachment: boolean;
  category: string;
  category_color: string;
  avatar_url: string;
  is_encrypted?: boolean;
  labels?: InboxEmailLabel[];
  folders?: InboxEmailFolder[];
  tags?: InboxEmailTag[];
  snoozed_until?: string;
  thread_token?: string;
  thread_message_count?: number;
  thread_participant_names?: string[];
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  expires_at?: string;
  expiry_type?: "sender" | "recipient";
  grouped_email_ids?: string[];
  recipient_addresses?: string[];
  send_status?: string;
  size_bytes?: number;
  phishing_level?: "safe" | "suspicious" | "dangerous";
}

export interface MailItemMetadata {
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
  size_bytes: number;
  has_attachments: boolean;
  attachment_count: number;
  scheduled_at?: string;
  send_status?: string;
  snoozed_until?: string;
  trashed_at?: string;
  message_ts: string;
  created_at?: string;
  updated_at?: string;
  item_type: string;
}

export type SenderVerificationStatus =
  | "verified"
  | "invalid"
  | "unsigned"
  | "no_keys"
  | "unknown";

export interface DecryptedEnvelope {
  subject: string;
  body_text: string;
  body_html?: string;
  text_body?: string;
  html_body?: string | null;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
  raw_headers?: { name: string; value: string }[];
  sender_verification?: SenderVerificationStatus;
}

export type InboxFilterType = "all" | "read" | "unread" | "attachments";

export interface ContextMenuState {
  x: number;
  y: number;
  email: InboxEmail;
}

export interface EmailListState {
  emails: InboxEmail[];
  is_loading: boolean;
  is_loading_more: boolean;
  total_messages: number;
  has_more: boolean;
  has_initial_load: boolean;
  next_cursor?: string;
}

export interface ConfirmationDialogState {
  show_delete: boolean;
  show_archive: boolean;
  show_spam: boolean;
}
