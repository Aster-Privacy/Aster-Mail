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
  type EncryptedMoveOutcome,
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
export const ACCEPTED_BUNDLE_PREFIX = "ratchet_accepted_bundle_";
export const PIN_SPELLINGS_PREFIX = "ratchet_pin_spellings_";
export const RATCHET_STATE_PREFIX = "ratchet_state_";
export const RATCHET_PLAINTEXT_PREFIX = "ratchet_plaintext_";
export const RATCHET_SYNC_FLOOR_PREFIX = "ratchet_sync_floor_";

const SCOPED_PREFIXES: readonly string[] = [
  SENDER_HISTORY_PREFIX,
  IDENTITY_PIN_PREFIX,
  IDENTITY_CHANGE_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  ACCEPTED_BUNDLE_PREFIX,
  PIN_SPELLINGS_PREFIX,
  RATCHET_STATE_PREFIX,
  RATCHET_PLAINTEXT_PREFIX,
  RATCHET_SYNC_FLOOR_PREFIX,
];

const ACCOUNT_EXACT_KEY_PREFIXES: readonly string[] = [
  "ratchet_conversation_index_",
];

const NAME_KEY_ENTRY = "storage_name_key";
const NAME_KEY_BYTES = 32;
const OPAQUE_MARKER = "h1_";
const CANONICAL_MARKER = "h2_";
const OPAQUE_NAME = /^h[12]_[A-Za-z0-9_-]{43}$/;
const ACCOUNT_SCOPED_BODY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
const SWEEP_YIELD_EVERY = 25;

export type ScopedRead<T> =
  { state: "found"; value: T } | { state: "absent" } | { state: "unreadable" };

export class StorageNamesUnavailableError extends Error {
  constructor() {
    super("storage names unavailable");
    this.name = "StorageNamesUnavailableError";
  }
}

const name_keys = new Map<string, Promise<CryptoKey>>();
const unscoped_name_keys = new Map<string, CryptoKey>();
const swept_accounts = new Set<string>();
const unreadable_entries = new Map<string, PlainEntry[]>();
let sweep_in_flight: Promise<StorageNameMigrationResult> | null = null;
let sweep_requested = false;
let hooks_armed = false;
let stored_listing: Promise<Set<string>> | null = null;

export function stored_names(): Promise<Set<string>> {
  if (stored_listing) return stored_listing;

  const pending = encrypted_list_keys().then((keys) => new Set(keys));

  stored_listing = pending;
  pending.catch(() => {
    if (stored_listing === pending) stored_listing = null;
  });

  return pending;
}

export function forget_stored_names(): void {
  stored_listing = null;
}

function note_stored_name(name: string, present: boolean): void {
  const pending = stored_listing;

  if (!pending) return;

  pending
    .then((names) => {
      if (present) names.add(name);
      else names.delete(name);
    })
    .catch(() => {});
}

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
  note_stored_name(name_key_entry(uid), true);

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
      unscoped_name_keys.clear();
      swept_accounts.clear();
      forget_stored_names();
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
    if (Object.is(name_keys.get(slot), pending)) name_keys.delete(slot);
    throw caught;
  }
}

async function name_tag(
  key: CryptoKey,
  prefix: string,
  rest: string,
  marker: string = OPAQUE_MARKER,
): Promise<string> {
  const separator = marker === OPAQUE_MARKER ? "\u0000" : "\u0001";
  const input = new TextEncoder().encode(`${prefix}${separator}${rest}`);
  const mac = await crypto.subtle.sign("HMAC", key, input);

  return `${marker}${to_base64_url(new Uint8Array(mac))}`;
}

export async function canonical_storage_name(
  prefix: string,
  uid: string | null,
  rest: string,
): Promise<string> {
  const tag = await name_tag(
    await name_key_for(uid),
    prefix,
    rest,
    CANONICAL_MARKER,
  );

  return uid ? `${prefix}${uid}_${tag}` : `${prefix}${tag}`;
}

export async function legacy_storage_names(
  prefix: string,
  uid: string | null,
  rest: string,
  storage_key: CryptoKey,
): Promise<string[]> {
  const names = [
    await scoped_storage_name(prefix, uid, rest),
    plain_name(prefix, uid, rest),
  ];

  if (!uid) return names;

  names.push(plain_name(prefix, null, rest));

  const unscoped = await unscoped_storage_name(prefix, uid, rest, storage_key);

  if (unscoped) names.push(unscoped);

  return names;
}

export async function legacy_opaque_starts(
  prefix: string,
  uid: string | null,
  storage_key: CryptoKey,
): Promise<string[]> {
  if (!uid) return [`${prefix}${OPAQUE_MARKER}`];

  const starts = [`${prefix}${uid}_${OPAQUE_MARKER}`];

  if (await load_unscoped_name_key(uid, storage_key)) {
    starts.push(`${prefix}${OPAQUE_MARKER}`);
  }

  return starts;
}

