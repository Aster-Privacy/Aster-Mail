import { api_client, type ApiResponse } from "./client";

export interface MailAttachment {
  id: string;
  mail_id: string;
  encrypted_filename: string;
  filename_nonce: string;
  encrypted_content_type: string;
  content_type_nonce: string;
  encrypted_data: string;
  data_nonce: string;
  size_bytes: number;
  created_at: string;
}

export interface CreateAttachmentRequest {
  encrypted_filename: string;
  filename_nonce: string;
  encrypted_content_type: string;
  content_type_nonce: string;
  encrypted_data: string;
  data_nonce: string;
  size_bytes: number;
}

export interface AttachmentsListResponse {
  attachments: MailAttachment[];
  total: number;
}

export async function list_attachments(
  mail_id: string,
): Promise<ApiResponse<AttachmentsListResponse>> {
  return api_client.get<AttachmentsListResponse>(
    `/mail/${mail_id}/attachments`,
  );
}

export async function get_attachment(
  attachment_id: string,
): Promise<ApiResponse<MailAttachment>> {
  return api_client.get<MailAttachment>(`/attachments/${attachment_id}`);
}

export async function create_attachment(
  mail_id: string,
  data: CreateAttachmentRequest,
): Promise<ApiResponse<MailAttachment>> {
  return api_client.post<MailAttachment>(`/mail/${mail_id}/attachments`, data);
}

export async function delete_attachment(
  attachment_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`/attachments/${attachment_id}`);
}
