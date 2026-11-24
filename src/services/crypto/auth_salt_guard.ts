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
export const AUTH_SALT_BYTES = 32;
export const MIN_AUTH_SALT_BYTES = 16;
export const MAX_REMEMBERED_VAULT_SALTS = 32;
export const ENVELOPE_SALT_BYTES = 16;
export const MAX_KNOWN_LOGIN_SALTS = 32;
export const LOGIN_SALT_RECORDS_KEY = "aster:login_salt_records";
export const AUTH_SALT_COLLISION_TRANSLATION_KEY = "errors.auth_salt_collision";
export const LEGACY_LOGIN_SALT_NEW_DEVICE_TRANSLATION_KEY =
  "errors.legacy_login_salt_new_device";
export const INCORRECT_PASSWORD_TRANSLATION_KEY = "errors.incorrect_password";

const REMEMBERED_VAULT_SALTS_KEY = "aster:auth_salt_guard:vault_salts";
const KNOWN_LOGIN_SALTS_KEY = "aster:auth_salt_guard:login_salts";

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

export type LegacyLoginSaltContext = "sign_in" | "step_up";

export class LegacyLoginSaltError extends Error {
  readonly translation_key = LEGACY_LOGIN_SALT_NEW_DEVICE_TRANSLATION_KEY;

  constructor(readonly context: LegacyLoginSaltContext) {
    super(`legacy_login_salt_${context}`);
    this.name = "LegacyLoginSaltError";
  }
}

export class IncorrectCurrentPasswordError extends Error {
  readonly translation_key = INCORRECT_PASSWORD_TRANSLATION_KEY;

  constructor() {
    super("incorrect_current_password");
    this.name = "IncorrectCurrentPasswordError";
  }
}

export function is_legacy_login_salt_error(
  error: unknown,
): error is LegacyLoginSaltError {
  return error instanceof LegacyLoginSaltError;
}

export function login_safety_error_key(
  error: unknown,
):
  | typeof AUTH_SALT_COLLISION_TRANSLATION_KEY
  | typeof LEGACY_LOGIN_SALT_NEW_DEVICE_TRANSLATION_KEY
  | typeof INCORRECT_PASSWORD_TRANSLATION_KEY
  | null {
  if (is_legacy_login_salt_error(error)) {
    return error.translation_key;
  }

  if (error instanceof IncorrectCurrentPasswordError) {
    return error.translation_key;
  }

  if (is_auth_salt_collision(error)) {
    return AUTH_SALT_COLLISION_TRANSLATION_KEY;
  }

  return null;
}

export function generate_auth_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(AUTH_SALT_BYTES));
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
      device_store(
        REMEMBERED_VAULT_SALTS_KEY,
        entries,
        (public_salts) => public_salts,
      ),
    )
    .catch(() => undefined);
}

function read_local_json(key: string): unknown {
  if (!has_local_storage()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function read_known_login_salts(): string[] {
  const parsed = read_local_json(KNOWN_LOGIN_SALTS_KEY);

  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function read_recorded_login_salts(): string[] {
  const parsed = read_local_json(LOGIN_SALT_RECORDS_KEY);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry: unknown) => {
    const salt =
      typeof entry === "object" && entry !== null
        ? (entry as { salt?: unknown }).salt
        : undefined;

    return typeof salt === "string" ? [salt] : [];
  });
}

function remember_known_login_salt(auth_salt: Uint8Array): void {
  if (auth_salt.length !== ENVELOPE_SALT_BYTES || !has_local_storage()) {
    return;
  }

  try {
    localStorage.setItem(
      KNOWN_LOGIN_SALTS_KEY,
      JSON.stringify(
        remember_salt_entry(
          read_known_login_salts(),
          auth_salt,
          MAX_KNOWN_LOGIN_SALTS,
        ),
      ),
    );
  } catch {
    return;
  }
}

export function note_auth_salt_used(auth_salt: Uint8Array): void {
  auth_salts_used_this_session.add(array_to_base64(auth_salt));
  remember_known_login_salt(auth_salt);
}

let stored_login_salts_cache: {
  known_raw: string | null;
  recorded_raw: string | null;
  salts: string[];
} | null = null;

function read_raw(key: string): string | null {
  if (!has_local_storage()) return null;

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function stored_login_salts(): string[] {
  const known_raw = read_raw(KNOWN_LOGIN_SALTS_KEY);
  const recorded_raw = read_raw(LOGIN_SALT_RECORDS_KEY);

  if (
    stored_login_salts_cache &&
    stored_login_salts_cache.known_raw === known_raw &&
    stored_login_salts_cache.recorded_raw === recorded_raw
  ) {
    return stored_login_salts_cache.salts;
  }

  const salts = [...read_known_login_salts(), ...read_recorded_login_salts()];

  stored_login_salts_cache = { known_raw, recorded_raw, salts };

  return salts;
}

export function is_known_login_salt(salt: Uint8Array): boolean {
  if (auth_salts_used_this_session.has(array_to_base64(salt))) {
    return true;
  }

  return collides_with_remembered_salts(salt, stored_login_salts());
}

export function list_known_login_salts(): string[] {
  return [
    ...new Set([...auth_salts_used_this_session, ...stored_login_salts()]),
  ];
}

export function clear_auth_salt_session_state(): void {
  auth_salts_used_this_session.clear();
  remembered_vault_salts_cache = null;
  stored_login_salts_cache = null;
}

export async function require_usable_auth_salt(
  auth_salt: Uint8Array,
): Promise<void> {
  if (auth_salt.length < MIN_AUTH_SALT_BYTES) {
    throw new AuthSaltCollisionError();
  }

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
