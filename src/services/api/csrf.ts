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
  get_tab_account_id,
  tab_shares_session_cookies,
} from "@/lib/tab_account";

const CSRF_COOKIE_NAME = "csrf_token";

let cached_csrf_token: string | null = null;
let cached_from_cookie = false;
let cached_for_account: string | null = null;

function remember_token(token: string, from_cookie: boolean): void {
  cached_csrf_token = token;
  cached_from_cookie = from_cookie;
  cached_for_account = get_tab_account_id();
}

function cached_token_still_valid(): boolean {
  if (!cached_csrf_token) return false;

  if (cached_from_cookie && !tab_shares_session_cookies()) return false;

  const bound = get_tab_account_id();

  return !(cached_for_account !== null && bound !== cached_for_account);
}

export function set_csrf_token(token: string): void {
  remember_token(token, false);
}

export function get_csrf_token_from_cookie(): string | null {
  if (cached_token_still_valid()) {
    return cached_csrf_token;
  }

  if (cached_csrf_token) clear_csrf_cache();

  if (typeof document === "undefined" || !tab_shares_session_cookies()) {
    return null;
  }

  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq_index = trimmed.indexOf("=");

    if (eq_index <= 0) continue;

    const name = trimmed.substring(0, eq_index);
    const value = trimmed.substring(eq_index + 1);

    if (name === CSRF_COOKIE_NAME && value) {
      remember_token(decodeURIComponent(value), true);

      return cached_csrf_token;
    }
  }

  return null;
}

export function clear_csrf_cache(): void {
  cached_csrf_token = null;
  cached_from_cookie = false;
  cached_for_account = null;
}

export function has_csrf_token(): boolean {
  return get_csrf_token_from_cookie() !== null;
}

export function is_state_changing_method(method: string): boolean {
  const state_changing_methods = ["POST", "PUT", "PATCH", "DELETE"];

  return state_changing_methods.includes(method.toUpperCase());
}