export function plain_rest_of(
  prefix: string,
  uid: string | null,
  name: string,
): string | null {
  if (!name.startsWith(prefix)) return null;

  const body = name.slice(prefix.length);

  if (uid && body.startsWith(`${uid}_`)) {
    const rest = body.slice(uid.length + 1);

    return rest && !OPAQUE_NAME.test(rest) ? rest : null;
  }

  if (OPAQUE_NAME.test(body) || ACCOUNT_SCOPED_BODY.test(body)) return null;

  return body.slice(unscoped_separator(prefix).length) || null;
}

export async function stored_read<T>(
  name: string,
  storage_key: CryptoKey,
): Promise<ScopedRead<T>> {
  const value = await encrypted_get<T>(name, storage_key);

  if (value !== null && value !== undefined) return { state: "found", value };

  return (await encrypted_has(name))
    ? { state: "unreadable" }
    : { state: "absent" };
}

export async function stored_write(
  name: string,
  value: unknown,
  storage_key: CryptoKey,
  options: { if_absent?: boolean } = {},
): Promise<boolean> {
  const written = options.if_absent
    ? await encrypted_set_if_absent(name, value, storage_key)
    : (await encrypted_set(name, value, storage_key), true);

  note_stored_name(name, true);

  return written;
}

export async function stored_remove(name: string): Promise<void> {
  await encrypted_delete(name);
  note_stored_name(name, false);
}

async function stored_adopt(
  from_name: string,
  to_name: string,
  storage_key: CryptoKey,
): Promise<EncryptedMoveOutcome> {
  const outcome = await encrypted_move(from_name, to_name, storage_key);

  if (outcome === "moved" || outcome === "kept_existing") {
    note_stored_name(from_name, false);
    note_stored_name(to_name, true);
  }

  if (outcome === "missing") note_stored_name(from_name, false);

  return outcome;
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
  const adopted = await encrypted_move(
    plain_name(prefix, uid, rest),
    name,
    storage_key,
  );

  if (adopted === "moved") return encrypted_get<T>(name, storage_key);
  if (value !== null) return value;

  const candidates = swept_accounts.has(account_slot(uid))
    ? []
    : (
        await earlier_names(
          prefix,
          uid,
          rest,
          storage_key,
          options.include_unscoped !== false,
        )
      ).slice(1);

  for (const candidate of candidates) {
    const outcome = await encrypted_move(candidate, name, storage_key);

    if (outcome === "moved" || outcome === "kept_existing") {
      return encrypted_get<T>(name, storage_key);
    }
  }

  return encrypted_get<T>(name, storage_key);
}

async function load_unscoped_name_key(
  uid: string,
  storage_key: CryptoKey,
): Promise<CryptoKey | null> {
  const cached = unscoped_name_keys.get(uid);

  if (cached) return cached;

  arm_hooks();

  try {
    if (!(await stored_names()).has(name_key_entry(null))) return null;

    const stored = await encrypted_get<string>(
      name_key_entry(null),
      storage_key,
    );

    if (typeof stored !== "string") return null;

    const key = await import_name_key(stored);

    unscoped_name_keys.set(uid, key);

    return key;
  } catch (caught) {
    ignore_error(
      "services/crypto/storage_key_names:load_unscoped_name_key",
      caught,
    );

    return null;
  }
}

export async function unscoped_storage_name(
  prefix: string,
  uid: string | null,
  rest: string,
  storage_key: CryptoKey,
): Promise<string | null> {
  if (!uid) return null;

  const key = await load_unscoped_name_key(uid, storage_key);

  if (!key) return null;

  return `${prefix}${await name_tag(key, prefix, rest)}`;
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
  note_stored_name(name, true);
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
  unscoped_name_keys.delete(uid);
  swept_accounts.delete(uid);
  unreadable_entries.delete(uid);
  forget_stored_names();

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
  const slot = account_slot(uid);
  const retried = unreadable_entries.get(slot);

  if (!retried) forget_stored_names();

  const entries =
    retried ??
    [...(await stored_names())]
      .map((key) => classify_plain_entry(key, uid, other_account_ids))
      .filter((entry): entry is PlainEntry => entry !== null);
  const still_unreadable: PlainEntry[] = [];
  let handled = 0;

  for (const entry of entries) {
    const target = await scoped_storage_name(entry.prefix, uid, entry.rest);
    const outcome = await stored_adopt(entry.key, target, wrap);

    if (outcome === "moved" || outcome === "kept_existing") result.moved += 1;

    if (outcome === "unreadable") {
      result.unreadable += 1;
      still_unreadable.push(entry);
    }

    handled += 1;

    if (handled % SWEEP_YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (still_unreadable.length > 0) {
    unreadable_entries.set(slot, still_unreadable);
    swept_accounts.delete(slot);
  } else {
    unreadable_entries.delete(slot);
    swept_accounts.add(slot);
  }

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
  unscoped_name_keys.clear();
  swept_accounts.clear();
  unreadable_entries.clear();
  forget_stored_names();
}

arm_hooks();
