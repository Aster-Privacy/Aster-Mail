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

import {
  get_csrf_token_from_cookie,
  set_csrf_token,
  clear_csrf_cache,
  expire_csrf_cookie,
  is_state_changing_method,
} from "./csrf";
import { request_cache } from "./request_cache";

import { refresh_session_activity } from "@/services/session_timeout_service";
import { extend_passphrase_timeout } from "@/services/crypto/memory_key_store";
import {
  routed_fetch,
  get_effective_base_url,
  get_effective_timeout,
  get_effective_retry_count,
  get_effective_retry_delay,
} from "@/services/routing/routing_provider";

const NATIVE_API_URL = "https://app.astermail.org/api";
const API_BASE_URL =
  Capacitor.isNativePlatform() || is_tauri_env()
    ? NATIVE_API_URL
    : import.meta.env.VITE_API_URL || "/api";

const REFRESH_INTERVAL_MINUTES = 10;
const PROACTIVE_REFRESH_THRESHOLD_MINUTES = 25;

const DEV_TOKEN_KEY = "__aster_dev_token__";
const NATIVE_TOKEN_KEY = "aster_access_token";
const NATIVE_CSRF_KEY = "aster_csrf_token";
const TAURI_TOKEN_KEY = "aster_tauri_token";
const TAURI_CSRF_KEY = "aster_tauri_csrf";

