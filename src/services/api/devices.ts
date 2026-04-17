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

export interface Device {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
}

export interface EnrollDeviceRequest {
  name: string;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
}

export interface EnrollDeviceResponse {
  device_id: string;
}

export interface ListDevicesResponse {
  devices: Device[];
}

export async function enroll_device(
  request: EnrollDeviceRequest,
): Promise<ApiResponse<EnrollDeviceResponse>> {
  return api_client.post<EnrollDeviceResponse>(
    "/core/v1/devices/enroll",
    request,
  );
}

export async function list_devices(): Promise<
  ApiResponse<ListDevicesResponse>
> {
  return api_client.get<ListDevicesResponse>("/core/v1/devices");
}

export async function revoke_device(
  device_id: string,
): Promise<ApiResponse<void>> {
  return api_client.delete<void>(`/core/v1/devices/${device_id}`);
}

export async function revoke_all_devices(): Promise<ApiResponse<void>> {
  return api_client.post<void>("/core/v1/devices/revoke-all", {});
}

export interface DeviceCodeVerifyResponse {
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  machine_name: string;
}

export interface DeviceCodeConfirmResponse {
  device_id: string;
  machine_name: string;
}

export async function verify_device_code(
  code: string,
): Promise<ApiResponse<DeviceCodeVerifyResponse>> {
  return api_client.post<DeviceCodeVerifyResponse>(
    "/core/v1/auth/device/code/verify",
    { code },
  );
}

export async function confirm_device_code(
  code: string,
  sealed_envelope: string,
): Promise<ApiResponse<DeviceCodeConfirmResponse>> {
  return api_client.post<DeviceCodeConfirmResponse>(
    "/core/v1/auth/device/code/confirm",
    { code, sealed_envelope },
  );
}
