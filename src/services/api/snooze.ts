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
  return api_client.get("/mail/v1/snooze", { cache_ttl: 30_000 });
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
