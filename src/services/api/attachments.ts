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

export interface MailAttachment {
  id: string;
  mail_item_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  seq_num: number;
  created_at: string;
}

export interface CreateAttachmentRequest {
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes?: number;
  seq_num?: number;
}

export interface AttachmentsListResponse {
  attachments: MailAttachment[];
  total: number;
}

export async function list_attachments(
  mail_id: string,
): Promise<ApiResponse<AttachmentsListResponse>> {
  return api_client.get<AttachmentsListResponse>(
    `/mail/v1/attachments/by-mail/${mail_id}`,
  );
}

export async function get_attachment(
  attachment_id: string,
): Promise<ApiResponse<MailAttachment>> {
  return api_client.get<MailAttachment>(
    `/mail/v1/attachments/${attachment_id}`,
  );
}

export async function create_attachment(
  mail_id: string,
  data: CreateAttachmentRequest,
): Promise<ApiResponse<MailAttachment>> {
  return api_client.post<MailAttachment>(
    `/mail/v1/attachments/by-mail/${mail_id}`,
    data,
  );
}

export async function delete_attachment(
  attachment_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/mail/v1/attachments/${attachment_id}`,
  );
}

export interface AttachmentMetaItem {
  id: string;
  mail_item_id: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  seq_num: number;
}

export interface BatchAttachmentMetaResponse {
  items: Record<string, AttachmentMetaItem[]>;
}

export async function batch_attachment_meta(
  mail_ids: string[],
): Promise<ApiResponse<BatchAttachmentMetaResponse>> {
  return api_client.post<BatchAttachmentMetaResponse>(
    "/mail/v1/attachments/meta/batch",
    { mail_ids },
  );
}
