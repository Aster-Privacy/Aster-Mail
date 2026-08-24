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
import { Capacitor } from "@capacitor/core";

import { ignore_error } from "@/lib/ignore_error";

export const NATIVE_API_URL = "https://app.astermail.org/api";
export const API_BASE_URL =
  Capacitor.isNativePlatform() || is_tauri_env()
    ? NATIVE_API_URL
    : import.meta.env.VITE_API_URL || "/api";

export const TAURI_AUTH_SLOT_ACCESS = "access_token";
export const TAURI_AUTH_SLOT_CSRF = "csrf";

export const ACCOUNTS_ROSTER_KEY = "astermail_accounts_v6";
export const REFRESH_INTERVAL_MINUTES = 10;
export const PROACTIVE_REFRESH_THRESHOLD_MINUTES = 25;
export const WRITE_DEAD_REFRESH_DENIALS = 8;
export const WRITE_DEAD_MIN_ELAPSED_MS = 10 * 60 * 1000;

export function is_write_dead_streak(
  denial_count: number,
  streak_started_at: number,
  now: number,
): boolean {
  return (
    denial_count >= WRITE_DEAD_REFRESH_DENIALS &&
    streak_started_at > 0 &&
    now - streak_started_at >= WRITE_DEAD_MIN_ELAPSED_MS
  );
}

export const DEV_TOKEN_KEY = "__aster_dev_token__";
export const NATIVE_TOKEN_KEY = "aster_access_token";
export const NATIVE_REFRESH_TOKEN_KEY = "aster_refresh_token";
export const NATIVE_CSRF_KEY = "aster_csrf_token";
export const TAURI_TOKEN_KEY = "aster_tauri_token";
export const TAURI_CSRF_KEY = "aster_tauri_csrf";

export function is_tauri_env(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export const LAST_AUTH_MS_KEY = "aster_last_auth_ms";
export const OFFLINE_TOMBSTONE_MS = 86_400_000;

export function detect_client_platform(): string {
  if (typeof window === "undefined") return "web";
  if (is_tauri_env()) return "tauri-desktop";
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { getPlatform?: () => string };
      }
    ).Capacitor;
    const platform = cap?.getPlatform?.();

    if (platform === "ios") return "capacitor-ios";
    if (platform === "android") return "capacitor-android";
  } catch (caught) {
    ignore_error("services/api/client/helpers:detect_client_platform", caught);
  }

  return "web";
}

export const CLIENT_PLATFORM_HEADER = detect_client_platform();

export function is_local_hostname(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location?.hostname || "";

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

export function read_last_auth_ms(): number {
  try {
    const raw = localStorage.getItem(LAST_AUTH_MS_KEY);

    if (!raw) return 0;
    const n = parseInt(raw, 10);

    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function write_last_auth_ms(ms: number): void {
  try {
    localStorage.setItem(LAST_AUTH_MS_KEY, String(ms));
  } catch (caught) {
    ignore_error("services/api/client/helpers:write_last_auth_ms", caught);
  }
}

export function clear_last_auth_ms(): void {
  try {
    localStorage.removeItem(LAST_AUTH_MS_KEY);
  } catch (caught) {
    ignore_error("services/api/client/helpers:clear_last_auth_ms", caught);
  }
}

export function is_offline_tombstoned(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine) return false;
  const last = read_last_auth_ms();

  if (!last) return false;

  return Date.now() - last > OFFLINE_TOMBSTONE_MS;
}

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMIT_EXCEEDED"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR"
  | "ABUSE_ACCOUNT_LIMIT"
  | "USERNAME_IN_USE"
  | "REGISTRATION_SUSPENDED"
  | "RECOVERY_EMAIL_REQUIRED"
  | "EXTERNAL_SEND_QUOTA_REACHED"
  | "APP_LOCKED";

export interface ApiError {
  message: string;
  code: ApiErrorCode;
  status?: number;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: ApiErrorCode;
  server_code?: string;
  resets_at?: string;
  details?: Record<string, unknown>;
}

export function is_api_success<T>(
  response: ApiResponse<T>,
): response is ApiResponse<T> & { data: T } {
  return response.data !== undefined && !response.error;
}

export function is_api_error<T>(
  response: ApiResponse<T>,
): response is ApiResponse<T> & { error: string } {
  return response.error !== undefined;
}

export const FAMILY_2FA_SERVER_CODE = "FAMILY_2FA_REQUIRED";
export const FAMILY_2FA_EVENT = "aster:family-2fa-required";

export const PENDING_DELETION_SERVER_CODE = "ACCOUNT_PENDING_DELETION";
export const PENDING_DELETION_EVENT = "aster:account-pending-deletion";

export function is_pending_deletion_error(
  server_code: string | undefined,
  message: string | undefined,
): boolean {
  if (server_code === PENDING_DELETION_SERVER_CODE) return true;

  return /scheduled\s+for\s+deletion/i.test(message || "");
}

export function get_error_code_from_status(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "VALIDATION_ERROR";
    case 429:
      return "RATE_LIMIT_EXCEEDED";
    default:
      return status >= 500 ? "SERVER_ERROR" : "UNKNOWN_ERROR";
  }
}

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retry?: number;
  retry_delay?: number;
  cache_ttl?: number;
  skip_cache?: boolean;
  skip_session_refresh?: boolean;
  skip_dedup?: boolean;
  skip_upgrade_prompt?: boolean;
  folder_unlock_token?: string;
}

export const FOLDER_UNLOCK_HEADER = "X-Folder-Unlock";

export function unlock_token_cache_suffix(token: string | undefined): string {
  if (!token) return "";

  let hash = 5381;

  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) >>> 0;
  }

  return `|u:${hash.toString(36)}`;
}

export const IDENTITY_CHECK_MIN_INTERVAL_MS = 30000;
export const IDENTITY_ESTABLISHING_ENDPOINTS = [
  "/core/v1/auth/login",
  "/core/v1/auth/register",
  "/core/v1/auth/logout",
  "/core/v1/auth/clear-session",
];

export function is_identity_establishing_endpoint(endpoint: string): boolean {
  const path = endpoint.split("?")[0];

  return IDENTITY_ESTABLISHING_ENDPOINTS.includes(path);
}

export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_RETRY_COUNT = 0;
export const DEFAULT_RETRY_DELAY = 1000;

export interface CachedUserInfo {
  user_id: string;
  username: string | null;
  email: string | null;
  display_name: string | null;
  profile_color: string | null;
  profile_picture: string | null;
  lockdown_mode_enabled?: boolean;
}

export type SessionReestablishResult = "ok" | "expired" | "unavailable";

export interface PendingTokenWrite {
  access_token: string | null;
  refresh_token?: string | null;
}
