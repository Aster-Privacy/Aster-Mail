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
export interface RecentRecipient {
  id: string;
  email_token: string;
  encrypted_email: string;
  email_nonce: string;
  send_count: number;
  last_sent_at: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedRecentRecipient {
  id: string;
  email: string;
  send_count: number;
  last_sent_at: string;
}

export interface RecentRecipientsListResponse {
  items: RecentRecipient[];
}

export interface SaveRecentRecipientEntry {
  email_token: string;
  encrypted_email: string;
  email_nonce: string;
}

export interface SaveRecentRecipientsRequest {
  recipients: SaveRecentRecipientEntry[];
}

export interface SaveRecentRecipientsResponse {
  success: boolean;
  saved_count: number;
}

export interface DeleteAllRecentRecipientsResponse {
  success: boolean;
  deleted_count: number;
}
