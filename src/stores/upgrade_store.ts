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
import { useSyncExternalStore } from "react";

export type UpgradeReason = "plan_limit" | "storage_full";

export type UpgradeLimitKey =
  | "max_email_aliases"
  | "max_custom_domains"
  | "max_contacts"
  | "max_email_templates"
  | "max_html_signatures"
  | "max_custom_filters"
  | "max_custom_categories"
  | "max_linked_accounts"
  | "generic";

export interface UpgradeState {
  is_open: boolean;
  reason: UpgradeReason;
  limit_key: UpgradeLimitKey;
  feature_key: string | null;
  resource_label: string | null;
  server_message: string | null;
}

const initial_state: UpgradeState = {
  is_open: false,
  reason: "plan_limit",
  limit_key: "generic",
  feature_key: null,
  resource_label: null,
  server_message: null,
};

let current: UpgradeState = initial_state;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function get_upgrade_snapshot(): UpgradeState {
  return current;
}

const RESOURCE_TO_LIMIT_KEY: Record<string, UpgradeLimitKey> = {
  aliases: "max_email_aliases",
  alias: "max_email_aliases",
  "email aliases": "max_email_aliases",
  domains: "max_custom_domains",
  "custom domains": "max_custom_domains",
  contacts: "max_contacts",
  templates: "max_email_templates",
  "email templates": "max_email_templates",
  signatures: "max_html_signatures",
  "html signatures": "max_html_signatures",
  filters: "max_custom_filters",
  "custom filters": "max_custom_filters",
  categories: "max_custom_categories",
  "custom categories": "max_custom_categories",
  accounts: "max_linked_accounts",
  "linked accounts": "max_linked_accounts",
  "signed-in accounts": "max_linked_accounts",
};

function resolve_limit_key(resource: string | null): UpgradeLimitKey {
  if (!resource) return "generic";
  const key = resource.trim().toLowerCase();

  return RESOURCE_TO_LIMIT_KEY[key] ?? "generic";
}

const AUTH_ROUTES = [
  "/sign-in",
  "/register",
  "/signup",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/verify-recovery-email",
  "/link-device",
];

export function is_on_auth_route(pathname?: string): boolean {
  if (!pathname && typeof window === "undefined") return false;
  const path = pathname ?? window.location.pathname;

  return AUTH_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

export function show_plan_limit_upgrade(opts: {
  resource?: string | null;
  message?: string | null;
  feature?: string | null;
}) {
  if (is_on_auth_route()) return;
  current = {
    is_open: true,
    reason: "plan_limit",
    limit_key: resolve_limit_key(opts.resource ?? null),
    feature_key: opts.feature ?? null,
    resource_label: opts.resource ?? null,
    server_message: opts.message ?? null,
  };
  notify();
}

export function show_storage_full_upgrade(opts?: { message?: string | null }) {
  if (is_on_auth_route()) return;
  current = {
    is_open: true,
    reason: "storage_full",
    limit_key: "generic",
    feature_key: null,
    resource_label: null,
    server_message: opts?.message ?? null,
  };
  notify();
}

export function close_upgrade_modal() {
  if (!current.is_open) return;
  current = { ...current, is_open: false };
  notify();
}

export function use_upgrade_state(): UpgradeState {
  return useSyncExternalStore(
    subscribe,
    get_upgrade_snapshot,
    get_upgrade_snapshot,
  );
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__trigger_upgrade = (
    resource?: string,
  ) => show_plan_limit_upgrade({ resource: resource ?? "aliases" });
  (window as unknown as Record<string, unknown>).__trigger_storage_full = () =>
    show_storage_full_upgrade({});
}
