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
  check_account_health,
  type ExternalAccountHealthStatus,
} from "@/services/api/external_accounts";
import { en } from "@/lib/i18n/translations/en";

export type HealthErrorType =
  | "auth_failure"
  | "connection_refused"
  | "tls_error"
  | "timeout"
  | "server_error"
  | "unknown";

export interface AccountHealthState {
  account_token: string;
  imap_status: "connected" | "disconnected" | "error" | "unknown";
  smtp_status: "connected" | "disconnected" | "error" | "unknown";
  last_error_type: HealthErrorType | null;
  last_error_message: string | null;
  consecutive_failures: number;
  requires_reauth: boolean;
  last_check_at: string | null;
  is_checking: boolean;
}

export interface HealthCheckHistoryEntry {
  account_token: string;
  timestamp: string;
  imap_status: "connected" | "disconnected" | "error" | "unknown";
  smtp_status: "connected" | "disconnected" | "error" | "unknown";
  error_type: HealthErrorType | null;
  error_message: string | null;
  server_capabilities: string[];
  tls_info: string | null;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES_FOR_REAUTH = 3;
const MAX_HISTORY_ENTRIES = 5;
const MAX_ERROR_MESSAGE_LENGTH = 512;
const MAX_CAPABILITY_LENGTH = 128;
const MAX_CAPABILITIES_COUNT = 50;

const AUTH_FAILURE_PATTERNS = [
  "authentication failed",
  "auth failure",
  "invalid credentials",
  "wrong password",
  "expired token",
  "account locked",
  "login failed",
  "unauthorized",
  "invalid password",
  "access denied",
  "app password required",
  "oauth",
  "token expired",
];

const CONNECTION_REFUSED_PATTERNS = [
  "connection refused",
  "econnrefused",
  "unreachable",
  "no route to host",
  "dns resolution failed",
  "getaddrinfo",
  "host not found",
  "network unreachable",
];

const TLS_ERROR_PATTERNS = [
  "tls",
  "ssl",
  "certificate",
  "cert",
  "handshake failed",
  "self-signed",
  "expired certificate",
  "unable to verify",
  "x509",
];

const TIMEOUT_PATTERNS = [
  "timeout",
  "timed out",
  "etimedout",
  "econnaborted",
  "deadline exceeded",
];

const SERVER_ERROR_PATTERNS = [
  "server error",
  "internal error",
  "service unavailable",
  "mailbox unavailable",
  "too many connections",
  "try again later",
  "temporary failure",
  "overloaded",
];

function sanitize_error_message(message: string): string {
  if (!message) {
    return en.errors.unknown_error;
  }

  const truncated =
    message.length > MAX_ERROR_MESSAGE_LENGTH
      ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH) + "..."
      : message;

  return truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function sanitize_capabilities(capabilities: unknown): string[] {
  if (!Array.isArray(capabilities)) {
    return [];
  }

  return capabilities
    .filter((cap): cap is string => typeof cap === "string" && cap.length > 0)
    .slice(0, MAX_CAPABILITIES_COUNT)
    .map((cap) =>
      cap.length > MAX_CAPABILITY_LENGTH
        ? cap.slice(0, MAX_CAPABILITY_LENGTH)
        : cap,
    );
}

function create_default_health_state(
  account_token: string,
): AccountHealthState {
  return {
    account_token,
    imap_status: "unknown",
    smtp_status: "unknown",
    last_error_type: null,
    last_error_message: null,
    consecutive_failures: 0,
    requires_reauth: false,
    last_check_at: null,
    is_checking: false,
  };
}

class ExternalAccountHealthMonitor {
  private health_states: Map<string, AccountHealthState> = new Map();
  private health_history: Map<string, HealthCheckHistoryEntry[]> = new Map();
  private poll_timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(states: AccountHealthState[]) => void> = new Set();
  private monitored_tokens: Set<string> = new Set();
  private in_flight_checks: Map<string, AbortController> = new Map();
  private destroyed: boolean = false;

  initialize(account_tokens: string[]): void {
    this.destroy();
    this.destroyed = false;

    const valid_tokens = account_tokens.filter(
      (token) => typeof token === "string" && token.length > 0,
    );

    for (const token of valid_tokens) {
      this.monitored_tokens.add(token);

      if (!this.health_states.has(token)) {
        this.health_states.set(token, create_default_health_state(token));
      }

      if (!this.health_history.has(token)) {
        this.health_history.set(token, []);
      }
    }

    if (valid_tokens.length === 0) {
      return;
    }

    this.notify_listeners();

    for (const token of valid_tokens) {
      this.check_health(token);
    }

    this.poll_timer = setInterval(() => {
      if (this.destroyed) {
        return;
      }

      for (const token of this.monitored_tokens) {
        this.check_health(token);
      }
    }, POLL_INTERVAL_MS);
  }

