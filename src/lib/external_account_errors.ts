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
export const GOOGLE_APP_PASSWORD_URL = "https://myaccount.google.com/apppasswords";
export const GOOGLE_TWO_STEP_URL =
  "https://myaccount.google.com/signinoptions/two-step-verification";

const EXPLICIT_APP_PASSWORD_PATTERNS = [
  "application-specific password",
  "application specific password",
  "app-specific password",
  "app password",
  "invalidsecondfactor",
  "invalid second factor",
  "web login required",
  "please log in via your web browser",
  "webalert",
];

const GENERIC_AUTH_PATTERNS = [
  "authenticationfailed",
  "authentication failed",
  "invalid credentials",
  "username and password not accepted",
  "[auth]",
];

const GOOGLE_MARKERS = [
  "gmail.com",
  "googlemail.com",
  "google.com",
  "gsuite",
  "workspace",
];

interface AppPasswordErrorTarget {
  email?: string | null;
  host?: string | null;
  protocol?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

export function is_google_mail_target(target: AppPasswordErrorTarget): boolean {
  if (normalize(target.protocol).includes("oauth")) {
    return false;
  }

  const haystack = `${normalize(target.email)} ${normalize(target.host)}`;

  return GOOGLE_MARKERS.some((marker) => haystack.includes(marker));
}

export function is_app_password_error(
  message: string | null | undefined,
  target: AppPasswordErrorTarget = {},
): boolean {
  const text = normalize(message);

  if (EXPLICIT_APP_PASSWORD_PATTERNS.some((pattern) => text.includes(pattern))) {
    return true;
  }

  if (!is_google_mail_target(target)) {
    return false;
  }

  return GENERIC_AUTH_PATTERNS.some((pattern) => text.includes(pattern));
}

interface AppPasswordNoticeAccount extends AppPasswordErrorTarget {
  last_sync_error?: string | null;
}

export function needs_app_password_notice(
  account: AppPasswordNoticeAccount,
): boolean {
  if (is_app_password_error(account.last_sync_error, account)) {
    return true;
  }

  return is_google_mail_target(account);
}
