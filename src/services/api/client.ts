import {
  get_csrf_token_from_cookie,
  clear_csrf_cache,
  is_state_changing_method,
} from "./csrf";

import { is_auth_page } from "@/lib/auth_utils";
import { refresh_session_activity } from "@/services/session_timeout_service";
import { extend_passphrase_timeout } from "@/services/crypto/memory_key_store";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const REFRESH_INTERVAL_MINUTES = 10;

const DEV_TOKEN_KEY = "__aster_dev_token__";

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR";

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
    default:
      return status >= 500 ? "SERVER_ERROR" : "UNKNOWN_ERROR";
  }
}

interface RequestConfig extends RequestInit {
  timeout?: number;
  retry?: number;
  retry_delay?: number;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_COUNT = 0;
const DEFAULT_RETRY_DELAY = 1000;

class ApiClient {
  private refresh_timeout: number | null = null;
  private is_authenticated_flag: boolean = false;
  private auth_check_promise: Promise<boolean> | null = null;
  private dev_access_token: string | null = null;

  constructor() {
    this.check_initial_auth_state();
  }

  private check_initial_auth_state(): void {
    const csrf_token = get_csrf_token_from_cookie();
    const stored_token = import.meta.env.DEV
      ? sessionStorage.getItem(DEV_TOKEN_KEY)
      : null;

    if (csrf_token || stored_token) {
      this.is_authenticated_flag = true;
      if (stored_token) {
        this.dev_access_token = stored_token;
      }
      this.schedule_token_refresh();
    }
  }

  set_dev_token(token: string): void {
    this.dev_access_token = token;
    if (import.meta.env.DEV) {
      sessionStorage.setItem(DEV_TOKEN_KEY, token);
    }
  }

  clear_dev_token(): void {
    this.dev_access_token = null;
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(DEV_TOKEN_KEY);
    }
  }

  private schedule_token_refresh(): void {
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
    }

    const refresh_interval = REFRESH_INTERVAL_MINUTES * 60 * 1000;

    this.refresh_timeout = window.setTimeout(() => {
      this.refresh_session();
    }, refresh_interval);
  }

  async refresh_session(): Promise<void> {
    if (!this.is_authenticated_flag) return;

    const max_retries = 3;
    const retry_delay_base = 2000;

    for (let attempt = 0; attempt < max_retries; attempt++) {
      try {
        const response = await this.post<{
          csrf_token: string;
          access_token?: string;
        }>("/auth/refresh", {});

        if (response.data?.csrf_token) {
          this.is_authenticated_flag = true;
          if (response.data.access_token) {
            this.set_dev_token(response.data.access_token);
          }
          this.schedule_token_refresh();

          return;
        }

        if (
          response.code === "NETWORK_ERROR" ||
          response.code === "TIMEOUT_ERROR" ||
          response.code === "SERVER_ERROR"
        ) {
          if (attempt < max_retries - 1) {
            await this.delay(retry_delay_base * (attempt + 1));
            continue;
          }
        }

        if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
          this.clear_auth_state();

          return;
        }

        this.schedule_token_refresh();

        return;
      } catch {
        if (attempt < max_retries - 1) {
          await this.delay(retry_delay_base * (attempt + 1));
          continue;
        }
        this.schedule_token_refresh();
      }
    }
  }

  private clear_auth_state(): void {
    this.is_authenticated_flag = false;
    this.clear_dev_token();
    clear_csrf_cache();
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
  }

  set_authenticated(authenticated: boolean): void {
    this.is_authenticated_flag = authenticated;
    if (authenticated) {
      this.schedule_token_refresh();
    } else {
      this.clear_auth_state();
    }
  }

  is_authenticated(): boolean {
    return this.is_authenticated_flag;
  }

  get_access_token(): string | null {
    return this.dev_access_token;
  }

  async check_auth_status(): Promise<boolean> {
    if (is_auth_page()) {
      return this.is_authenticated_flag;
    }

    if (this.auth_check_promise) {
      return this.auth_check_promise;
    }

    this.auth_check_promise = (async () => {
      try {
        const response = await this.get<{ user_id: string }>("/auth/me");
        const is_valid = !response.error && !!response.data?.user_id;

        this.is_authenticated_flag = is_valid;

        return is_valid;
      } catch {
        this.is_authenticated_flag = false;

        return false;
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
    try {
      const url = `${API_BASE_URL}/auth/clear-session`;

      await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
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
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeout_id);
    }
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {},
  ): Promise<ApiResponse<T>> {
    const {
      timeout = DEFAULT_TIMEOUT,
      retry = DEFAULT_RETRY_COUNT,
      retry_delay = DEFAULT_RETRY_DELAY,
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
    const is_auth_endpoint =
      endpoint.startsWith("/auth/login") ||
      endpoint.startsWith("/auth/register") ||
      endpoint.startsWith("/auth/refresh");

    if (is_state_changing_method(method)) {
      const csrf_token = get_csrf_token_from_cookie();

      if (csrf_token) {
        headers["X-CSRF-Token"] = csrf_token;
      } else if (this.is_authenticated_flag && !is_auth_endpoint) {
        return {
          error: "Security token missing. Please refresh the page.",
          code: "FORBIDDEN",
        };
      }
    }

    const url = `${API_BASE_URL}${endpoint}`;
    let last_error: ApiResponse<T> = {
      error: "Request failed",
      code: "UNKNOWN_ERROR",
    };

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
          } = {};

          try {
            error_data = await response.json();
          } catch {
            error_data = { error: response.statusText };
          }

          const error_code = get_error_code_from_status(response.status);

          if (response.status === 401) {
            const was_authenticated = this.is_authenticated_flag;

            this.clear_auth_state();
            if (was_authenticated) {
              this.clear_session_cookies();
              window.dispatchEvent(
                new CustomEvent("astermail:session-expired"),
              );
            }
          }

          const sanitized_error = import.meta.env.DEV
            ? error_data.error ||
              `Request failed with status ${response.status}`
            : this.get_generic_error_message(error_code);

          last_error = {
            error: sanitized_error,
            code: error_code,
          };

          if (response.status >= 500 && attempt < retry) {
            await this.delay(retry_delay * (attempt + 1));
            continue;
          }

          return last_error;
        }

        const data = await response.json();

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
    return this.request<T>(endpoint, { ...config, method: "GET" });
  }

  async post<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async put<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async patch<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async delete<T>(
    endpoint: string,
    config?: RequestConfig & { data?: unknown },
  ): Promise<ApiResponse<T>> {
    const { data, ...rest } = config || {};

    return this.request<T>(endpoint, {
      ...rest,
      method: "DELETE",
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  }
}

export const api_client = new ApiClient();
