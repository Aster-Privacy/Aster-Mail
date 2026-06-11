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

export interface LockdownStatusResponse {
  enabled: boolean;
}

export async function get_lockdown_status(): Promise<ApiResponse<LockdownStatusResponse>> {
  return api_client.get<LockdownStatusResponse>("/core/v1/security/lockdown", { cache_ttl: 0 });
}

export async function enable_lockdown(): Promise<ApiResponse<LockdownStatusResponse>> {
  return api_client.post<LockdownStatusResponse>("/core/v1/security/lockdown/enable", {});
}

export interface DisableLockdownRequest {
  password_hash: string;
  totp_code?: string;
}

export async function disable_lockdown(
  req: DisableLockdownRequest,
): Promise<ApiResponse<LockdownStatusResponse>> {
  return api_client.delete<LockdownStatusResponse>("/core/v1/security/lockdown/disable", { data: req });
}