  async check_health(account_token: string): Promise<AccountHealthState> {
    if (!account_token || typeof account_token !== "string" || this.destroyed) {
      return (
        this.health_states.get(account_token) ||
        create_default_health_state(account_token || "")
      );
    }

    const existing_check = this.in_flight_checks.get(account_token);

    if (existing_check) {
      existing_check.abort();
      this.in_flight_checks.delete(account_token);
    }

    const abort_controller = new AbortController();

    this.in_flight_checks.set(account_token, abort_controller);

    if (!this.health_states.has(account_token)) {
      this.health_states.set(
        account_token,
        create_default_health_state(account_token),
      );
    }

    const current_state = this.health_states.get(account_token)!;

    this.health_states.set(account_token, {
      ...current_state,
      is_checking: true,
    });
    this.notify_listeners();

    try {
      const response = await check_account_health(account_token);

      if (abort_controller.signal.aborted || this.destroyed) {
        return (
          this.health_states.get(account_token) ||
          create_default_health_state(account_token)
        );
      }

      const fresh_state = this.health_states.get(account_token);
      const base_failures = fresh_state
        ? fresh_state.consecutive_failures
        : current_state.consecutive_failures;
      const base_requires_reauth = fresh_state
        ? fresh_state.requires_reauth
        : current_state.requires_reauth;

      if (response.data) {
        const health_data: ExternalAccountHealthStatus = response.data;
        const raw_error =
          health_data.last_imap_error ||
          health_data.last_smtp_error ||
          health_data.last_auth_error ||
          null;

        const combined_error = raw_error
          ? sanitize_error_message(raw_error)
          : null;

        const error_type = combined_error
          ? this.classify_error(combined_error)
          : null;

        const imap_status = health_data.imap_connected
          ? ("connected" as const)
          : health_data.last_imap_error
            ? ("error" as const)
            : ("disconnected" as const);

        const smtp_status = health_data.smtp_connected
          ? ("connected" as const)
          : health_data.last_smtp_error
            ? ("error" as const)
            : ("disconnected" as const);

        const has_error =
          imap_status === "error" ||
          smtp_status === "error" ||
          !!combined_error;

        const new_consecutive_failures = has_error ? base_failures + 1 : 0;

        const requires_reauth =
          health_data.requires_reauth ||
          (error_type === "auth_failure" &&
            new_consecutive_failures >= MAX_CONSECUTIVE_FAILURES_FOR_REAUTH);

        const now = new Date().toISOString();

        const updated_state: AccountHealthState = {
          account_token,
          imap_status,
          smtp_status,
          last_error_type: error_type,
          last_error_message: combined_error,
          consecutive_failures: new_consecutive_failures,
          requires_reauth,
          last_check_at: now,
          is_checking: false,
        };

        this.health_states.set(account_token, updated_state);

        const history_entry: HealthCheckHistoryEntry = {
          account_token,
          timestamp: now,
          imap_status,
          smtp_status,
          error_type,
          error_message: combined_error,
          server_capabilities: sanitize_capabilities(
            health_data.server_capabilities,
          ),
          tls_info: null,
        };

        this.push_history_entry(account_token, history_entry);
        this.emit_health_changed(account_token, updated_state);

        if (requires_reauth && !base_requires_reauth) {
          this.emit_reauth_required(account_token);
        }

        this.notify_listeners();
        this.in_flight_checks.delete(account_token);

        return updated_state;
      }

      const error_message = sanitize_error_message(
        response.error || en.errors.health_check_failed,
      );
      const error_type = this.classify_error(error_message);
      const new_consecutive_failures = base_failures + 1;
      const now = new Date().toISOString();

      const requires_reauth =
        error_type === "auth_failure" &&
        new_consecutive_failures >= MAX_CONSECUTIVE_FAILURES_FOR_REAUTH;

      const updated_state: AccountHealthState = {
        account_token,
        imap_status: "error",
        smtp_status: "error",
        last_error_type: error_type,
        last_error_message: error_message,
        consecutive_failures: new_consecutive_failures,
        requires_reauth: base_requires_reauth || requires_reauth,
        last_check_at: now,
        is_checking: false,
      };

      this.health_states.set(account_token, updated_state);

      const history_entry: HealthCheckHistoryEntry = {
        account_token,
        timestamp: now,
        imap_status: "error",
        smtp_status: "error",
        error_type,
        error_message,
        server_capabilities: [],
        tls_info: null,
      };

      this.push_history_entry(account_token, history_entry);
      this.emit_health_changed(account_token, updated_state);

      if (requires_reauth && !base_requires_reauth) {
        this.emit_reauth_required(account_token);
      }

      this.notify_listeners();
      this.in_flight_checks.delete(account_token);

      return updated_state;
    } catch (err) {
      if (abort_controller.signal.aborted || this.destroyed) {
        return (
          this.health_states.get(account_token) ||
          create_default_health_state(account_token)
        );
      }

      const fresh_state = this.health_states.get(account_token);
      const base_failures_catch = fresh_state
        ? fresh_state.consecutive_failures
        : current_state.consecutive_failures;

      const error_message = sanitize_error_message(
        err instanceof Error ? err.message : en.errors.unexpected_health_check_error,
      );
      const error_type = this.classify_error(error_message);
      const new_consecutive_failures = base_failures_catch + 1;
      const now = new Date().toISOString();

      const updated_state: AccountHealthState = {
        account_token,
        imap_status: "error",
        smtp_status: "error",
        last_error_type: error_type,
        last_error_message: error_message,
        consecutive_failures: new_consecutive_failures,
        requires_reauth:
          fresh_state?.requires_reauth || current_state.requires_reauth,
        last_check_at: now,
        is_checking: false,
      };

      this.health_states.set(account_token, updated_state);

      const history_entry: HealthCheckHistoryEntry = {
        account_token,
        timestamp: now,
        imap_status: "error",
        smtp_status: "error",
        error_type,
        error_message,
        server_capabilities: [],
        tls_info: null,
      };

      this.push_history_entry(account_token, history_entry);
      this.emit_health_changed(account_token, updated_state);
      this.notify_listeners();
      this.in_flight_checks.delete(account_token);

      return updated_state;
    }
  }

