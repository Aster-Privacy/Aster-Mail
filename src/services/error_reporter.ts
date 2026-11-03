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

import { get_api_base_url } from "@/services/api/base_url";
import {
  get_effective_base_url,
  routed_fetch,
} from "@/services/routing/routing_provider";

const SURFACE = "mail_app";
const MAX_REPORTS_PER_SESSION = 40;
const DEDUPE_WINDOW_MS = 60_000;
const SLUG_PATTERN = /^[a-z0-9_.-]{1,64}$/;
const ID_SEGMENT = /^[0-9]+$|^[0-9a-f]{8,}$|-/i;

const ROUTE_ROOTS: readonly string[] = [
  "inbox",
  "sent",
  "drafts",
  "starred",
  "archive",
  "spam",
  "trash",
  "folder",
  "label",
  "compose",
  "search",
  "settings",
  "contacts",
  "calendar",
  "login",
  "signin",
  "signup",
  "register",
  "recover",
  "onboarding",
  "billing",
  "plans",
  "all",
  "email",
  "view",
  "snoozed",
  "scheduled",
  "subscriptions",
  "tag",
  "alias",
  "family",
  "sign-in",
  "forgot-password",
  "reset-password",
  "link-device",
  "join",
  "invite",
];

const ERROR_KINDS: Readonly<Record<string, string>> = {
  TypeError: "type_error",
  ReferenceError: "reference_error",
  SyntaxError: "syntax_error",
  RangeError: "range_error",
  URIError: "uri_error",
  AggregateError: "aggregate_error",
  AbortError: "abort",
  TimeoutError: "timeout",
  NetworkError: "network",
  QuotaExceededError: "quota",
  NotAllowedError: "not_allowed",
  NotFoundError: "not_found",
  NotSupportedError: "not_supported",
  InvalidStateError: "invalid_state",
  InvalidAccessError: "invalid_access",
  OperationError: "operation",
  DataError: "data",
  DataCloneError: "data_clone",
  SecurityError: "security",
  UnknownError: "unknown_dom",
  ChunkLoadError: "chunk_load",
};

const CHUNK_LOAD_PATTERN =
  /dynamically imported module|importing a module script failed|failed to load module script/i;
const FETCH_FAILED_PATTERN =
  /^(failed to fetch|load failed|networkerror when attempting to fetch resource\.?|the network connection was lost\.?)$/i;
const RESIZE_OBSERVER_PATTERN = /^resizeobserver loop/i;
const CROSS_ORIGIN_MESSAGE = "Script error.";
const BENIGN_KINDS: readonly string[] = [
  "abort",
  "resize_observer",
  "cross_origin",
];

export function error_kind(reason: unknown): string {
  try {
    if (reason === undefined || reason === null) {
      return "empty";
    }
    if (typeof reason !== "object") {
      return "non_error";
    }
    const name = (reason as { name?: unknown }).name;
    const message = (reason as { message?: unknown }).message;

    if (typeof message === "string") {
      if (CHUNK_LOAD_PATTERN.test(message)) {
        return "chunk_load";
      }
      if (RESIZE_OBSERVER_PATTERN.test(message)) {
        return "resize_observer";
      }
      if (name === "TypeError" && FETCH_FAILED_PATTERN.test(message.trim())) {
        return "fetch_failed";
      }
    }
    if (
      typeof name === "string" &&
      Object.prototype.hasOwnProperty.call(ERROR_KINDS, name)
    ) {
      return ERROR_KINDS[name];
    }

    return reason instanceof Error ? "error" : "non_error";
  } catch {
    return "other";
  }
}

function uncaught_kind(event: ErrorEvent): string {
  if (event.error === undefined || event.error === null) {
    if (event.message === CROSS_ORIGIN_MESSAGE) {
      return "cross_origin";
    }
    if (
      typeof event.message === "string" &&
      RESIZE_OBSERVER_PATTERN.test(event.message)
    ) {
      return "resize_observer";
    }
  }

  return error_kind(event.error);
}

function severity_of_kind(kind: string): Severity {
  return BENIGN_KINDS.includes(kind) ? "warn" : "error";
}

