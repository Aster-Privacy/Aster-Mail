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

export interface VacationReplyResponse {
  id: string;
  subject: string;
  body: string;
  is_enabled: boolean;
  start_date: string | null;
  end_date: string | null;
  external_only: boolean;
  reply_count: number;
  last_replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertVacationReplyRequest {
  subject: string;
  body: string;
  is_enabled: boolean;
  start_date?: string | null;
  end_date?: string | null;
  external_only: boolean;
}

export async function get_vacation_reply(): Promise<
  ApiResponse<VacationReplyResponse | null>
> {
  try {
    const response = await api_client.get<VacationReplyResponse | null>(
      "/mail/v1/vacation_reply",
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to get vacation reply",
    };
  }
}

export async function upsert_vacation_reply(
  req: UpsertVacationReplyRequest,
): Promise<ApiResponse<VacationReplyResponse>> {
  try {
    const response = await api_client.post<VacationReplyResponse>(
      "/mail/v1/vacation_reply",
      req,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to save vacation reply",
    };
  }
}

export async function delete_vacation_reply(): Promise<
  ApiResponse<{ success: boolean }>
> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      "/mail/v1/vacation_reply",
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to delete vacation reply",
    };
  }
}

export async function toggle_vacation_reply(
  is_enabled: boolean,
): Promise<ApiResponse<VacationReplyResponse>> {
  try {
    const response = await api_client.patch<VacationReplyResponse>(
      "/mail/v1/vacation_reply/toggle",
      { is_enabled },
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to toggle vacation reply",
    };
  }
}
