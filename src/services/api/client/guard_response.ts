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
import {
  GUARD_DEVICE_PENDING_EVENT,
  GUARD_HELD_EVENT,
  GUARD_REQUIRED_EVENT,
  get_error_code_from_status,
  parse_guard_device_pending,
  parse_guard_held,
  parse_guard_required,
  type ApiResponse,
  type GuardHeldInfo,
} from "./helpers";

export const GUARD_API_PREFIX = "/core/v1/guard";

export interface GuardErrorBody {
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

function dispatch(name: string, detail: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function is_guard_endpoint(endpoint: string): boolean {
  return endpoint.split("?")[0].startsWith(GUARD_API_PREFIX);
}

export function is_guard_server_code(
  endpoint: string,
  code: string | undefined,
): boolean {
  if (!code) return false;
  if (code.startsWith("GUARD_")) return true;

  return code === "STEP_UP_REQUIRED" && is_guard_endpoint(endpoint);
}

export function dispatch_guard_held(held: GuardHeldInfo): void {
  dispatch(GUARD_HELD_EVENT, held);
}

export function guard_held_from_success(
  status: number,
  data: unknown,
): GuardHeldInfo | null {
  if (status !== 202 || !data || typeof data !== "object") return null;
  const body = data as GuardErrorBody;

  if (body.code !== "GUARD_HELD") return null;

  return parse_guard_held(body.details);
}

function read_retry_after(
  details: Record<string, unknown> | undefined,
  header_secs: number | undefined,
): number | undefined {
  const value = details?.retry_after_secs;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  return header_secs;
}

export function guard_error_response<T>(
  endpoint: string,
  status: number,
  body: GuardErrorBody,
  message: string,
  header_retry_after_secs: number | undefined,
): ApiResponse<T> | null {
  if (!is_guard_server_code(endpoint, body.code)) return null;

  const result: ApiResponse<T> = {
    error: message,
    code: get_error_code_from_status(status),
    status,
    server_code: body.code,
    details: body.details,
    body: body as Record<string, unknown>,
  };

  if (status === 429) {
    const retry_after_secs = read_retry_after(
      body.details,
      header_retry_after_secs,
    );

    if (retry_after_secs !== undefined) {
      result.retry_after_secs = retry_after_secs;
    }
  }

  if (body.code === "GUARD_HELD") {
    const held = parse_guard_held(body.details);

    if (held) {
      result.held = held;
      dispatch_guard_held(held);
    }
  } else if (body.code === "GUARD_REQUIRED") {
    const info = parse_guard_required(body.details);

    if (info) dispatch(GUARD_REQUIRED_EVENT, info);
  } else if (body.code === "GUARD_DEVICE_PENDING") {
    const info = parse_guard_device_pending(body.details);

    if (info) dispatch(GUARD_DEVICE_PENDING_EVENT, info);
  }

  return result;
}