let reports_sent = 0;
const last_seen = new Map<string, number>();

export type Severity = "warn" | "error";

export interface ClientErrorInput {
  feature: string;
  error_code: string;
  severity?: Severity;
  http_status?: number;
}

function platform(): string {
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      return "desktop";
    }
    if (Capacitor.isNativePlatform()) {
      const name = Capacitor.getPlatform();

      return SLUG_PATTERN.test(name) ? name : "native";
    }
  } catch {
    return "web";
  }

  return "web";
}

function release(): string {
  try {
    const value = __APP_VERSION__;

    return typeof value === "string" && SLUG_PATTERN.test(value)
      ? value
      : "unknown";
  } catch {
    return "unknown";
  }
}

function route_pattern(): string {
  if (typeof window === "undefined") {
    return "/unknown";
  }
  const raw = window.location.hash.startsWith("#/")
    ? window.location.hash.slice(1)
    : window.location.pathname;
  const path = raw.split("?")[0].replace(/\/+$/, "") || "/";

  if (path === "/") {
    return "/";
  }
  const first = path.split("/").filter(Boolean)[0] ?? "";
  const root = first.toLowerCase();

  return ROUTE_ROOTS.includes(root) ? `/${root}/*` : "/other";
}

export function feature_of_endpoint(endpoint: string): string {
  try {
    const path = endpoint.split("?")[0].split("#")[0];
    const segments = path
      .split("/")
      .filter(Boolean)
      .filter((segment) => !/^v[0-9]+$/i.test(segment))
      .filter((segment) => !ID_SEGMENT.test(segment))
      .map((segment) => segment.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))
      .filter(Boolean);
    const slug = segments.slice(0, 3).join("_").slice(0, 64);

    return SLUG_PATTERN.test(slug) ? slug : "request";
  } catch {
    return "request";
  }
}

export function http_error_code(prefix: string, status: number): string {
  const safe_prefix = SLUG_PATTERN.test(prefix) ? prefix : "request";

  return `${safe_prefix}_http_${status}`.slice(0, 64);
}

function should_send(key: string): boolean {
  if (reports_sent >= MAX_REPORTS_PER_SESSION) {
    return false;
  }
  const now = Date.now();
  const previous = last_seen.get(key);

  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) {
    return false;
  }
  last_seen.set(key, now);
  reports_sent += 1;

  return true;
}

export function report_client_error(input: ClientErrorInput): void {
  try {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return;
    }
    if (
      !SLUG_PATTERN.test(input.feature) ||
      !SLUG_PATTERN.test(input.error_code)
    ) {
      return;
    }

    const status =
      typeof input.http_status === "number" &&
      Number.isInteger(input.http_status) &&
      input.http_status >= 100 &&
      input.http_status <= 599
        ? input.http_status
        : undefined;

    const key = `${input.feature}|${input.error_code}|${status ?? 0}`;

    if (!should_send(key)) {
      return;
    }

    const body = JSON.stringify({
      surface: SURFACE,
      feature: input.feature,
      error_code: input.error_code,
      severity: input.severity ?? "error",
      platform: platform(),
      release: release(),
      route: route_pattern(),
      ...(status === undefined ? {} : { http_status: status }),
    });

    const base_url = get_effective_base_url(get_api_base_url());

    void routed_fetch(`${base_url}/core/v1/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    return;
  }
}

let handlers_installed = false;

export function install_global_error_reporting(): void {
  if (handlers_installed || typeof window === "undefined") {
    return;
  }
  handlers_installed = true;

  window.addEventListener("error", (event) => {
    const is_asset =
      event.target instanceof HTMLScriptElement ||
      event.target instanceof HTMLLinkElement;

    if (is_asset) {
      report_client_error({
        feature: "app",
        error_code: "asset_load_failed",
        severity: "error",
      });

      return;
    }

    const kind = uncaught_kind(event);

    report_client_error({
      feature: "app",
      error_code: `uncaught_exception_${kind}`,
      severity: severity_of_kind(kind),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const kind = error_kind(event.reason);

    report_client_error({
      feature: "app",
      error_code: `unhandled_rejection_${kind}`,
      severity: severity_of_kind(kind),
    });
  });
}
