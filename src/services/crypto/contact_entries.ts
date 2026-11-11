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
  canonical_pin_id,
  describe_pin_contact,
  dotted_spellings,
  resolve_pin_contact,
  type PeerKind,
  type PinContact,
} from "./pin_identity";
import {
  PIN_SPELLINGS_PREFIX,
  canonical_storage_name,
  legacy_opaque_starts,
  legacy_storage_names,
  plain_rest_of,
  stored_names,
  stored_read,
  stored_remove,
  stored_write,
} from "./storage_key_names";
import { get_derived_encryption_key } from "./memory_key_store";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

export type ContactRead<T> =
  | { state: "found"; value: T; conflict: boolean }
  | { state: "absent" }
  | { state: "unreadable" }
  | { state: "unknown" };

export interface ContactSlot {
  contact: PinContact;
  uid: string | null;
  storage_key: CryptoKey;
}

interface LegacySurvey {
  names: string[];
  unattributed: boolean;
}

export const UNATTRIBUTED_LEGACY_ENTRIES_BLOCK_FIRST_CONTACT = true;

const DOTTED_SPELLING_LIMIT = 2048;
const OPAQUE_TAIL = /^[A-Za-z0-9_-]{43}$/;
const LOCK_PREFIX = "aster_contact_lock_";
const REVIEWED_PREFIX = PIN_SPELLINGS_PREFIX;

const dotted_matches = new Map<string, string[]>();
const contact_chains = new Map<string, Promise<void>>();

export function reset_contact_entry_state(): void {
  dotted_matches.clear();
}

async function contact_storage_key(): Promise<CryptoKey> {
  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) {
    throw new Error("contact storage key unavailable");
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(key_bytes);

  return crypto_key;
}

async function current_account_uid(): Promise<string | null> {
  const { get_current_account_id } = await import("@/services/account_manager");

  return get_current_account_id();
}

export async function open_contact(raw: string): Promise<ContactSlot | null> {
  const storage_key = await contact_storage_key();
  const uid = await current_account_uid();
  const contact = await resolve_pin_contact(raw);

  return contact ? { contact, uid, storage_key } : null;
}

export async function open_contact_as(
  raw: string,
  kind: PeerKind,
): Promise<ContactSlot> {
  const storage_key = await contact_storage_key();
  const uid = await current_account_uid();

  return { contact: describe_pin_contact(raw, kind), uid, storage_key };
}

function folds(contact: PinContact): boolean {
  return contact.kind !== "external";
}

async function dotted_names(
  prefix: string,
  slot: ContactSlot,
  stored: Set<string>,
): Promise<string[]> {
  const cache_key = `${slot.uid ?? ""}|${prefix}|${slot.contact.id}`;
  let known = dotted_matches.get(cache_key);

  if (!known) {
    known = [];

    for (const spelling of dotted_spellings(
      slot.contact.id,
      DOTTED_SPELLING_LIMIT,
    )) {
      for (const name of await legacy_storage_names(
        prefix,
        slot.uid,
        spelling,
        slot.storage_key,
      )) {
        if (stored.has(name)) known.push(name);
      }
    }

    dotted_matches.set(cache_key, known);
  }

  return known.filter((name) => stored.has(name));
}

async function survey_legacy(
  prefix: string,
  slot: ContactSlot,
): Promise<LegacySurvey> {
  const stored = await stored_names();
  const starts = await legacy_opaque_starts(
    prefix,
    slot.uid,
    slot.storage_key,
  );
  const found = new Set<string>();
  const opaque: string[] = [];
  let plain_present = false;

  for (const name of stored) {
    if (!name.startsWith(prefix)) continue;

    const rest = plain_rest_of(prefix, slot.uid, name);

    if (rest) {
      plain_present = true;

      if (
        folds(slot.contact) &&
        canonical_pin_id(rest, slot.contact.kind) === slot.contact.id
      ) {
        found.add(name);
      }

      continue;
    }

    if (
      starts.some(
        (start) =>
          name.startsWith(start) && OPAQUE_TAIL.test(name.slice(start.length)),
      )
    ) {
      opaque.push(name);
    }
  }

  if (!plain_present && opaque.length === 0) {
    return { names: [], unattributed: false };
  }

  for (const spelling of slot.contact.spellings) {
    for (const name of await legacy_storage_names(
      prefix,
      slot.uid,
      spelling,
      slot.storage_key,
    )) {
      if (stored.has(name)) found.add(name);
    }
  }

  let unclaimed = opaque.filter((name) => !found.has(name));

  if (slot.contact.kind === "builtin" && unclaimed.length > 0) {
    for (const name of await dotted_names(prefix, slot, stored)) {
      found.add(name);
    }

    unclaimed = unclaimed.filter((name) => !found.has(name));
  }

  return {
    names: [...found],
    unattributed: folds(slot.contact) && unclaimed.length > 0,
  };
}

