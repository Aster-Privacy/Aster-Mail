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
import { array_to_base64, base64_to_array } from "./base64";

import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

const SESSION_LOGIN_SALT_KEY_PREFIX = "astermail_session_login_salt_";

export function store_session_login_salt(
  account_id: string,
  salt: Uint8Array,
): void {
  if (!account_id || salt.length === 0) {
    return;
  }

  safe_local_set(
    SESSION_LOGIN_SALT_KEY_PREFIX + account_id,
    array_to_base64(salt),
  );
}

export function read_session_login_salt(account_id: string): Uint8Array | null {
  if (!account_id) {
    return null;
  }

  const stored = safe_local_get(SESSION_LOGIN_SALT_KEY_PREFIX + account_id);

  if (!stored) {
    return null;
  }

  try {
    const salt = base64_to_array(stored);

    return salt.length > 0 ? salt : null;
  } catch {
    return null;
  }
}

export function clear_session_login_salt(account_id: string): void {
  safe_local_remove(SESSION_LOGIN_SALT_KEY_PREFIX + account_id);
}

export function clear_all_session_login_salts(): void {
  safe_local_keys()
    .filter((key) => key.startsWith(SESSION_LOGIN_SALT_KEY_PREFIX))
    .forEach((key) => safe_local_remove(key));
}
