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
const ACCOUNT_PREFIX_PATTERN = /^\/u\/(\d{1,2})(?=\/|$)/;
const ACCOUNT_INDEX_HINT_KEY = "aster_account_index";
const MAX_ACCOUNT_INDEX = 31;

const PUBLIC_ENTRY_PATHS = [
  "/sign-in",
  "/register",
  "/signup",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/verify-recovery-email",
  "/terms",
  "/privacy",
  "/link-device",
  "/join",
  "/family",
  "/view",
  "/crypto-invoice",
];

let active_account_index: number | null = null;
let pending_url_request: number | null = null;

export function account_index_routing_enabled(): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;

  const capacitor = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;

  return capacitor?.isNativePlatform?.() !== true;
}

export function parse_account_index(pathname: string): number | null {
  const match = ACCOUNT_PREFIX_PATTERN.exec(pathname);

  if (!match) return null;

  const index = Number(match[1]);

  return index > MAX_ACCOUNT_INDEX ? null : index;
}

export function strip_account_prefix(pathname: string): string {
  const stripped = pathname.replace(ACCOUNT_PREFIX_PATTERN, "");

  return stripped === "" ? "/" : stripped;
}

export function app_pathname(): string {
  if (typeof window === "undefined") return "/";

  return strip_account_prefix(window.location.pathname);
}

export function is_public_entry_path(pathname: string): boolean {
  return PUBLIC_ENTRY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function read_account_index_hint(): number {
  try {
    const raw = Number(localStorage.getItem(ACCOUNT_INDEX_HINT_KEY));

    if (!Number.isInteger(raw) || raw < 0 || raw > MAX_ACCOUNT_INDEX) return 0;

    return raw;
  } catch {
    return 0;
  }
}

export function write_account_index_hint(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > MAX_ACCOUNT_INDEX)
    return;

  try {
    localStorage.setItem(ACCOUNT_INDEX_HINT_KEY, String(index));
  } catch {}
}

export function get_active_account_index(): number | null {
  return active_account_index;
}

export function take_url_account_request(): number | null {
  const requested = pending_url_request;

  pending_url_request = null;

  return requested;
}

export function account_index_path(index: number, pathname: string): string {
  return `/u/${index}${strip_account_prefix(pathname)}`;
}

export function resolve_account_basename(): string {
  if (!account_index_routing_enabled()) {
    active_account_index = null;
    pending_url_request = null;

    return "";
  }

  const pathname = window.location.pathname;
  const from_url = parse_account_index(pathname);

  if (from_url !== null) {
    active_account_index = from_url;
    pending_url_request = is_public_entry_path(strip_account_prefix(pathname))
      ? null
      : from_url;

    return `/u/${from_url}`;
  }

  const index = read_account_index_hint();

  active_account_index = index;
  pending_url_request = null;

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${account_index_path(index, window.location.pathname)}${window.location.search}${window.location.hash}`,
    );
  } catch {
    active_account_index = null;

    return "";
  }

  return `/u/${index}`;
}

export function redirect_to_account_index(index: number): void {
  window.location.replace(
    `${account_index_path(index, window.location.pathname)}${window.location.search}${window.location.hash}`,
  );
}
