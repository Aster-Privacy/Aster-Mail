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

export interface TrustedDeviceItem {
  id: string;
  label: string;
  user_agent_snippet?: string | null;
  ip_snippet?: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
}

export interface ListTrustedDevicesResponse {
  devices: TrustedDeviceItem[];
}

export async function list_trusted_devices(): Promise<
  ApiResponse<ListTrustedDevicesResponse>
> {
  return api_client.get<ListTrustedDevicesResponse>(
    "/core/v1/auth/trusted-devices/",
  );
}

export async function revoke_trusted_device(
  id: string,
): Promise<ApiResponse<unknown>> {
  return api_client.delete<unknown>(
    `/core/v1/auth/trusted-devices/${encodeURIComponent(id)}`,
  );
}

export async function revoke_all_trusted_devices(): Promise<
  ApiResponse<unknown>
> {
  return api_client.delete<unknown>("/core/v1/auth/trusted-devices/");
}