async function reviewed_name(slot: ContactSlot): Promise<string> {
  return canonical_storage_name(REVIEWED_PREFIX, slot.uid, slot.contact.id);
}

async function is_contact_reviewed(slot: ContactSlot): Promise<boolean> {
  return (await stored_names()).has(await reviewed_name(slot));
}

export async function mark_contact_reviewed(slot: ContactSlot): Promise<void> {
  await stored_write(
    await reviewed_name(slot),
    { reviewed_at: Date.now() },
    slot.storage_key,
  );
}

export async function read_contact_entry<T>(
  prefix: string,
  slot: ContactSlot,
  same: (left: T, right: T) => boolean,
  merge: (left: T, right: T) => T = (left) => left,
): Promise<ContactRead<T>> {
  const name = await canonical_storage_name(prefix, slot.uid, slot.contact.id);
  const current = await stored_read<T>(name, slot.storage_key);

  if (current.state === "unreadable") return { state: "unreadable" };

  const survey = await survey_legacy(prefix, slot);
  const values: T[] = current.state === "found" ? [current.value] : [];
  const readable: string[] = [];
  let unreadable = false;

  for (const legacy of survey.names) {
    const entry = await stored_read<T>(legacy, slot.storage_key);

    if (entry.state === "unreadable") unreadable = true;

    if (entry.state === "found") {
      values.push(entry.value);
      readable.push(legacy);
    }
  }

  if (current.state !== "found" && unreadable) return { state: "unreadable" };

  if (values.length === 0) {
    if (
      !survey.unattributed ||
      !UNATTRIBUTED_LEGACY_ENTRIES_BLOCK_FIRST_CONTACT ||
      (await is_contact_reviewed(slot))
    ) {
      return { state: "absent" };
    }

    return { state: "unknown" };
  }

  const [first, ...rest] = values;

  if (rest.some((value) => !same(first, value))) {
    return { state: "found", value: first, conflict: true };
  }

  if (readable.length === 0) {
    return { state: "found", value: first, conflict: false };
  }

  const merged = rest.reduce((settled, value) => merge(settled, value), first);

  await stored_write(name, merged, slot.storage_key);

  for (const legacy of readable) {
    await stored_remove(legacy);
  }

  return { state: "found", value: merged, conflict: false };
}

async function remove_legacy(prefix: string, slot: ContactSlot): Promise<void> {
  const survey = await survey_legacy(prefix, slot);

  for (const legacy of survey.names) {
    const shared =
      Boolean(slot.uid) && !legacy.startsWith(`${prefix}${slot.uid}_`);

    if (shared) {
      const entry = await stored_read<unknown>(legacy, slot.storage_key);

      if (entry.state === "unreadable") continue;
    }

    await stored_remove(legacy);
  }
}

export async function write_contact_entry(
  prefix: string,
  slot: ContactSlot,
  value: unknown,
): Promise<void> {
  await stored_write(
    await canonical_storage_name(prefix, slot.uid, slot.contact.id),
    value,
    slot.storage_key,
  );
  await remove_legacy(prefix, slot);
}

export async function create_contact_entry(
  prefix: string,
  slot: ContactSlot,
  value: unknown,
): Promise<boolean> {
  return stored_write(
    await canonical_storage_name(prefix, slot.uid, slot.contact.id),
    value,
    slot.storage_key,
    { if_absent: true },
  );
}

export async function delete_contact_entry(
  prefix: string,
  slot: ContactSlot,
): Promise<void> {
  await stored_remove(
    await canonical_storage_name(prefix, slot.uid, slot.contact.id),
  );
  await remove_legacy(prefix, slot);
}

function cross_tab_locks(): LockManager | null {
  try {
    if (typeof navigator === "undefined") return null;

    const manager = navigator.locks;

    return typeof manager?.request === "function" ? manager : null;
  } catch {
    return null;
  }
}

export async function with_contact_lock<T>(
  slot: ContactSlot,
  task: () => Promise<T>,
): Promise<T> {
  const lock_name = await canonical_storage_name(
    LOCK_PREFIX,
    slot.uid,
    slot.contact.id,
  );
  const manager = cross_tab_locks();
  const guarded = (): Promise<T> =>
    manager ? (manager.request(lock_name, task) as Promise<T>) : task();
  const previous = contact_chains.get(lock_name) ?? Promise.resolve();
  const next = previous.then(guarded, guarded);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );

  contact_chains.set(lock_name, settled);
  void settled.then(() => {
    if (contact_chains.get(lock_name) === settled) {
      contact_chains.delete(lock_name);
    }
  });

  return next;
}
