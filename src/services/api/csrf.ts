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
const CSRF_COOKIE_NAME = "csrf_token";

let cached_csrf_token: string | null = null;

export function set_csrf_token(token: string): void {
  cached_csrf_token = token;
}

export function get_csrf_token_from_cookie(): string | null {
  if (typeof document === "undefined") {
    return cached_csrf_token;
  }

  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq_index = trimmed.indexOf("=");

    if (eq_index <= 0) continue;

    const name = trimmed.substring(0, eq_index);
    const value = trimmed.substring(eq_index + 1);

    if (name === CSRF_COOKIE_NAME && value) {
      cached_csrf_token = decodeURIComponent(value);

      return cached_csrf_token;
    }
  }

  return cached_csrf_token;
}

export function clear_csrf_cache(): void {
  cached_csrf_token = null;
}

export function has_csrf_token(): boolean {
  return get_csrf_token_from_cookie() !== null;
}

export function is_state_changing_method(method: string): boolean {
  const state_changing_methods = ["POST", "PUT", "PATCH", "DELETE"];

  return state_changing_methods.includes(method.toUpperCase());
}
