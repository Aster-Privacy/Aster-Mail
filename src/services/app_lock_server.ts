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
import { api_client } from "@/services/api/client";
import type { ApiResponse } from "@/services/api/client/helpers";

const APP_LOCK_BASE = "/core/v1/auth/app-lock";
const REQUEST_TIMEOUT_MS = 15000;

export type AppLockServerFailure =
  | { status: "wrong_pin" }
  | { status: "reset" }
  | { status: "unavailable" }
  | { status: "busy" }
  | { status: "limit" };

export type AppLockServerResult<T> =
  | ({ status: "ok" } & T)
  | AppLockServerFailure;

interface RegisterResponse {
  device_lock_id: string;
  secret: string;
}

interface UnwrapResponse {
  secret: string;
}

interface DeleteResponse {
  deleted: boolean;
}

export function classify_app_lock_failure(
  response: ApiResponse<unknown>,
): AppLockServerFailure {
  const code = response.server_code;

  if (code === "APP_LOCK_PROOF_INVALID") return { status: "wrong_pin" };
  if (code === "APP_LOCK_EXHAUSTED" || code === "APP_LOCK_NOT_FOUND") {
    return { status: "reset" };
  }
  if (response.status === 410) return { status: "reset" };
  if (code === "APP_LOCK_LIMIT") return { status: "limit" };
  if (response.status === 429) return { status: "busy" };

  return { status: "unavailable" };
}

const request_config = { retry: 0, timeout: REQUEST_TIMEOUT_MS, skip_dedup: true };

export async function register_app_lock(
  device_lock_id: string,
  verifier_base64: string,
): Promise<AppLockServerResult<{ secret: string }>> {
  try {
    const response = await api_client.post<RegisterResponse>(
      `${APP_LOCK_BASE}/register`,
      { device_lock_id, verifier: verifier_base64 },
      request_config,
    );

    if (
      response.data &&
      typeof response.data.secret === "string" &&
      response.data.device_lock_id === device_lock_id
    ) {
      return { status: "ok", secret: response.data.secret };
    }
    if (response.data) return { status: "unavailable" };

    return classify_app_lock_failure(response);
  } catch {
    return { status: "unavailable" };
  }
}

export async function unwrap_app_lock(
  device_lock_id: string,
  proof_base64: string,
): Promise<AppLockServerResult<{ secret: string }>> {
  try {
    const response = await api_client.post<UnwrapResponse>(
      `${APP_LOCK_BASE}/unwrap`,
      { device_lock_id, proof: proof_base64 },
      request_config,
    );

    if (response.data && typeof response.data.secret === "string") {
      return { status: "ok", secret: response.data.secret };
    }
    if (response.data) return { status: "unavailable" };

    return classify_app_lock_failure(response);
  } catch {
    return { status: "unavailable" };
  }
}

export async function delete_app_lock(device_lock_id: string): Promise<boolean> {
  try {
    const response = await api_client.delete<DeleteResponse>(
      `${APP_LOCK_BASE}/${encodeURIComponent(device_lock_id)}`,
      request_config,
    );

    return response.data !== undefined || response.status === 410;
  } catch {
    return false;
  }
}
