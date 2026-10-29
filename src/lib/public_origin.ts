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

export const PUBLIC_WEB_APP_ORIGIN = "https://app.astermail.org";

const APP_SHELL_HOSTS = new Set(["tauri.localhost", "asset.localhost"]);

function is_app_shell(): boolean {
  if (typeof window === "undefined") return true;
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) return true;

  return Capacitor.isNativePlatform();
}

export function public_web_origin(): string {
  if (is_app_shell()) return PUBLIC_WEB_APP_ORIGIN;

  return window.location.origin;
}

export function public_web_url(path_or_url: string): string {
  const shell = is_app_shell();
  const base = shell ? PUBLIC_WEB_APP_ORIGIN : window.location.origin;
  const parsed = new URL(path_or_url, base);

  if (!shell) return parsed.href;

  const own_origin =
    typeof window !== "undefined" ? window.location.origin : null;
  const host = parsed.hostname.toLowerCase();

  if (parsed.origin === own_origin || APP_SHELL_HOSTS.has(host)) {
    return `${PUBLIC_WEB_APP_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  return parsed.href;
}
