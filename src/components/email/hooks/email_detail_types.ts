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

export interface DecryptedEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_pinned?: boolean;
  has_attachment: boolean;
  thread_count: number;
  body: string;
  html_content?: string;
  to: Array<{ name?: string; email: string }>;
  cc: Array<{ name?: string; email?: string }>;
  bcc: Array<{ name?: string; email?: string }>;
  replies: Array<{
    id: string;
    sender: string;
    sender_email: string;
    avatar: string;
    timestamp: string;
    body: string;
    attachments: Array<{ name: string; size: string }>;
  }>;
  attachments: Array<{ name: string; size: string }>;
  labels: string[];
  is_external?: boolean;
  unsubscribe_info?: UnsubscribeInfo;
}

export interface ReplyModalData {
  recipient_name: string;
  recipient_email: string;
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
