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
import type { ScheduledEmailWithContent } from "@/services/api/scheduled";
import type { DraftType } from "@/services/api/multi_drafts";

export interface ReplyData {
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  original_email_id?: string;
  thread_token?: string;
  reply_all?: boolean;
  original_cc?: string[];
  original_to?: string[];
  is_external?: boolean;
  thread_ghost_email?: string;
}

export interface ForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
  original_mail_id?: string;
}

export interface DraftClickData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  updated_at: string;
  attachments?: import("@/services/api/multi_drafts").DraftAttachmentData[];
}

export interface ScheduledClickData {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

export interface EmailInboxProps {
  on_settings_click: () => void;
  current_view: string;
  on_compose?: () => void;
  on_reply?: (data: ReplyData) => void;
  on_forward?: (data: ForwardData) => void;
  on_draft_click?: (data: DraftClickData) => void;
  on_scheduled_click?: (data: ScheduledClickData) => void;
  on_email_click?: (id: string) => void;
  split_email_id?: string | null;
  split_local_email?: import("@/components/email/email_viewer_types").LocalEmailData | null;
  on_split_close?: () => void;
  split_scheduled_data?: ScheduledClickData | null;
  active_email_id?: string | null;
  on_split_scheduled_close?: () => void;
  on_scheduled_edit?: (email: ScheduledEmailWithContent) => void;
  on_email_list_change?: (
    ids: string[],
    snooze_info?: Record<string, string | undefined>,
    grouped_ids_map?: Record<string, string[] | undefined>,
    subject_map?: Record<string, string>,
  ) => void;
  on_search_click?: () => void;
  on_search_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
  focused_email_id?: string | null;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_email_index?: number;
  total_email_count?: number;
  on_navigate_to?: (id: string) => void;
  on_view_change?: (route: string) => void;
}
