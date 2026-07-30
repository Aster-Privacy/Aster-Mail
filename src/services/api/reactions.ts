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
import { api_client, type ApiResponse } from "./client";

export interface ReactRequest {
  target_message_id: string;
  message_group_id?: string;
  thread_token?: string;
  to: string[];
  body: string;
  subject?: string;
  is_e2e_encrypted?: boolean;
  encrypted_envelope?: string;
  envelope_nonce?: string;
  folder_token?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  reply_subject?: string;
  in_reply_to?: string;
}

export interface ReactResponse {
  success: boolean;
  message: string;
  mail_item_ids: string[];
  own_reaction_mail_item_id?: string;
}

export interface UnreactRequest {
  reaction_mail_item_id: string;
}

export interface UnreactResponse {
  success: boolean;
  message: string;
}

export function react_to_message(
  request: ReactRequest,
): Promise<ApiResponse<ReactResponse>> {
  return api_client.post<ReactResponse>("/mail/v1/react", request);
}

export function unreact_to_message(
  request: UnreactRequest,
): Promise<ApiResponse<UnreactResponse>> {
  return api_client.post<UnreactResponse>("/mail/v1/react/remove", request);
}
