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
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./base64";

export const LOGIN_RECORD_SECRET_KEY = "aster:login_record_secret";

const STORED_KEY_PREFIX = "k1:";
const SECRET_BYTES = 32;

function read_secret(): string | null {
  try {
    return localStorage.getItem(LOGIN_RECORD_SECRET_KEY) || null;
  } catch {
    return null;
  }
}

function create_secret(): string | null {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));

    localStorage.setItem(LOGIN_RECORD_SECRET_KEY, array_to_base64(bytes));
    bytes.fill(0);
  } catch {
    return null;
  }

  return read_secret();
}

export function is_stored_login_key(value: string): boolean {
  return value.startsWith(STORED_KEY_PREFIX);
}

export function stored_login_key(lookup_key: string): string {
  if (is_stored_login_key(lookup_key)) {
    return lookup_key;
  }

  const secret = read_secret() ?? create_secret();

  if (!secret) {
    return lookup_key;
  }

  const encoder = new TextEncoder();
  const digest = hmac(
    sha256,
    encoder.encode(secret),
    encoder.encode(lookup_key),
  );

  return STORED_KEY_PREFIX + array_to_base64(digest);
}