  get_health(account_token: string): AccountHealthState | undefined {
    return this.health_states.get(account_token);
  }

  get_all_health(): AccountHealthState[] {
    return Array.from(this.health_states.values());
  }

  get_history(account_token: string): HealthCheckHistoryEntry[] {
    const history = this.health_history.get(account_token);

    if (!history) {
      return [];
    }

    return [...history];
  }

  acknowledge_reauth(account_token: string): void {
    const state = this.health_states.get(account_token);

    if (!state) {
      return;
    }

    const updated_state: AccountHealthState = {
      ...state,
      requires_reauth: false,
      consecutive_failures: 0,
    };

    this.health_states.set(account_token, updated_state);
    this.emit_health_changed(account_token, updated_state);
    this.notify_listeners();
  }

  subscribe(listener: (states: AccountHealthState[]) => void): () => void {
    this.listeners.add(listener);

    try {
      listener(this.get_all_health());
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    }

    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.destroyed = true;

    if (this.poll_timer !== null) {
      clearInterval(this.poll_timer);
      this.poll_timer = null;
    }

    for (const controller of this.in_flight_checks.values()) {
      controller.abort();
    }

    this.in_flight_checks.clear();
    this.monitored_tokens.clear();
    this.listeners.clear();
    this.health_states.clear();
    this.health_history.clear();
  }

  private classify_error(error_message: string): HealthErrorType {
    const lower = error_message.toLowerCase();

    for (const pattern of AUTH_FAILURE_PATTERNS) {
      if (lower.includes(pattern)) {
        return "auth_failure";
      }
    }

    for (const pattern of CONNECTION_REFUSED_PATTERNS) {
      if (lower.includes(pattern)) {
        return "connection_refused";
      }
    }

    for (const pattern of TLS_ERROR_PATTERNS) {
      if (lower.includes(pattern)) {
        return "tls_error";
      }
    }

    for (const pattern of TIMEOUT_PATTERNS) {
      if (lower.includes(pattern)) {
        return "timeout";
      }
    }

    for (const pattern of SERVER_ERROR_PATTERNS) {
      if (lower.includes(pattern)) {
        return "server_error";
      }
    }

    return "unknown";
  }

  private push_history_entry(
    account_token: string,
    entry: HealthCheckHistoryEntry,
  ): void {
    const history = this.health_history.get(account_token) || [];

    history.unshift(entry);

    if (history.length > MAX_HISTORY_ENTRIES) {
      history.length = MAX_HISTORY_ENTRIES;
    }

    this.health_history.set(account_token, history);
  }

  private notify_listeners(): void {
    const states = this.get_all_health();
    const snapshot = [...this.listeners];

    for (const listener of snapshot) {
      try {
        listener(states);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }
  }

  private emit_health_changed(
    account_token: string,
    health_status: AccountHealthState,
  ): void {
    if (this.destroyed) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("astermail:account-health-changed", {
        detail: { account_token, health_status },
      }),
    );
  }

  private emit_reauth_required(account_token: string): void {
    if (this.destroyed) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("astermail:account-reauth-required", {
        detail: { account_token },
      }),
    );
  }
}

export const health_monitor = new ExternalAccountHealthMonitor();
