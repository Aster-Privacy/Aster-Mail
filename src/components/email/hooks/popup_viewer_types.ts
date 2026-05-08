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
import type { UnsubscribeInfo, SenderVerificationStatus } from "@/types/email";

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
  body: string;
  html_content?: string;
  unsubscribe_info?: UnsubscribeInfo;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  expires_at?: string;
  raw_headers?: { name: string; value: string }[];
  reply_to?: EmailRecipient;
  sender_verification?: SenderVerificationStatus;
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

export interface EmailPopupViewerProps {
  email_id: string | null;
  local_email?: LocalEmailData;
  on_close: () => void;
  on_reply?: (data: {
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
    reply_from_address?: string;
  }) => void;
  on_forward?: (data: {
    sender_name: string;
    sender_email: string;
    sender_avatar: string;
    email_subject: string;
    email_body: string;
    email_timestamp: string;
    is_external?: boolean;
    original_mail_id?: string;
  }) => void;
  on_compose?: (email: string) => void;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_index?: number;
  total_count?: number;
  snoozed_until?: string;
  grouped_email_ids?: string[];
  label_hints?: { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[];
}

export type PopupSize = "default" | "expanded" | "fullscreen";

export const POPUP_MARGIN = 16;
export const FULLSCREEN_MARGIN = 64;
