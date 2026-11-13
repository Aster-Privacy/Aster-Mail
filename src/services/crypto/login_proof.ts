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
  AuthSaltCollisionError,
  LegacyLoginSaltError,
  constant_time_equals,
  generate_auth_salt,
  type LegacyLoginSaltContext,
} from "./auth_salt_guard";
import { array_to_base64, base64_to_array } from "./base64";
import { derive_password_hash, hash_email } from "./key_manager";
import {
  clear_pending_login_v3,
  enroll_login_v3,
  read_login_v3_flag,
  set_pending_login_v3,
} from "./login_v3";

import { api_client } from "@/services/api/client";

export type KdfVersion = 1 | 2;

const PINNED_ACCOUNTS_KEY = "aster:login_v2_accounts";
const MAX_PINNED_ACCOUNTS = 64;
const LOGIN_SALT_RECORDS_KEY = "aster:login_salt_records";
const MAX_LOGIN_SALT_RECORDS = 64;
const KNOWN_LOGIN_ACCOUNTS_KEY = "aster:login_known_accounts";
const MAX_KNOWN_LOGIN_ACCOUNTS = 64;

export const MIN_V1_LOGIN_SALT_BYTES = 32;

export function read_kdf_version(value: unknown): KdfVersion {
  return value === 2 ? 2 : 1;
}

export function user_hash_pin_key(user_hash: string): string {
  return `h:${user_hash}`;
}

export function user_id_pin_key(user_id: string): string {
  return `u:${user_id}`;
}

function read_pinned_accounts(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_ACCOUNTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function is_account_pinned(pin_keys: readonly string[]): boolean {
  if (pin_keys.length === 0) {
    return false;
  }

  const pinned = read_pinned_accounts();

  return pin_keys.some((key) => pinned.includes(key));
}

export function pin_accounts(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  const pinned = read_pinned_accounts();
  const merged = pinned.filter((entry) => !pin_keys.includes(entry));

  merged.push(...pin_keys);

  try {
    localStorage.setItem(
      PINNED_ACCOUNTS_KEY,
      JSON.stringify(
        merged.slice(Math.max(0, merged.length - MAX_PINNED_ACCOUNTS)),
      ),
    );
  } catch {
    return;
  }
}

export function unpin_accounts(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  const remaining = read_pinned_accounts().filter(
    (entry) => !pin_keys.includes(entry),
  );

  try {
    localStorage.setItem(PINNED_ACCOUNTS_KEY, JSON.stringify(remaining));
  } catch {
    return;
  }
}

export function v1_proofs_allowed(pin_keys: readonly string[]): boolean {
  return !is_account_pinned(pin_keys);
}

interface LoginSaltRecord {
  key: string;
  salt: string;
}

function read_login_salt_records(): LoginSaltRecord[] {
  try {
    const raw = localStorage.getItem(LOGIN_SALT_RECORDS_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is LoginSaltRecord =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LoginSaltRecord).key === "string" &&
        typeof (entry as LoginSaltRecord).salt === "string",
    );
  } catch {
    return [];
  }
}

function write_login_salt_records(records: LoginSaltRecord[]): void {
  try {
    localStorage.setItem(
      LOGIN_SALT_RECORDS_KEY,
      JSON.stringify(
        records.slice(Math.max(0, records.length - MAX_LOGIN_SALT_RECORDS)),
      ),
    );
  } catch {
    return;
  }
}

export function record_login_salt(
  pin_keys: readonly string[],
  salt: Uint8Array,
): void {
  if (pin_keys.length === 0 || salt.length === 0) {
    return;
  }

  const encoded = array_to_base64(salt);
  const kept = read_login_salt_records().filter(
    (entry) => !pin_keys.includes(entry.key),
  );

  kept.push(...pin_keys.map((key) => ({ key, salt: encoded })));
  write_login_salt_records(kept);
}

