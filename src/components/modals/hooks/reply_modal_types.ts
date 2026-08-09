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



import {
  type DraftContent,
} from "@/services/api/multi_drafts";

export function normalize_html_newlines(html: string): string {
  let result = "";
  let in_tag = false;

  for (const ch of html) {
    if (ch === "<") {
      in_tag = true;
      result += ch;
    } else if (ch === ">") {
      in_tag = false;
      result += ch;
    } else if (ch === "\n" && !in_tag) {
      result += "<br>";
    } else if (ch !== "\r") {
      result += ch;
    }
  }

  return result;
}

export interface UseReplyModalProps {
  is_open: boolean;
  on_close: () => void;
  recipient_name: string;
  recipient_email: string;
  quote_sender_name?: string;
  quote_sender_email?: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  original_cc?: string[];
  original_to?: string[];
  reply_all: boolean;
  thread_token?: string;
  original_email_id?: string;
  is_external: boolean;
  thread_ghost_email?: string;
  reply_from_address?: string;
  original_rfc_message_id?: string;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: DraftContent;
  }) => void;
  existing_draft?: {
    id: string;
    version: number;
    reply_to_id?: string;
    content: DraftContent;
  } | null;
}
