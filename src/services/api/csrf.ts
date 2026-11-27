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
let cookie_seen_in_document = false;

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

const csrf_waiters = new Set<() => void>();

export const CSRF_WAIT_POLL_MS = 100;

export function set_csrf_token(token: string): void {
  remember_token(token, false);

  for (const wake of [...csrf_waiters]) wake();
}

export function wait_for_csrf_token(
  timeout_ms: number,
): Promise<string | null> {
  const existing = get_csrf_token_from_cookie();

  if (existing || timeout_ms <= 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let poll: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const finish = (token: string | null): void => {
      csrf_waiters.delete(wake);
      clearInterval(poll);
      clearTimeout(deadline);
      resolve(token);
    };

    const wake = (): void => {
      const token = get_csrf_token_from_cookie();

      if (token) finish(token);
    };

    csrf_waiters.add(wake);
    poll = setInterval(wake, CSRF_WAIT_POLL_MS);
    deadline = setTimeout(
      () => finish(get_csrf_token_from_cookie()),
      timeout_ms,
    );
  });
}

export function get_csrf_token_from_cookie(): string | null {
  if (cached_token_still_valid()) {
    return cached_csrf_token;
  }

  if (cached_csrf_token) clear_csrf_cache();

  if (typeof document === "undefined" || !tab_shares_session_cookies()) {
    return null;
  }

  const value = read_csrf_cookie();

  if (!value) return null;

  remember_token(value, true);

  return cached_csrf_token;
}

function read_csrf_cookie(): string | null {
  if (typeof document === "undefined") return null;

  let cookies: string[];

  try {
    cookies = document.cookie.split(";");
  } catch {
    return null;
  }

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq_index = trimmed.indexOf("=");

    if (eq_index <= 0) continue;

    const name = trimmed.substring(0, eq_index);
    const value = trimmed.substring(eq_index + 1);

    if (name === CSRF_COOKIE_NAME && value) {
      cookie_seen_in_document = true;

      return decodeURIComponent(value);
    }
  }

  return null;
}

export function csrf_cookie_went_missing(): boolean {
  if (!tab_shares_session_cookies()) return false;
  if (read_csrf_cookie() !== null) return false;

  return cookie_seen_in_document;
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
