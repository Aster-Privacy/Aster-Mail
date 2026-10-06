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
  encrypted_delete,
  encrypted_delete_where,
  encrypted_get,
  encrypted_has,
  encrypted_list_keys,
  encrypted_move,
  encrypted_set,
  encrypted_set_if_absent,
} from "./encrypted_storage";
import {
  get_derived_encryption_key,
  on_keys_ready,
  on_vault_cleared,
} from "./memory_key_store";
import { on_account_keys_added } from "./account_key_events";
import { array_to_base64, base64_to_array } from "./base64";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { ignore_error } from "@/lib/ignore_error";

export const SENDER_HISTORY_PREFIX = "ratchet_sender_identity_history_";
export const IDENTITY_PIN_PREFIX = "ratchet_identity_pin_";
export const IDENTITY_CHANGE_PREFIX = "ratchet_identity_change_";
export const OWNER_KEY_PIN_PREFIX = "ratchet_owner_key_pin_";
export const IDENTITY_UNTRUSTED_PREFIX = "ratchet_identity_untrusted_";
export const RATCHET_STATE_PREFIX = "ratchet_state_";
export const RATCHET_PLAINTEXT_PREFIX = "ratchet_plaintext_";

const SCOPED_PREFIXES: readonly string[] = [
  SENDER_HISTORY_PREFIX,
  IDENTITY_PIN_PREFIX,
  IDENTITY_CHANGE_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  RATCHET_STATE_PREFIX,
  RATCHET_PLAINTEXT_PREFIX,
];

const ACCOUNT_EXACT_KEY_PREFIXES: readonly string[] = [
  "ratchet_conversation_index_",
];

const NAME_KEY_ENTRY = "storage_name_key";
const NAME_KEY_BYTES = 32;
const OPAQUE_MARKER = "h1_";
const OPAQUE_NAME = /^h1_[A-Za-z0-9_-]{43}$/;
const ACCOUNT_SCOPED_BODY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
const SWEEP_YIELD_EVERY = 25;

export class StorageNamesUnavailableError extends Error {
  constructor() {
    super("storage names unavailable");
    this.name = "StorageNamesUnavailableError";
  }
}

const name_keys = new Map<string, Promise<CryptoKey>>();
const swept_accounts = new Set<string>();
let sweep_in_flight: Promise<StorageNameMigrationResult> | null = null;
let sweep_requested = false;
let hooks_armed = false;

function account_slot(uid: string | null): string {
  return uid ?? "";
}

function name_key_entry(uid: string | null): string {
  return uid ? `${NAME_KEY_ENTRY}_${uid}` : NAME_KEY_ENTRY;
}

function unscoped_separator(prefix: string): string {
  return prefix === RATCHET_PLAINTEXT_PREFIX ? "_" : "";
}

function plain_name(prefix: string, uid: string | null, rest: string): string {
  if (!uid) return `${prefix}${unscoped_separator(prefix)}${rest}`;

  return `${prefix}${uid}_${rest}`;
}