export function forget_login_salt_records(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  write_login_salt_records(
    read_login_salt_records().filter((entry) => !pin_keys.includes(entry.key)),
  );
}

export type LoginSaltRecordMatch = "match" | "mismatch" | "none";

export function match_login_salt_record(
  pin_keys: readonly string[],
  salt: Uint8Array,
): LoginSaltRecordMatch {
  const records = read_login_salt_records().filter((entry) =>
    pin_keys.includes(entry.key),
  );

  if (records.length === 0) {
    return "none";
  }

  let matched = false;

  for (const entry of records) {
    let recorded: Uint8Array;

    try {
      recorded = base64_to_array(entry.salt);
    } catch {
      continue;
    }

    if (constant_time_equals(recorded, salt)) {
      matched = true;
    }
  }

  return matched ? "match" : "mismatch";
}

function read_known_login_accounts(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_LOGIN_ACCOUNTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry !== "",
    );
  } catch {
    return [];
  }
}

export function remember_known_login_accounts(
  user_hashes: readonly string[],
): void {
  const added = user_hashes.filter((hash) => hash !== "");

  if (added.length === 0) {
    return;
  }

  const kept = read_known_login_accounts().filter(
    (hash) => !added.includes(hash),
  );

  kept.push(...added);

  try {
    localStorage.setItem(
      KNOWN_LOGIN_ACCOUNTS_KEY,
      JSON.stringify(
        kept.slice(Math.max(0, kept.length - MAX_KNOWN_LOGIN_ACCOUNTS)),
      ),
    );
  } catch {
    return;
  }
}

export async function remember_saved_login_accounts(): Promise<void> {
  try {
    const { get_all_accounts } = await import("@/services/account_manager");
    const accounts = await get_all_accounts();
    const hashes: string[] = [];

    for (const account of accounts) {
      const email = account.user?.email;

      if (email) {
        hashes.push(await hash_email(email));
      }
    }

    remember_known_login_accounts(hashes);
  } catch {
    return;
  }
}

async function current_account_user_hash(): Promise<string | undefined> {
  try {
    const { get_current_account } = await import("@/services/account_manager");
    const email = (await get_current_account())?.user?.email;

    return email ? await hash_email(email) : undefined;
  } catch {
    return undefined;
  }
}