function is_tauri_env(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
  | "ABUSE_ACCOUNT_LIMIT";

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
  resets_at?: string;
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

function get_error_code_from_status(status: number): ApiErrorCode {
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
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_COUNT = 0;
const DEFAULT_RETRY_DELAY = 1000;

export interface CachedUserInfo {
  user_id: string;
  username: string | null;
  email: string | null;
  display_name: string | null;
  profile_color: string | null;
  profile_picture: string | null;
}

class ApiClient {
  private refresh_timeout: number | null = null;
  private is_authenticated_flag: boolean = false;
  private auth_check_promise: Promise<boolean> | null = null;
  private dev_access_token: string | null = null;
  private initial_auth_verified: boolean = false;
  private refresh_promise: Promise<void> | null = null;
  private _cached_user_info: CachedUserInfo | null = null;
  private last_refresh_timestamp: number = 0;
  private session_expired_dispatched: boolean = false;
  private intentional_logout: boolean = false;

  constructor() {
    this.load_stored_tokens();
    this.setup_visibility_refresh();
  }

  private setup_visibility_refresh(): void {
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        this.is_authenticated_flag
      ) {
        const minutes_since_refresh =
          (Date.now() - this.last_refresh_timestamp) / 60_000;

        if (minutes_since_refresh >= REFRESH_INTERVAL_MINUTES / 2) {
          this.refresh_session();
        }
      }
    });
  }

  private load_stored_tokens(): void {
    if (is_tauri_env()) {
      try {
        const token = localStorage.getItem(TAURI_TOKEN_KEY);
        const csrf = localStorage.getItem(TAURI_CSRF_KEY);

        if (token) this.dev_access_token = token;
        if (csrf) set_csrf_token(csrf);
      } catch {}

      return;
    }
    if (!import.meta.env.DEV) return;
    const stored_token = sessionStorage.getItem(DEV_TOKEN_KEY);

    if (stored_token) {
      this.dev_access_token = stored_token;
    }
  }

  private async persist_native_token(token: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.set({ key: NATIVE_TOKEN_KEY, value: token });
    } catch {}
  }

  private async clear_native_token(): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.remove({ key: NATIVE_TOKEN_KEY });
    } catch {}
  }

  private async load_native_token(): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: NATIVE_TOKEN_KEY });

      return result.value;
    } catch {
      return null;
    }
  }

  private async persist_native_csrf(token: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.set({ key: NATIVE_CSRF_KEY, value: token });
    } catch {}
  }

  private async load_native_csrf(): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: NATIVE_CSRF_KEY });

      return result.value;
    } catch {
      return null;
    }
  }

  private async clear_native_csrf(): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.remove({ key: NATIVE_CSRF_KEY });
    } catch {}
  }

  async verify_initial_auth(): Promise<boolean> {
    if (this.initial_auth_verified) {
      return this.is_authenticated_flag;
    }

    if (Capacitor.isNativePlatform() && !this.dev_access_token) {
      const persisted = await this.load_native_token();

      if (persisted) {
        this.dev_access_token = persisted;
      }
      const persisted_csrf = await this.load_native_csrf();

      if (persisted_csrf) {
        set_csrf_token(persisted_csrf);
      }
    }

    const csrf_token = get_csrf_token_from_cookie();
    const has_stored_token = !!this.dev_access_token;

    if (!csrf_token && !has_stored_token) {
      this.initial_auth_verified = true;

      return false;
    }

    this.is_authenticated_flag = true;

    if (!navigator.onLine) {
      this.initial_auth_verified = true;
      this.schedule_token_refresh();

      return true;
    }

    const is_valid = await this.check_auth_status();

    this.initial_auth_verified = true;

    if (is_valid) {
      this.schedule_token_refresh();
    } else if (
      (Capacitor.isNativePlatform() || is_tauri_env()) &&
      has_stored_token
    ) {
      this.clear_native_token();
      this.dev_access_token = null;
      if (is_tauri_env()) {
        try {
          localStorage.removeItem(TAURI_TOKEN_KEY);
          localStorage.removeItem(TAURI_CSRF_KEY);
        } catch {}
      }
    }

    return is_valid;
  }

  set_dev_token(token: string): void {
    this.dev_access_token = token;
    if (import.meta.env.DEV) {
      sessionStorage.setItem(DEV_TOKEN_KEY, token);
    }
    if (Capacitor.isNativePlatform()) {
      this.persist_native_token(token);
    }
    if (is_tauri_env()) {
      try {
        localStorage.setItem(TAURI_TOKEN_KEY, token);
      } catch {}
    }
  }

  set_csrf(token: string): void {
    set_csrf_token(token);
    if (Capacitor.isNativePlatform()) {
      this.persist_native_csrf(token);
    }
    if (is_tauri_env()) {
      try {
        localStorage.setItem(TAURI_CSRF_KEY, token);
      } catch {}
    }
  }

  clear_dev_token(): void {
    this.dev_access_token = null;
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(DEV_TOKEN_KEY);
    }
    if (Capacitor.isNativePlatform()) {
      this.clear_native_token();
      this.clear_native_csrf();
    }
    if (is_tauri_env()) {
      try {
        localStorage.removeItem(TAURI_TOKEN_KEY);
        localStorage.removeItem(TAURI_CSRF_KEY);
      } catch {}
    }
  }

  private schedule_token_refresh(): void {
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
    }

    if (!this.last_refresh_timestamp) {
      this.last_refresh_timestamp = Date.now();
    }

    const refresh_interval = REFRESH_INTERVAL_MINUTES * 60 * 1000;

    this.refresh_timeout = window.setTimeout(() => {
      this.refresh_session();
    }, refresh_interval);
  }

  async refresh_session(): Promise<void> {
    if (!this.is_authenticated_flag) return;
    if (!this.initial_auth_verified) return;

    if (!navigator.onLine) {
      this.schedule_token_refresh();

      return;
    }

    if (this.refresh_promise) {
      return this.refresh_promise;
    }

    this.refresh_promise = this.refresh_session_impl().finally(() => {
      this.refresh_promise = null;
    });

    return this.refresh_promise;
  }

  private is_transient_error_code(code: ApiErrorCode | undefined): boolean {
    return (
      code === "NETWORK_ERROR" ||
      code === "TIMEOUT_ERROR" ||
      code === "SERVER_ERROR" ||
      code === "UNKNOWN_ERROR"
    );
  }

  private async refresh_session_impl(): Promise<void> {
    const max_retries = 3;
    const retry_delay_base = 2000;

    for (let attempt = 0; attempt < max_retries; attempt++) {
      try {
        const response = await this.post<{
          csrf_token: string;
          access_token?: string;
        }>("/core/v1/auth/refresh", {});

        if (response.data?.csrf_token) {
          this.is_authenticated_flag = true;
          this.last_refresh_timestamp = Date.now();
          clear_csrf_cache();
          this.set_csrf(response.data.csrf_token);
          if (response.data.access_token) {
            this.set_dev_token(response.data.access_token);
          }
          this.schedule_token_refresh();

          return;
        }

        if (this.is_transient_error_code(response.code)) {
          if (attempt < max_retries - 1) {
            await this.delay(retry_delay_base * (attempt + 1));
            continue;
          }
          this.schedule_token_refresh();

          return;
        }

        if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
          let me_response: ApiResponse<{ user_id: string }> | null = null;

          try {
            me_response = await this.get<{ user_id: string }>(
              "/core/v1/auth/me",
              { skip_cache: true },
            );
          } catch (e) {
            if (import.meta.env.DEV) console.error(e);
            if (attempt < max_retries - 1) {
              await this.delay(retry_delay_base * (attempt + 1));
              continue;
            }
            this.schedule_token_refresh();

            return;
          }

          if (me_response.data?.user_id) {
            this.schedule_token_refresh();

            return;
          }

          if (this.is_transient_error_code(me_response.code)) {
            if (attempt < max_retries - 1) {
              await this.delay(retry_delay_base * (attempt + 1));
              continue;
            }
            this.schedule_token_refresh();

            return;
          }

          if (
            me_response.code === "UNAUTHORIZED" ||
            me_response.code === "FORBIDDEN"
          ) {
            this.dispatch_session_expired();

            return;
          }

          this.schedule_token_refresh();

          return;
        }

        this.schedule_token_refresh();

        return;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(
            `Session refresh attempt ${attempt + 1}/${max_retries} failed:`,
            error,
          );
        }
        if (attempt < max_retries - 1) {
          await this.delay(retry_delay_base * (attempt + 1));
          continue;
        }
        this.schedule_token_refresh();
      }
    }
  }

  private dispatch_session_expired(): void {
    if (this.intentional_logout) return;
    if (this.session_expired_dispatched) return;
    this.session_expired_dispatched = true;
    window.dispatchEvent(new Event("astermail:session-expired"));
  }

  begin_intentional_logout(): void {
    this.intentional_logout = true;
    this.session_expired_dispatched = true;
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
  }

  private clear_auth_state(): void {
    this.is_authenticated_flag = false;
    this.initial_auth_verified = false;
    this.clear_dev_token();
    expire_csrf_cookie();
    clear_csrf_cache();
    request_cache.clear();
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
  }

  set_authenticated(authenticated: boolean): void {
    this.is_authenticated_flag = authenticated;
    if (authenticated) {
      this.intentional_logout = false;
      this.session_expired_dispatched = false;
      this.schedule_token_refresh();
    } else {
      this.clear_auth_state();
    }
  }

  is_authenticated(): boolean {
    return this.is_authenticated_flag;
  }

  is_initial_auth_verified(): boolean {
    return this.initial_auth_verified;
  }

  set_initial_auth_verified(verified: boolean): void {
    this.initial_auth_verified = verified;
  }

  get_access_token(): string | null {
    return this.dev_access_token;
  }

  get_cached_user_info(): CachedUserInfo | null {
    return this._cached_user_info;
  }

  async check_auth_status(): Promise<boolean> {
    if (this.auth_check_promise) {
      return this.auth_check_promise;
    }

    this.auth_check_promise = (async () => {
      try {
        const response = await this.get<CachedUserInfo>("/core/v1/auth/me");

        if (response.data?.user_id) {
          this.is_authenticated_flag = true;
          this._cached_user_info = response.data;

          return true;
        }

        if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
          this.is_authenticated_flag = false;

          return false;
        }

        return this.is_authenticated_flag;
      } catch {
        return this.is_authenticated_flag;
      } finally {
        this.auth_check_promise = null;
      }
    })();

    return this.auth_check_promise;
  }

  clear_auth_data(): void {
    this.clear_auth_state();
  }

  async clear_session_cookies(): Promise<void> {
    expire_csrf_cookie();

    try {
      await this.post("/core/v1/auth/clear-session", {});
    } catch {
      return;
    }
  }

  private async request_with_timeout(
    url: string,
    options: RequestInit,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout_id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await routed_fetch(url, {
        ...options,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeout_id);
    }
  }

  private async ensure_fresh_token(endpoint: string): Promise<void> {
    if (
      !this.is_authenticated_flag ||
      !this.initial_auth_verified ||
      !this.last_refresh_timestamp ||
      endpoint.includes("/auth/refresh") ||
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/logout") ||
      endpoint.includes("/auth/totp/") ||
      endpoint.includes("/auth/salt")
    ) {
      return;
    }

    const minutes_since_refresh =
      (Date.now() - this.last_refresh_timestamp) / 60_000;

    if (minutes_since_refresh >= PROACTIVE_REFRESH_THRESHOLD_MINUTES) {
      try {
        await this.refresh_session();
      } catch {}
    }
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {},
  ): Promise<ApiResponse<T>> {
    await this.ensure_fresh_token(endpoint);

    const {
      timeout = get_effective_timeout(DEFAULT_TIMEOUT),
      retry = get_effective_retry_count(DEFAULT_RETRY_COUNT),
      retry_delay = get_effective_retry_delay(DEFAULT_RETRY_DELAY),
      cache_ttl: _cache_ttl,
      skip_cache: _skip_cache,
      ...options
    } = config;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.dev_access_token) {
      headers["Authorization"] = `Bearer ${this.dev_access_token}`;
    }

    const method = options.method || "GET";

    if (is_state_changing_method(method)) {
      const csrf_token = get_csrf_token_from_cookie();

      if (csrf_token) {
        headers["X-CSRF-Token"] = csrf_token;
      }
    }

    const url = `${get_effective_base_url(API_BASE_URL)}${endpoint}`;
    let last_error: ApiResponse<T> = {
      error: "Request failed",
      code: "UNKNOWN_ERROR",
    };
    let has_attempted_refresh = false;

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const response = await this.request_with_timeout(
          url,
          { ...options, headers, credentials: "include" },
          timeout,
        );

        if (!response.ok) {
          let error_data: {
            error?: string;
            code?: string;
            details?: Record<string, unknown>;
            resets_at?: string;
          } = {};

          try {
            error_data = await response.json();
          } catch {
            error_data = { error: response.statusText };
          }

          const error_code = get_error_code_from_status(response.status);

          if (
            response.status === 403 &&
            error_data.code === "ACCOUNT_SUSPENDED"
          ) {
            window.dispatchEvent(
              new CustomEvent("aster:account-suspended", {
                detail: { reason: error_data.error || "Account suspended" },
              }),
            );

            return {
              error: error_data.error || "Account suspended",
              code: "FORBIDDEN",
            };
          }

          if (
            response.status === 403 &&
            error_data.code === "ABUSE_ACCOUNT_LIMIT"
          ) {
            return {
              error: error_data.error || "Account limit reached",
              code: "ABUSE_ACCOUNT_LIMIT",
            };
          }

          if (
            response.status === 401 &&
            error_data.code !== "INVALID_CREDENTIALS" &&
            !endpoint.includes("/auth/switch")
          ) {
            if (
              !has_attempted_refresh &&
              !endpoint.includes("/auth/refresh") &&
              !endpoint.includes("/auth/logout")
            ) {
              has_attempted_refresh = true;
              try {
                await this.refresh_session();
              } catch (e) {
                if (import.meta.env.DEV) console.error(e);
              }
              if (this.is_authenticated_flag) {
                if (this.dev_access_token) {
                  headers["Authorization"] = `Bearer ${this.dev_access_token}`;
                }
                const fresh_csrf = get_csrf_token_from_cookie();

                if (fresh_csrf && is_state_changing_method(method)) {
                  headers["X-CSRF-Token"] = fresh_csrf;
                }
                attempt--;
                continue;
              }
            }
            if (!this.is_authenticated_flag) {
              this.dispatch_session_expired();
            }
          }

          const sanitized_error = import.meta.env.DEV
            ? error_data.error ||
              `Request failed with status ${response.status}`
            : response.status < 500 && error_data.error
              ? error_data.error
              : this.get_generic_error_message(error_code);

          last_error = {
            error: sanitized_error,
            code: error_code,
            resets_at: error_data.resets_at,
          };

          if (
            response.status === 403 &&
            is_state_changing_method(method) &&
            attempt === 0 &&
            !this.dev_access_token
          ) {
            clear_csrf_cache();
            try {
              await this.refresh_session();
              const fresh_csrf = get_csrf_token_from_cookie();

              if (fresh_csrf) {
                headers["X-CSRF-Token"] = fresh_csrf;
                continue;
              }
            } catch {}
          }

          if (response.status >= 500 && attempt < retry) {
            await this.delay(retry_delay * (attempt + 1));
            continue;
          }

          return last_error;
        }

        let data: T;

        try {
          data = await response.json();
        } catch {
          last_error = {
            error: this.get_generic_error_message("SERVER_ERROR"),
            code: "SERVER_ERROR",
          };

          if (attempt < retry) {
            await this.delay(retry_delay * (attempt + 1));
            continue;
          }

          return last_error;
        }

        refresh_session_activity();
        extend_passphrase_timeout();

        return { data };
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            last_error = {
              error: "Request timed out",
              code: "TIMEOUT_ERROR",
            };
          } else {
            last_error = {
              error: error.message || "Network error",
              code: "NETWORK_ERROR",
            };
          }
        }

        if (attempt < retry) {
          await this.delay(retry_delay * (attempt + 1));
          continue;
        }
      }
    }

    return last_error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get_generic_error_message(code: ApiErrorCode): string {
    switch (code) {
      case "UNAUTHORIZED":
        return "Authentication required. Please log in.";
      case "FORBIDDEN":
        return "You do not have permission to perform this action.";
      case "NOT_FOUND":
        return "The requested resource was not found.";
      case "VALIDATION_ERROR":
        return "Invalid request data.";
      case "CONFLICT":
        return "A conflict occurred with the current state.";
      case "RATE_LIMIT_EXCEEDED":
        return "Rate limit exceeded. Please try again later.";
      case "SERVER_ERROR":
        return "An internal error occurred. Please try again later.";
      case "NETWORK_ERROR":
        return "Unable to connect to the server.";
      case "TIMEOUT_ERROR":
        return "Request timed out. Please try again.";
      default:
        return "An unexpected error occurred.";
    }
  }

  async get<T>(
    endpoint: string,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const { cache_ttl, skip_cache, ...fetch_config } = config ?? {};
    const cache_key = `GET:${endpoint}`;

    return request_cache.get_or_fetch<ApiResponse<T>>(
      cache_key,
      () => this.request<T>(endpoint, { ...fetch_config, method: "GET" }),
      cache_ttl,
      skip_cache,
    );
  }

  async post<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async put<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "PUT",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async patch<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async delete<T>(
    endpoint: string,
    config?: RequestConfig & { data?: unknown },
  ): Promise<ApiResponse<T>> {
    const { data, ...rest } = config || {};

    const result = await this.request<T>(endpoint, {
      ...rest,
      method: "DELETE",
      ...(data ? { body: JSON.stringify(data) } : {}),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }
}

export const api_client = new ApiClient();

if (import.meta.hot) {
  interface HmrState {
    is_authenticated: boolean;
    initial_auth_verified: boolean;
    dev_access_token: string | null;
  }

  const prev = import.meta.hot.data as Partial<HmrState> | undefined;

  if (prev?.is_authenticated) {
    api_client.set_authenticated(true);
    api_client.set_initial_auth_verified(prev.initial_auth_verified ?? false);
    if (prev.dev_access_token) {
      api_client.set_dev_token(prev.dev_access_token);
    }
  }

  import.meta.hot.dispose((data: HmrState) => {
    data.is_authenticated = api_client.is_authenticated();
    data.initial_auth_verified = api_client.is_initial_auth_verified();
    data.dev_access_token = api_client.get_access_token();
  });
}
