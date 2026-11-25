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
  IncorrectCurrentPasswordError,
  LOGIN_SALT_RECORDS_KEY,
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
import { stored_login_key } from "./login_record_keys";
import {
  read_session_login_salt,
  store_session_login_salt,
} from "./session_login_salt";

import { api_client } from "@/services/api/client";

export type KdfVersion = 1 | 2;

const PINNED_ACCOUNTS_KEY = "aster:login_v2_accounts";
const MAX_PINNED_ACCOUNTS = 64;
const MAX_LOGIN_SALT_RECORDS = 64;
const RETIRED_KNOWN_LOGIN_ACCOUNTS_KEY = "aster:login_known_accounts";

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

function stored_keys(lookup_keys: readonly string[]): string[] {
  return lookup_keys.map((key) => stored_login_key(key));
}

function read_string_list(storage_key: string): string[] {
  try {
    const raw = localStorage.getItem(storage_key);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is string => typeof entry === "string" && entry !== "",
        )
      : [];
  } catch {
    return [];
  }
}

function read_converted_list(
  storage_key: string,
  convert: (entry: string) => string,
): string[] {
  const entries = read_string_list(storage_key);
  const converted = [...new Set(entries.map(convert))];

  if (
    converted.length !== entries.length ||
    converted.some((entry, index) => entry !== entries[index])
  ) {
    try {
      localStorage.setItem(storage_key, JSON.stringify(converted));
    } catch {
      return converted;
    }
  }

  return converted;
}

function read_pinned_accounts(): string[] {
  return read_converted_list(PINNED_ACCOUNTS_KEY, stored_login_key);
}

export function is_account_pinned(pin_keys: readonly string[]): boolean {
  if (pin_keys.length === 0) {
    return false;
  }

  const pinned = read_pinned_accounts();

  return stored_keys(pin_keys).some((key) => pinned.includes(key));
}

export function pin_accounts(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  const pinned = read_pinned_accounts();
  const added = [...new Set(stored_keys(pin_keys))];
  const merged = pinned.filter((entry) => !added.includes(entry));

  merged.push(...added);

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

  const removed = stored_keys(pin_keys);
  const remaining = read_pinned_accounts().filter(
    (entry) => !removed.includes(entry),
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

    const records = parsed.filter(
      (entry): entry is LoginSaltRecord =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LoginSaltRecord).key === "string" &&
        typeof (entry as LoginSaltRecord).salt === "string",
    );
    const seen = new Set<string>();
    const converted: LoginSaltRecord[] = [];
    let changed = false;

    for (const entry of records) {
      const key = stored_login_key(entry.key);
      const identity = `${key} ${entry.salt}`;

      if (key !== entry.key) {
        changed = true;
      }

      if (seen.has(identity)) {
        changed = true;
        continue;
      }

      seen.add(identity);
      converted.push({ key, salt: entry.salt });
    }

    if (changed) {
      write_login_salt_records(converted);
    }

    return converted;
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
  const added = [...new Set(stored_keys(pin_keys))];
  const kept = read_login_salt_records().filter(
    (entry) => !added.includes(entry.key),
  );

  kept.push(...added.map((key) => ({ key, salt: encoded })));
  write_login_salt_records(kept);
}

export function forget_login_salt_records(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  const removed = stored_keys(pin_keys);

  write_login_salt_records(
    read_login_salt_records().filter((entry) => !removed.includes(entry.key)),
  );
}

export type LoginSaltRecordMatch = "match" | "mismatch" | "none";

export function recorded_login_salts(pin_keys: readonly string[]): string[] {
  const wanted = stored_keys(pin_keys);
  const salts: string[] = [];

  for (const entry of read_login_salt_records()) {
    if (wanted.includes(entry.key) && !salts.includes(entry.salt)) {
      salts.push(entry.salt);
    }
  }

  return salts;
}