async function account_saved_on_device(user_hash: string): Promise<boolean> {
  if (!user_hash) {
    return false;
  }

  if (read_known_login_accounts().includes(user_hash)) {
    return true;
  }

  try {
    const { get_all_accounts } = await import("@/services/account_manager");
    const accounts = await get_all_accounts();

    for (const account of accounts) {
      const email = account.user?.email;

      if (email && (await hash_email(email)) === user_hash) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export interface LoginSaltGuardOptions {
  context: LegacyLoginSaltContext;
  user_hash?: string;
}

export function is_short_login_salt(salt: Uint8Array): boolean {
  return salt.length < MIN_V1_LOGIN_SALT_BYTES;
}

async function assert_v1_login_salt_trusted(
  salt: Uint8Array,
  pin_keys: readonly string[],
  options: LoginSaltGuardOptions,
): Promise<void> {
  if (!is_short_login_salt(salt)) {
    return;
  }

  const record = match_login_salt_record(pin_keys, salt);

  if (record === "match") {
    return;
  }

  if (
    record === "none" &&
    options.user_hash &&
    (await account_saved_on_device(options.user_hash))
  ) {
    if (options.context === "step_up") {
      record_login_salt(pin_keys, salt);
    }

    return;
  }

  throw new LegacyLoginSaltError(options.context);
}

export interface AccountProof {
  password_hash: string;
  kdf_version: KdfVersion;
  hash_v1?: string;
  hash_v2: string;
  v1_proof: string;
}

export interface LoginV3Signals {
  login_v3?: unknown;
  login_v3_enroll?: unknown;
}

export async function derive_account_proof(
  password: string,
  salt: Uint8Array,
  kdf_version: KdfVersion,
  pin_keys: readonly string[],
  guard: LoginSaltGuardOptions = { context: "step_up" },
): Promise<AccountProof> {
  if (kdf_version === 1 && !v1_proofs_allowed(pin_keys)) {
    throw new AuthSaltCollisionError();
  }

  if (kdf_version === 1) {
    await assert_v1_login_salt_trusted(salt, pin_keys, guard);
  }

  const { hash, hash_v2 } = await derive_password_hash(password, salt);

  if (kdf_version === 2) {
    return { password_hash: hash_v2, kdf_version: 2, hash_v2, v1_proof: hash };
  }

  return {
    password_hash: hash,
    kdf_version: 1,
    hash_v1: hash,
    hash_v2,
    v1_proof: hash,
  };
}

export async function enroll_login_v2(
  proof: AccountProof,
  pin_keys: readonly string[],
): Promise<boolean> {
  if (proof.kdf_version === 2) {
    pin_accounts(pin_keys);

    return true;
  }

  if (!proof.hash_v1) {
    return false;
  }

  try {
    const response = await api_client.post<{ kdf_version?: number }>(
      "/core/v1/auth/me/password-v2",
      { password_hash: proof.hash_v1, password_hash_v2: proof.hash_v2 },
    );

    if (response.data && read_kdf_version(response.data.kdf_version) === 2) {
      pin_accounts(pin_keys);

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

interface LoginSaltRotation {
  new_salt: Uint8Array;
  hash: string;
  hash_v2: string;
}

async function prepare_login_salt_rotation(
  password: string,
): Promise<LoginSaltRotation | null> {
  try {
    const new_salt = generate_auth_salt();
    const { hash, hash_v2 } = await derive_password_hash(password, new_salt);

    return { new_salt, hash, hash_v2 };
  } catch {
    return null;
  }
}

async function rotate_login_salt(
  proof: AccountProof,
  rotation: LoginSaltRotation,
  pin_keys: readonly string[],
): Promise<boolean> {
  if (proof.kdf_version !== 1 || !proof.hash_v1) {
    return false;
  }

  try {
    const response = await api_client.post<{ kdf_version?: number }>(
      "/core/v1/auth/me/login-salt",
      {
        password_hash: proof.hash_v1,
        new_password_salt: array_to_base64(rotation.new_salt),
        new_password_hash: rotation.hash,
        new_password_hash_v2: rotation.hash_v2,
      },
    );

    if (response.data && read_kdf_version(response.data.kdf_version) === 2) {
      pin_accounts(pin_keys);
      record_login_salt(pin_keys, rotation.new_salt);

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function current_account_pin_keys(): Promise<string[]> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");
    const user_id = await get_current_account_id();

    return user_id ? [user_id_pin_key(user_id)] : [];
  } catch {
    return [];
  }
}

export async function derive_current_account_proof(
  password: string,
  salt: Uint8Array,
  kdf_version: KdfVersion,
  extra_pin_keys: readonly string[] = [],
): Promise<string> {
  const pin_keys = [...(await current_account_pin_keys()), ...extra_pin_keys];
  const proof = await derive_account_proof(
    password,
    salt,
    kdf_version,
    pin_keys,
    { context: "step_up", user_hash: await current_account_user_hash() },
  );

  if (proof.kdf_version === 2) {
    pin_accounts(pin_keys);
  }

  return proof.password_hash;
}

export async function record_current_account_login_salt(
  salt: Uint8Array,
): Promise<void> {
  const user_hash = await current_account_user_hash();

  record_login_salt(
    [
      ...(await current_account_pin_keys()),
      ...(user_hash ? [user_hash_pin_key(user_hash)] : []),
    ],
    salt,
  );
}

interface SessionSaltResponse {
  salt?: string;
}

export async function seed_session_login_salt(
  user_id: string,
  email: string,
): Promise<void> {
  if (!user_id || !email) {
    return;
  }

  const pin_keys = [
    user_id_pin_key(user_id),
    user_hash_pin_key(await hash_email(email)),
  ];
  const recorded = new Set(
    read_login_salt_records()
      .map((entry) => entry.key)
      .filter((key) => pin_keys.includes(key)),
  );
  const missing = pin_keys.filter((key) => !recorded.has(key));

  if (missing.length === 0) {
    return;
  }

  try {
    const response = await api_client.get<SessionSaltResponse>(
      "/crypto/v1/encryption/salt",
      { skip_cache: true },
    );

    if (response.error || !response.data?.salt) {
      return;
    }

    const salt = base64_to_array(response.data.salt);
    const { get_current_account_id } =
      await import("@/services/account_manager");

    if ((await get_current_account_id()) !== user_id) {
      return;
    }

    const still_missing = missing.filter(
      (key) => match_login_salt_record([key], salt) === "none",
    );

    record_login_salt(still_missing, salt);
  } catch {
    return;
  }
}

const PENDING_ENROLLMENT_TTL_MS = 15 * 60 * 1000;

let pending_login_enrollment: {
  proof: AccountProof;
  pin_keys: string[];
  salt: Uint8Array | null;
  rotation: Promise<LoginSaltRotation | null> | null;
  enroll_v3: boolean;
  created_at: number;
} | null = null;

export function set_pending_login_enrollment(
  proof: AccountProof,
  pin_keys: readonly string[],
  salt: Uint8Array | null = null,
  rotation: Promise<LoginSaltRotation | null> | null = null,
  enroll_v3 = false,
): void {
  pending_login_enrollment = {
    proof,
    pin_keys: [...pin_keys],
    salt,
    rotation,
    enroll_v3,
    created_at: Date.now(),
  };
}

export function clear_pending_login_enrollment(): void {
  pending_login_enrollment = null;
  clear_pending_login_v3();
}

export async function flush_pending_login_enrollment(
  user_id: string,
): Promise<boolean> {
  const pending = pending_login_enrollment;

  pending_login_enrollment = null;

  if (!pending || Date.now() - pending.created_at > PENDING_ENROLLMENT_TTL_MS) {
    return false;
  }

  const pin_keys = [...pending.pin_keys, user_id_pin_key(user_id)];

  if (pending.salt) {
    record_login_salt(pin_keys, pending.salt);
  }

  let rotated: LoginSaltRotation | null = null;

  if (pending.rotation) {
    const rotation = await pending.rotation;

    if (
      rotation &&
      (await rotate_login_salt(pending.proof, rotation, pin_keys))
    ) {
      rotated = rotation;
    }
  }

  const enrolled = rotated
    ? true
    : await enroll_login_v2(pending.proof, pin_keys);

  if (pending.enroll_v3) {
    await enroll_login_v3(
      rotated ? rotated.hash : pending.proof.v1_proof,
      rotated ? rotated.hash_v2 : pending.proof.password_hash,
    );
  }

  return enrolled;
}

export async function derive_sign_in_proof(
  password: string,
  salt: Uint8Array,
  kdf_version_value: unknown,
  user_hash: string,
  signals: LoginV3Signals = {},
): Promise<string> {
  const pin_keys = [user_hash_pin_key(user_hash)];
  const proof = await derive_account_proof(
    password,
    salt,
    read_kdf_version(kdf_version_value),
    pin_keys,
    { context: "sign_in", user_hash },
  );
  const rotation =
    proof.kdf_version === 1 && is_short_login_salt(salt)
      ? prepare_login_salt_rotation(password)
      : null;

  const has_login_v3 = read_login_v3_flag(signals.login_v3);

  set_pending_login_enrollment(
    proof,
    pin_keys,
    salt,
    rotation,
    !has_login_v3 && read_login_v3_flag(signals.login_v3_enroll),
  );

  if (has_login_v3) {
    set_pending_login_v3(user_hash, proof.v1_proof);
  } else {
    clear_pending_login_v3();
  }

  return proof.password_hash;
}