function to_base64_url(bytes: Uint8Array): string {
  return array_to_base64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function wrapping_key(): Promise<CryptoKey> {
  const raw = get_derived_encryption_key();

  if (!raw) throw new StorageNamesUnavailableError();

  try {
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    zero_uint8_array(raw);
  }
}

async function import_name_key(encoded: string): Promise<CryptoKey> {
  const raw = base64_to_array(encoded);

  try {
    if (raw.length !== NAME_KEY_BYTES) throw new StorageNamesUnavailableError();

    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } finally {
    zero_uint8_array(raw);
  }
}

async function read_name_key(
  uid: string | null,
  wrap: CryptoKey,
): Promise<CryptoKey | null> {
  const entry = name_key_entry(uid);
  const stored = await encrypted_get<string>(entry, wrap);

  if (typeof stored === "string") return import_name_key(stored);

  if (await encrypted_has(entry)) throw new StorageNamesUnavailableError();

  return null;
}

async function load_or_create_name_key(uid: string | null): Promise<CryptoKey> {
  const wrap = await wrapping_key();
  const existing = await read_name_key(uid, wrap);

  if (existing) return existing;

  let candidate: string | null = null;

  if (uid) {
    const unscoped = await encrypted_get<string>(name_key_entry(null), wrap);

    if (typeof unscoped === "string") candidate = unscoped;
  }

  if (!candidate) {
    const fresh = crypto.getRandomValues(new Uint8Array(NAME_KEY_BYTES));

    candidate = array_to_base64(fresh);
    zero_uint8_array(fresh);
  }

  await encrypted_set_if_absent(name_key_entry(uid), candidate, wrap);

  const settled = await read_name_key(uid, wrap);

  if (!settled) throw new StorageNamesUnavailableError();

  return settled;
}

function arm_hooks(): void {
  if (hooks_armed) return;
  hooks_armed = true;

  try {
    on_vault_cleared(() => {
      name_keys.clear();
      swept_accounts.clear();
    });
    on_keys_ready(() => {
      schedule_storage_name_migration();
    });
    on_account_keys_added(() => {
      schedule_storage_name_migration();
    });
  } catch (caught) {
    ignore_error("services/crypto/storage_key_names:arm_hooks", caught);
  }
}

async function name_key_for(uid: string | null): Promise<CryptoKey> {
  arm_hooks();

  const slot = account_slot(uid);
  const cached = name_keys.get(slot);

  if (cached) return cached;

  const pending = load_or_create_name_key(uid);

  name_keys.set(slot, pending);

  try {
    return await pending;
  } catch (caught) {
    if (name_keys.get(slot) === pending) name_keys.delete(slot);
    throw caught;
  }
}

async function name_tag(
  key: CryptoKey,
  prefix: string,
  rest: string,
): Promise<string> {
  const input = new TextEncoder().encode(`${prefix}\u0000${rest}`);
  const mac = await crypto.subtle.sign("HMAC", key, input);

  return `${OPAQUE_MARKER}${to_base64_url(new Uint8Array(mac))}`;
}

export async function scoped_storage_name(
  prefix: string,
  uid: string | null,
  rest: string,
): Promise<string> {
  const tag = await name_tag(await name_key_for(uid), prefix, rest);

  return uid ? `${prefix}${uid}_${tag}` : `${prefix}${tag}`;
}

async function earlier_names(
  prefix: string,
  uid: string | null,
  rest: string,
  storage_key: CryptoKey,
  include_unscoped: boolean,
): Promise<string[]> {
  const names = [plain_name(prefix, uid, rest)];

  if (!uid || !include_unscoped) return names;

  names.push(plain_name(prefix, null, rest));

  try {
    const stored = await encrypted_get<string>(
      name_key_entry(null),
      storage_key,
    );

    if (typeof stored === "string") {
      const tag = await name_tag(await import_name_key(stored), prefix, rest);

      names.push(`${prefix}${tag}`);
    }
  } catch (caught) {
    ignore_error("services/crypto/storage_key_names:earlier_names", caught);
  }

  return names;
}

export async function scoped_get<T>(
  prefix: string,
  uid: string | null,
  rest: string,
  storage_key: CryptoKey,
  options: { include_unscoped?: boolean } = {},
): Promise<T | null> {
  const name = await scoped_storage_name(prefix, uid, rest);
  const value = await encrypted_get<T>(name, storage_key);

  if (value !== null) return value;
  if (swept_accounts.has(account_slot(uid))) return null;

  const candidates = await earlier_names(
    prefix,
    uid,
    rest,
    storage_key,
    options.include_unscoped !== false,
  );

  for (const candidate of candidates) {
    const outcome = await encrypted_move(candidate, name, storage_key);

    if (outcome === "moved" || outcome === "kept_existing") {
      return encrypted_get<T>(name, storage_key);
    }
  }

  return null;
}

export async function scoped_set(
  prefix: string,
  uid: string | null,
  rest: string,
  value: unknown,
  storage_key: CryptoKey,
): Promise<void> {
  const name = await scoped_storage_name(prefix, uid, rest);

  await encrypted_set(name, value, storage_key);
}

export async function scoped_delete(
  prefix: string,
  uid: string | null,
  rest: string,
  options: { include_unscoped?: boolean } = {},
): Promise<void> {
  await encrypted_delete(plain_name(prefix, uid, rest));

  if (uid && options.include_unscoped) {
    await encrypted_delete(plain_name(prefix, null, rest));
  }

  await encrypted_delete(await scoped_storage_name(prefix, uid, rest));
}

export async function delete_account_storage(uid: string): Promise<number> {
  if (!uid) return 0;

  name_keys.delete(uid);
  swept_accounts.delete(uid);

  const scoped = SCOPED_PREFIXES.map((prefix) => `${prefix}${uid}_`);
  const exact = new Set([
    ...ACCOUNT_EXACT_KEY_PREFIXES.map((prefix) => `${prefix}${uid}`),
    name_key_entry(uid),
  ]);

  return encrypted_delete_where(
    (key) => exact.has(key) || scoped.some((start) => key.startsWith(start)),
  );
}

export async function delete_scoped_entries(
  prefix: string,
  uid: string | null,
): Promise<number> {
  if (!uid) return 0;

  const start = `${prefix}${uid}_`;

  return encrypted_delete_where((key) => key.startsWith(start));
}

export interface StorageNameMigrationResult {
  moved: number;
  unreadable: number;
}

interface PlainEntry {
  key: string;
  prefix: string;
  rest: string;
}

function classify_plain_entry(
  key: string,
  uid: string | null,
  other_account_ids: readonly string[],
): PlainEntry | null {
  const prefix = SCOPED_PREFIXES.find((candidate) => key.startsWith(candidate));

  if (!prefix) return null;

  const body = key.slice(prefix.length);

  if (uid && body.startsWith(`${uid}_`)) {
    const rest = body.slice(uid.length + 1);

    if (OPAQUE_NAME.test(rest)) return null;

    return { key, prefix, rest };
  }

  if (OPAQUE_NAME.test(body)) return null;

  for (const other of other_account_ids) {
    if (other && body.startsWith(`${other}_`)) return null;
  }

  if (ACCOUNT_SCOPED_BODY.test(body)) return null;

  const separator = unscoped_separator(prefix);

  if (separator && !body.startsWith(separator)) return null;

  const rest = body.slice(separator.length);

  if (!rest) return null;

  return { key, prefix, rest };
}

export async function migrate_storage_names(
  uid: string | null,
  other_account_ids: readonly string[] = [],
): Promise<StorageNameMigrationResult> {
  const result: StorageNameMigrationResult = { moved: 0, unreadable: 0 };

  if (!uid) return result;

  const wrap = await wrapping_key();
  const keys = await encrypted_list_keys();
  let handled = 0;

  for (const key of keys) {
    const entry = classify_plain_entry(key, uid, other_account_ids);

    if (!entry) continue;

    const target = await scoped_storage_name(entry.prefix, uid, entry.rest);
    const outcome = await encrypted_move(entry.key, target, wrap);

    if (outcome === "moved" || outcome === "kept_existing") result.moved += 1;
    if (outcome === "unreadable") result.unreadable += 1;

    handled += 1;

    if (handled % SWEEP_YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  swept_accounts.add(account_slot(uid));

  return result;
}

async function run_scheduled_migration(): Promise<StorageNameMigrationResult> {
  const { get_current_account_id, get_all_accounts } =
    await import("@/services/account_manager");
  const uid = await get_current_account_id();
  const others = (await get_all_accounts())
    .map((account) => account.id)
    .filter((id) => id !== uid);

  return migrate_storage_names(uid, others);
}

export function schedule_storage_name_migration(): void {
  arm_hooks();

  if (sweep_in_flight) {
    sweep_requested = true;

    return;
  }

  const run = run_scheduled_migration()
    .catch((caught): StorageNameMigrationResult => {
      ignore_error(
        "services/crypto/storage_key_names:schedule_storage_name_migration",
        caught,
      );

      return { moved: 0, unreadable: 0 };
    })
    .finally(() => {
      if (sweep_in_flight === run) sweep_in_flight = null;

      if (sweep_requested) {
        sweep_requested = false;
        schedule_storage_name_migration();
      }
    });

  sweep_in_flight = run;
}

export function reset_storage_name_state(): void {
  name_keys.clear();
  swept_accounts.clear();
}

arm_hooks();
