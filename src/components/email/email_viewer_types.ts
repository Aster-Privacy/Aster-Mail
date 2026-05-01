//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UnsubscribeInfo } from "@/types/email";
import type { DraftWithContent } from "@/services/api/multi_drafts";

export interface EmailRecipient {
  name: string;
  email: string;
}

export interface DecryptedEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  body: string;
  html_content?: string;
  unsubscribe_info?: UnsubscribeInfo;
  thread_token?: string;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  expires_at?: string;
  raw_headers?: { name: string; value: string }[];
  reply_to?: EmailRecipient;
}

export interface ReplyData {
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  thread_token?: string;
  original_email_id?: string;
  reply_all?: boolean;
  original_cc?: string[];
  original_to?: string[];
  is_external?: boolean;
  thread_ghost_email?: string;
  reply_from_address?: string;
  original_rfc_message_id?: string;
}

export interface ForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
  is_external?: boolean;
  original_mail_id?: string;
}

export interface LocalEmailData {
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  sender_email?: string;
  sender_name?: string;
}

export interface UseEmailViewerOptions {
  email_id: string;
  local_email?: LocalEmailData;
  on_dismiss: () => void;
  on_reply?: (data: ReplyData) => void;
  on_forward?: (data: ForwardData) => void;
  on_edit_draft?: (draft: DraftWithContent) => void;
  use_refresh_listener?: boolean;
  grouped_email_ids?: string[];
}
