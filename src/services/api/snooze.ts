import { api_client, type ApiResponse } from "./client";

export interface SnoozeResponse {
  id: string;
  mail_item_id: string;
  snoozed_until: string;
}

export interface BulkSnoozeResponse {
  snoozed_count: number;
  failed_count: number;
}

export interface SnoozedItem {
  id: string;
  mail_item_id: string;
  snoozed_until: string;
  created_at: string;
}

export async function snooze_email(
  mail_item_id: string,
  snoozed_until: Date,
): Promise<ApiResponse<SnoozeResponse>> {
  return api_client.post("/mail/v1/snooze", {
    mail_item_id,
    snoozed_until: snoozed_until.toISOString(),
  });
}

export async function bulk_snooze_emails(
  mail_item_ids: string[],
  snoozed_until: Date,
): Promise<ApiResponse<BulkSnoozeResponse>> {
  return api_client.post("/mail/v1/snooze/bulk", {
    mail_item_ids,
    snoozed_until: snoozed_until.toISOString(),
  });
}

export async function list_snoozed_emails(): Promise<
  ApiResponse<SnoozedItem[]>
> {
  return api_client.get("/mail/v1/snooze");
}

export async function unsnooze_email(
  snooze_id: string,
): Promise<ApiResponse<void>> {
  return api_client.delete(`/mail/v1/snooze/${snooze_id}`);
}

export async function unsnooze_by_mail_item(
  mail_item_id: string,
): Promise<ApiResponse<void>> {
  return api_client.delete(`/mail/v1/snooze/mail/${mail_item_id}`);
}
