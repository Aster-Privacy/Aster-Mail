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

export const VAULT_SALT_BYTES = 16;
export const MAX_REMEMBERED_VAULT_SALTS = 32;
export const AUTH_SALT_COLLISION_TRANSLATION_KEY = "errors.auth_salt_collision";

const REMEMBERED_VAULT_SALTS_KEY = "aster:auth_salt_guard:vault_salts";

const auth_salts_used_this_session = new Set<string>();

let remembered_vault_salts_cache: string[] | null = null;

export class AuthSaltCollisionError extends Error {
  readonly translation_key = AUTH_SALT_COLLISION_TRANSLATION_KEY;

  constructor() {
    super("auth_salt_collision");
    this.name = "AuthSaltCollisionError";
  }
}

export function is_auth_salt_collision(
  error: unknown,
): error is AuthSaltCollisionError {
  return (
    error instanceof AuthSaltCollisionError ||
    (error instanceof Error && error.message === "auth_salt_collision")
  );
}

export function constant_time_equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

export function vault_salt_prefix(
  vault_bytes: Uint8Array | null | undefined,
): Uint8Array | null {
  if (!vault_bytes || vault_bytes.length <= VAULT_SALT_BYTES) {
    return null;
  }

  return vault_bytes.slice(0, VAULT_SALT_BYTES);
}

export function collides_with_vault_salt(
  auth_salt: Uint8Array,
  vault_bytes: Uint8Array | null | undefined,
): boolean {
  const prefix = vault_salt_prefix(vault_bytes);

  if (!prefix) {
    return false;
  }

  return constant_time_equals(auth_salt, prefix);
}

export function collides_with_remembered_salts(
  auth_salt: Uint8Array,
  remembered: readonly string[],
): boolean {
  let collision = false;

  for (const entry of remembered) {
    let bytes: Uint8Array;

    try {
      bytes = base64_to_array(entry);
    } catch {
      continue;
    }

    if (constant_time_equals(auth_salt, bytes)) {
      collision = true;
    }
  }

  return collision;
}

export function remember_salt_entry(
  remembered: readonly string[],
  salt: Uint8Array,
  limit = MAX_REMEMBERED_VAULT_SALTS,
): string[] {
  const encoded = array_to_base64(salt);
  const without = remembered.filter((entry) => entry !== encoded);

  without.push(encoded);

  return without.slice(Math.max(0, without.length - limit));
}

function has_local_storage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

async function load_remembered_vault_salts(): Promise<string[]> {
  if (remembered_vault_salts_cache) {
    return remembered_vault_salts_cache;
  }

  if (!has_local_storage()) {
    return [];
  }

  try {
    if (localStorage.getItem(REMEMBERED_VAULT_SALTS_KEY) === null) {
      return [];
    }

    const { device_retrieve } = await import("./secure_storage");
    const stored = await device_retrieve<unknown>(REMEMBERED_VAULT_SALTS_KEY);
    const entries = Array.isArray(stored)
      ? stored.filter((entry): entry is string => typeof entry === "string")
      : [];

    remembered_vault_salts_cache = entries;

    return entries;
  } catch {
    return [];
  }
}

function save_remembered_vault_salts(entries: string[]): void {
  remembered_vault_salts_cache = entries;

  if (!has_local_storage()) {
    return;
  }

  void import("./secure_storage")
    .then(({ device_store }) =>
      device_store(REMEMBERED_VAULT_SALTS_KEY, entries),
    )
    .catch(() => undefined);
}

export function note_auth_salt_used(auth_salt: Uint8Array): void {
  auth_salts_used_this_session.add(array_to_base64(auth_salt));
}

export function clear_auth_salt_session_state(): void {
  auth_salts_used_this_session.clear();
  remembered_vault_salts_cache = null;
}

export async function require_usable_auth_salt(
  auth_salt: Uint8Array,
): Promise<void> {
  const remembered = await load_remembered_vault_salts();

  if (collides_with_remembered_salts(auth_salt, remembered)) {
    throw new AuthSaltCollisionError();
  }

  note_auth_salt_used(auth_salt);
}

export async function assert_vault_salt_not_auth_salt(
  vault_bytes: Uint8Array,
): Promise<void> {
  const prefix = vault_salt_prefix(vault_bytes);

  if (!prefix) {
    return;
  }

  if (auth_salts_used_this_session.has(array_to_base64(prefix))) {
    throw new AuthSaltCollisionError();
  }

  const remembered = await load_remembered_vault_salts();
  const updated = remember_salt_entry(remembered, prefix);

  if (
    updated.length !== remembered.length ||
    updated[updated.length - 1] !== remembered[remembered.length - 1]
  ) {
    save_remembered_vault_salts(updated);
  }
}