export function match_login_salt_record(
  pin_keys: readonly string[],
  salt: Uint8Array,
): LoginSaltRecordMatch {
  const wanted = stored_keys(pin_keys);
  const records = read_login_salt_records().filter((entry) =>
    wanted.includes(entry.key),
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

export function convert_stored_login_records(): void {
  read_pinned_accounts();
  read_login_salt_records();

  try {
    localStorage.removeItem(RETIRED_KNOWN_LOGIN_ACCOUNTS_KEY);
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

export interface LoginSaltGuardOptions {
  context: LegacyLoginSaltContext;
  record_keys?: readonly string[];
}

export function is_short_login_salt(salt: Uint8Array): boolean {
  return salt.length < MIN_V1_LOGIN_SALT_BYTES;
}

function assert_v1_login_salt_trusted(
  salt: Uint8Array,
  pin_keys: readonly string[],
  options: LoginSaltGuardOptions,
): void {
  if (!is_short_login_salt(salt)) {
    return;
  }

  const record_keys = [...pin_keys, ...(options.record_keys ?? [])];

  if (match_login_salt_record(record_keys, salt) === "match") {
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
    assert_v1_login_salt_trusted(salt, pin_keys, guard);
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
  hash_v2: string;
  v1_proof: string;
}

async function prepare_login_salt_rotation(
  password: string,
): Promise<LoginSaltRotation | null> {
  try {
    const new_salt = generate_auth_salt();
    const { hash, hash_v2 } = await derive_password_hash(password, new_salt);

    return { new_salt, hash_v2, v1_proof: hash };
  } catch {
    return null;
  }
}

function pinned_user_hash(pin_keys: readonly string[]): string | undefined {
  const prefix = user_hash_pin_key("");

  return pin_keys
    .find((key) => key.startsWith(prefix) && key.length > prefix.length)
    ?.slice(prefix.length);
}

const LOST_REPLY_CODES = new Set([
  "NETWORK_ERROR",
  "TIMEOUT_ERROR",
  "SERVER_ERROR",
]);

function response_may_be_lost(response: {
  status?: number;
  code?: string;
}): boolean {
  return (
    (typeof response.status === "number" && response.status >= 500) ||
    (typeof response.code === "string" && LOST_REPLY_CODES.has(response.code))
  );
}

function thrown_reply_may_be_lost(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

async function server_kept_rotated_salt(
  user_hash: string | undefined,
  new_salt: Uint8Array,
): Promise<boolean> {
  if (!user_hash) {
    return false;
  }

  try {
    const response = await api_client.post<{
      salt?: unknown;
      kdf_version?: unknown;
    }>("/core/v1/auth/salt", { user_hash });
    const encoded = response.data?.salt;

    if (
      typeof encoded !== "string" ||
      read_kdf_version(response.data?.kdf_version) !== 2
    ) {
      return false;
    }

    return constant_time_equals(base64_to_array(encoded), new_salt);
  } catch {
    return false;
  }
}

async function rotate_login_salt(
  proof: AccountProof,
  rotation: LoginSaltRotation,
  pin_keys: readonly string[],
  account_id: string,
): Promise<boolean> {
  if (proof.kdf_version !== 1 || !proof.hash_v1) {
    return false;
  }

  let rotated = false;
  let reply_lost = false;

  try {
    const response = await api_client.post<{ kdf_version?: number }>(
      "/core/v1/auth/me/login-salt",
      {
        password_hash: proof.hash_v1,
        new_password_salt: array_to_base64(rotation.new_salt),
        new_password_hash_v2: rotation.hash_v2,
      },
    );

    rotated = Boolean(
      response.data && read_kdf_version(response.data.kdf_version) === 2,
    );
    reply_lost = !rotated && response_may_be_lost(response);
  } catch (error) {
    reply_lost = thrown_reply_may_be_lost(error);
  }

  if (!rotated && reply_lost) {
    rotated = await server_kept_rotated_salt(
      pinned_user_hash(pin_keys),
      rotation.new_salt,
    );
  }

  if (!rotated) {
    return false;
  }

  pin_accounts(pin_keys);
  record_login_salt(pin_keys, rotation.new_salt);
  store_session_login_salt(account_id, rotation.new_salt);

  return true;
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
  await seed_login_salt_record_from_session();

  const pin_keys = [...(await current_account_pin_keys()), ...extra_pin_keys];
  const record_keys = await current_account_record_keys();

  await refuse_unrecorded_short_salt(
    password,
    salt,
    kdf_version,
    pin_keys,
    record_keys,
  );

  const proof = await derive_account_proof(
    password,
    salt,
    kdf_version,
    pin_keys,
    { context: "step_up", record_keys },
  );

  if (proof.kdf_version === 2) {
    pin_accounts(pin_keys);
  }

  return proof.password_hash;
}

type SessionPasswordCheck = "match" | "mismatch" | "unavailable";

async function check_session_password(
  password: string,
): Promise<SessionPasswordCheck> {
  try {
    const { has_passphrase_in_memory, verify_passphrase_for_export } =
      await import("./memory_key_store");

    if (!has_passphrase_in_memory()) {
      return "unavailable";
    }

    return (await verify_passphrase_for_export(password))
      ? "match"
      : "mismatch";
  } catch {
    return "unavailable";
  }
}

async function refuse_unrecorded_short_salt(
  password: string,
  salt: Uint8Array,
  kdf_version: KdfVersion,
  pin_keys: readonly string[],
  record_keys: readonly string[],
): Promise<void> {
  if (kdf_version !== 1 || !is_short_login_salt(salt)) {
    return;
  }

  if (!v1_proofs_allowed(pin_keys)) {
    return;
  }

  if (
    match_login_salt_record([...pin_keys, ...record_keys], salt) === "match"
  ) {
    return;
  }

  if ((await check_session_password(password)) === "mismatch") {
    throw new IncorrectCurrentPasswordError();
  }

  throw new LegacyLoginSaltError("step_up");
}

async function current_account_record_keys(): Promise<string[]> {
  const user_hash = await current_account_user_hash();

  return [
    ...(await current_account_pin_keys()),
    ...(user_hash ? [user_hash_pin_key(user_hash)] : []),
  ];
}

export async function record_current_account_login_salt(
  salt: Uint8Array,
): Promise<void> {
  record_login_salt(await current_account_record_keys(), salt);

  const user_id = await current_account_id();

  if (user_id) {
    store_session_login_salt(user_id, salt);
  }
}

async function current_account_id(): Promise<string | null> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return (await get_current_account_id()) ?? null;
  } catch {
    return null;
  }
}

export async function seed_login_salt_record_from_session(): Promise<void> {
  const user_id = await current_account_id();

  if (!user_id) {
    return;
  }

  const salt = read_session_login_salt(user_id);

  if (!salt) {
    return;
  }

  const record_keys = await current_account_record_keys();

  if (match_login_salt_record(record_keys, salt) !== "none") {
    return;
  }

  record_login_salt(record_keys, salt);
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
    const salt_trusted =
      !is_short_login_salt(pending.salt) ||
      match_login_salt_record(pin_keys, pending.salt) === "match";

    record_login_salt(pin_keys, pending.salt);

    if (salt_trusted) {
      store_session_login_salt(user_id, pending.salt);
    }
  }

  let rotated: LoginSaltRotation | null = null;

  if (pending.rotation) {
    const rotation = await pending.rotation;

    if (
      rotation &&
      (await rotate_login_salt(pending.proof, rotation, pin_keys, user_id))
    ) {
      rotated = rotation;
    }
  }

  const enrolled = rotated
    ? true
    : await enroll_login_v2(pending.proof, pin_keys);

  if (pending.enroll_v3) {
    await enroll_login_v3(
      rotated ? rotated.v1_proof : pending.proof.v1_proof,
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
  convert_stored_login_records();

  const has_login_v3 = read_login_v3_flag(signals.login_v3);

  const pin_keys = [user_hash_pin_key(user_hash)];
  const proof = await derive_account_proof(
    password,
    salt,
    read_kdf_version(kdf_version_value),
    pin_keys,
    { context: "sign_in" },
  );
  const rotation =
    proof.kdf_version === 1 && is_short_login_salt(salt)
      ? prepare_login_salt_rotation(password)
      : null;

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
