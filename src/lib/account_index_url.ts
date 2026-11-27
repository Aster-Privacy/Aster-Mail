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
import { has_tauri_runtime } from "@/lib/tauri_runtime";

const ACCOUNT_PREFIX_PATTERN = /^\/u\/(\d{1,9})(?=\/|$)/;
const MAX_ACCOUNT_INDEX = 31;

const PUBLIC_ENTRY_PATHS = [
  "/sign-in",
  "/register",
  "/signup",
  "/invite",
  "/forgot-password",
  "/guard/veto",
  "/cancel",
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

const SIGNED_IN_ENTRY_PATHS = ["/join", "/family", "/link-device"];

let active_account_index: number | null = null;

export function account_index_routing_enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (has_tauri_runtime()) return false;

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

export function is_signed_in_entry_path(pathname: string): boolean {
  return SIGNED_IN_ENTRY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function get_active_account_index(): number | null {
  return active_account_index;
}

export function account_index_path(index: number, pathname: string): string {
  return `/u/${index}${strip_account_prefix(pathname)}`;
}

export function resolve_account_basename(): string {
  if (!account_index_routing_enabled()) {
    active_account_index = null;

    return "";
  }

  const pathname = window.location.pathname;
  const raw = ACCOUNT_PREFIX_PATTERN.exec(pathname);

  if (raw) {
    const index = Number(raw[1]);
    const canonical = `/u/${index}`;

    active_account_index = index;

    if (raw[0] === canonical) return raw[0];

    try {
      window.history.replaceState(
        window.history.state,
        "",
        `${canonical}${pathname.slice(raw[0].length)}${window.location.search}${window.location.hash}`,
      );
    } catch {
      return raw[0];
    }

    return canonical;
  }

  active_account_index = 0;

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${account_index_path(0, pathname)}${window.location.search}${window.location.hash}`,
    );
  } catch {
    active_account_index = null;

    return "";
  }

  return "/u/0";
}

export function account_index_url(index: number): string {
  return `/u/${index}/`;
}

export function redirect_to_account_index(index: number): void {
  window.location.replace(
    `${account_index_path(index, window.location.pathname)}${window.location.search}${window.location.hash}`,
  );
}
