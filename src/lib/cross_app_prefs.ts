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
export const CROSS_APP_THEME_COOKIE = "aster_theme";
export const CROSS_APP_LANGUAGE_COOKIE = "aster_language";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function is_tauri(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
}

function get_cookie_domain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host.endsWith("astermail.org")) return ".astermail.org";
  if (host === "localhost" || host.endsWith(".localhost")) return "localhost";
  return null;
}

function is_secure_context(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

export function read_cross_app_cookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  if (is_tauri()) return null;
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function write_cross_app_cookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  if (is_tauri()) return;
  const domain = get_cookie_domain();
  if (!domain) return;
  const encoded = encodeURIComponent(value);
  const secure = is_secure_context() ? "; Secure" : "";
  document.cookie = `${name}=${encoded}; Domain=${domain}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
