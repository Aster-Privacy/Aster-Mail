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
];

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

    void fetch(`${get_api_base_url()}/core/v1/client-errors`, {
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

    report_client_error({
      feature: "app",
      error_code: is_asset ? "asset_load_failed" : "uncaught_exception",
      severity: "error",
    });
  });

  window.addEventListener("unhandledrejection", () => {
    report_client_error({
      feature: "app",
      error_code: "unhandled_rejection",
      severity: "error",
    });
  });
}
