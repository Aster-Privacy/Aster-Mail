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
import { api_client, ApiResponse } from "./client";

export interface Session {
  id: string;
  device_type: string;
  browser: string;
  os: string;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

export interface SessionsListResponse {
  sessions: Session[];
  current_session_id: string;
}

export interface RevokeSessionResponse {
  success: boolean;
}

export interface RevokeAllSessionsResponse {
  success: boolean;
  revoked_count: number;
}

export async function list_sessions(): Promise<
  ApiResponse<SessionsListResponse>
> {
  const response = await api_client.get<SessionsListResponse>(
    "/core/v1/security/sessions",
  );

  if (response.code === "NOT_FOUND") {
    return {
      data: {
        sessions: [],
        current_session_id: "",
      },
    };
  }

  return response;
}

export async function revoke_session(
  session_id: string,
): Promise<ApiResponse<RevokeSessionResponse>> {
  return api_client.delete<RevokeSessionResponse>(
    `/core/v1/security/sessions/${session_id}`,
  );
}

export async function revoke_all_sessions(): Promise<
  ApiResponse<RevokeAllSessionsResponse>
> {
  return api_client.delete<RevokeAllSessionsResponse>(
    "/core/v1/security/sessions",
  );
}
