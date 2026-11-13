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
  ACCEPTED_BUNDLE_PREFIX,
  IDENTITY_CHANGE_PREFIX,
  IDENTITY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  SENDER_HISTORY_PREFIX,
} from "./storage_key_names";
import { base64_to_array, compute_hash } from "./key_manager_core";
import {
  dismiss_peer_identity_event,
  note_peer_alias,
  record_peer_identity_event,
} from "./ratchet_verification_status";
import {
  KeyPinUnavailableError,
  RecipientPinUnreadableError,
} from "./ratchet_types";
import {
  create_contact_entry,
  delete_contact_entry,
  mark_contact_reviewed,
  open_contact,
  open_contact_as,
  read_contact_entry,
  with_contact_lock,
  write_contact_entry,
  type ContactRead,
  type ContactSlot,
} from "./contact_entries";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

export type OwnerKeyPinStatus = "first" | "ok" | "changed" | "unknown";

export type RecipientPinHealth = "settled" | "conflict" | "unreadable";

export interface RecipientPinSnapshot {
  health: RecipientPinHealth;
  identity_fingerprint: string | null;
  owner_fingerprint: string | null;
  flagged: boolean;
  change: IdentityChangeRecord | null;
}

export interface PinnedIdentity {
  id: string;
  fingerprint: string | null;
}

interface StoredOwnerKeyPin {
  fingerprint: string;
  pinned_at: number;
  hosted?: boolean;
  missing_accepted_at?: number;
}

interface StoredUntrustedFlag {
  flagged_at: number;
  version?: number;
}

const UNTRUSTED_FLAG_VERSION = 2;

function is_flag_raised(read: ContactRead<StoredUntrustedFlag>): boolean {
  return (
    read.state === "found" && read.value.version === UNTRUSTED_FLAG_VERSION
  );
}

interface StoredAcceptedBundle {
  fingerprint: string;
  accepted_at: number;
}

export interface RecipientBundleBinding {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  pq_kem_public_key?: string | null;
}

export type IdentityPinStatus =
  "first" | "ok" | "rotated" | "drift" | "unreadable" | "unknown";

interface StoredIdentityPin {
  fingerprint: string;
  verified: boolean;
  pinned_at: number;
  pq_seen?: boolean;
  rotated?: boolean;
  missing_accepted_at?: number;
  address_rooted?: boolean;
}

export interface IdentityPinRecord {
  fingerprint: string;
  rotated: boolean;
  address_rooted: boolean;
}

function rooted_field(address_rooted: boolean): { address_rooted?: true } {
  return address_rooted ? { address_rooted: true } : {};
}

export type IdentityPinLookup = IdentityPinRecord | "unreadable" | null;

export interface IdentityChangeRecord {
  previous_fingerprint: string;
  fingerprint: string;
  changed_at: number;
}

const PIN_PREFIXES: readonly string[] = [
  IDENTITY_PIN_PREFIX,
  IDENTITY_CHANGE_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  ACCEPTED_BUNDLE_PREFIX,
];

export const MAX_REMEMBERED_IDENTITIES = 12;

export async function open_pin_contact(
  pin_id: string,
): Promise<ContactSlot | null> {
  const slot = await open_contact(pin_id);

  if (slot) note_peer_alias(pin_id, slot.contact.id);

  return slot;
}

const open_pins = open_pin_contact;

function hosted_field(slot: ContactSlot): { hosted?: true } {
  return slot.contact.kind === "hosted" ? { hosted: true } : {};
}

function is_hosted_owner_pin(
  owner: ContactRead<StoredOwnerKeyPin>,
  identity: ContactRead<StoredIdentityPin>,
): boolean {
  return (
    owner.state === "found" &&
    (owner.value.hosted === true || identity.state === "found")
  );
}

function remembered_keys(stored: unknown): string[] {
  return Array.isArray(stored)
    ? stored.filter((value): value is string => typeof value === "string")
    : [];
}

export async function read_sender_history(
  slot: ContactSlot,
): Promise<ContactRead<string[]>> {
  const read = await read_contact_entry<unknown>(
    SENDER_HISTORY_PREFIX,
    slot,
    () => true,
    (left, right) =>
      [...new Set([...remembered_keys(left), ...remembered_keys(right)])].slice(
        0,
        MAX_REMEMBERED_IDENTITIES,
      ),
  );

  return read.state === "found"
    ? { ...read, value: remembered_keys(read.value) }
    : read;
}

function same_fingerprint(
  left: { fingerprint: string },
  right: { fingerprint: string },
): boolean {
  return left.fingerprint === right.fingerprint;
}

function merge_identity_pins(
  left: StoredIdentityPin,
  right: StoredIdentityPin,
): StoredIdentityPin {
  return {
    fingerprint: left.fingerprint,
    verified: left.verified || right.verified,
    pinned_at: Math.min(left.pinned_at, right.pinned_at),
    pq_seen: Boolean(left.pq_seen) || Boolean(right.pq_seen),
    ...(left.rotated || right.rotated ? { rotated: true } : {}),
    ...rooted_field(
      Boolean(left.address_rooted) || Boolean(right.address_rooted),
    ),
    ...(left.missing_accepted_at && right.missing_accepted_at
      ? {
          missing_accepted_at: Math.max(
            left.missing_accepted_at,
            right.missing_accepted_at,
          ),
        }
      : {}),
  };
}

function load_identity_pin(
  slot: ContactSlot,
): Promise<ContactRead<StoredIdentityPin>> {
  return read_contact_entry<StoredIdentityPin>(
    IDENTITY_PIN_PREFIX,
    slot,
    same_fingerprint,
    merge_identity_pins,
  );
}

function load_owner_pin(
  slot: ContactSlot,
): Promise<ContactRead<StoredOwnerKeyPin>> {
  return read_contact_entry<StoredOwnerKeyPin>(
    OWNER_KEY_PIN_PREFIX,
    slot,
    same_fingerprint,
  );
}

function load_identity_change(
  slot: ContactSlot,
): Promise<ContactRead<IdentityChangeRecord>> {
  return read_contact_entry<IdentityChangeRecord>(
    IDENTITY_CHANGE_PREFIX,
    slot,
    (left, right) =>
      left.fingerprint === right.fingerprint &&
      left.previous_fingerprint === right.previous_fingerprint,
  );
}

function load_untrusted_flag(
  slot: ContactSlot,
): Promise<ContactRead<StoredUntrustedFlag>> {
  return read_contact_entry<StoredUntrustedFlag>(
    IDENTITY_UNTRUSTED_PREFIX,
    slot,
    () => true,
  );
}

function is_settled<T>(
  read: ContactRead<T>,
): read is
  | { state: "found"; value: T; conflict: boolean }
  | { state: "absent" } {
  return read.state === "found" || read.state === "absent";
}

function settled_value<T>(read: ContactRead<T>): T | null {
  return read.state === "found" ? read.value : null;
}

async function pin_identity_in_lock(
  slot: ContactSlot,
  pin_id: string,
  fingerprint: string,
  verified: boolean,
  advertises_pq: boolean,
  address_rooted: boolean,
): Promise<IdentityPinStatus> {
  let read = await load_identity_pin(slot);

  if (read.state === "absent") {
    const created = await create_contact_entry(IDENTITY_PIN_PREFIX, slot, {
      fingerprint,
      verified,
      pinned_at: Date.now(),
      pq_seen: advertises_pq,
      ...rooted_field(address_rooted),
    } satisfies StoredIdentityPin);

    if (created) return "first";

    read = await load_identity_pin(slot);
  }

  if (read.state !== "found") return "unreadable";
  if (read.conflict) return "drift";

  const existing = read.value;
  const pq_seen = Boolean(existing.pq_seen) || advertises_pq;
  const rooted = Boolean(existing.address_rooted) || address_rooted;

  if (existing.fingerprint !== fingerprint) {
    if (!verified) return "drift";

    await write_contact_entry(IDENTITY_PIN_PREFIX, slot, {
      fingerprint,
      verified,
      pinned_at: Date.now(),
      pq_seen,
      rotated: true,
      ...rooted_field(rooted),
    } satisfies StoredIdentityPin);
    await write_contact_entry(IDENTITY_CHANGE_PREFIX, slot, {
      previous_fingerprint: existing.fingerprint,
      fingerprint,
      changed_at: Date.now(),
    } satisfies IdentityChangeRecord);

    record_peer_identity_event(pin_id, "rotated");

    return "rotated";
  }

  if (
    (verified && !existing.verified) ||
    pq_seen !== Boolean(existing.pq_seen) ||
    rooted !== Boolean(existing.address_rooted)
  ) {
    await write_contact_entry(IDENTITY_PIN_PREFIX, slot, {
      ...existing,
      verified: existing.verified || verified,
      pq_seen,
      ...rooted_field(rooted),
    } satisfies StoredIdentityPin);
  }

  return "ok";
}

export async function check_and_pin_identity(
  pin_id: string,
  kem_identity_key: string,
  verified: boolean = false,
  advertises_pq: boolean = false,
  address_rooted: boolean = false,
): Promise<IdentityPinStatus> {
  try {
    if (!pin_id || !kem_identity_key) {
      return "ok";
    }

    const fingerprint = await compute_hash(base64_to_array(kem_identity_key));
    const slot = await open_pins(pin_id);

    if (!slot) return "unknown";

    return await with_contact_lock(slot, () =>
      pin_identity_in_lock(
        slot,
        pin_id,
        fingerprint,
        verified,
        advertises_pq,
        address_rooted,
      ),
    );
  } catch {
    return "unknown";
  }
}

export async function flag_recipient_untrusted(pin_id: string): Promise<void> {
  try {
    const slot = await open_pins(pin_id);

    if (slot) {
      await write_contact_entry(IDENTITY_UNTRUSTED_PREFIX, slot, {
        flagged_at: Date.now(),
        version: UNTRUSTED_FLAG_VERSION,
      } satisfies StoredUntrustedFlag);
    }
  } catch {
    record_peer_identity_event(pin_id, "untrusted");

    return;
  }

  record_peer_identity_event(pin_id, "untrusted");
}

export async function is_recipient_flagged_untrusted(
  pin_id: string,
): Promise<boolean> {
  let slot: ContactSlot | null;
  let flag: ContactRead<StoredUntrustedFlag>;

  try {
    slot = await open_pins(pin_id);
    flag = slot ? await load_untrusted_flag(slot) : { state: "unknown" };
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  if (!slot) throw new KeyPinUnavailableError(pin_id);

  return is_flag_raised(flag);
}

async function bundle_binding_fingerprint(
  bundle: RecipientBundleBinding,
): Promise<string> {
  return compute_hash(
    new TextEncoder().encode(
      [
        bundle.kem_identity_key,
        bundle.signed_prekey,
        bundle.signed_prekey_signature,
        bundle.pq_kem_public_key ?? "",
      ].join("."),
    ),
  );
}

export async function is_recipient_bundle_accepted(
  pin_id: string,
  bundle: RecipientBundleBinding,
): Promise<boolean> {
  try {
    if (!pin_id) return false;

    const slot = await open_pins(pin_id);

    if (!slot) return false;

    const accepted = await read_contact_entry<StoredAcceptedBundle>(
      ACCEPTED_BUNDLE_PREFIX,
      slot,
      same_fingerprint,
    );

    if (accepted.state !== "found" || accepted.conflict) return false;

    return (
      accepted.value.fingerprint === (await bundle_binding_fingerprint(bundle))
    );
  } catch {
    return false;
  }
}

export async function owner_key_fingerprint(
  armored_public_key: string,
): Promise<string> {
  const openpgp = await load_openpgp();

  const key = await openpgp.readKey({ armoredKey: armored_public_key });

  return key.getFingerprint().toLowerCase();
}

async function pin_owner_key_in_lock(
  slot: ContactSlot,
  pin_id: string,
  armored_public_key: string,
): Promise<OwnerKeyPinStatus> {
  let read: ContactRead<StoredOwnerKeyPin>;

  try {
    read = await load_owner_pin(slot);
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  if (!is_settled(read)) throw new RecipientPinUnreadableError(pin_id);
  if (read.state === "found" && read.conflict) return "changed";

  const existing = settled_value(read);
  let fingerprint: string;

  await load_openpgp();

  try {
    fingerprint = await owner_key_fingerprint(armored_public_key);
  } catch {
    return existing ? "changed" : "unknown";
  }

  if (existing) {
    if (existing.fingerprint !== fingerprint) return "changed";

    if (slot.contact.kind === "hosted" && existing.hosted !== true) {
      await write_contact_entry(OWNER_KEY_PIN_PREFIX, slot, {
        ...existing,
        hosted: true,
      } satisfies StoredOwnerKeyPin).catch(() => undefined);
    }

    return "ok";
  }

  let created: boolean;

  try {
    created = await create_contact_entry(OWNER_KEY_PIN_PREFIX, slot, {
      fingerprint,
      pinned_at: Date.now(),
      ...hosted_field(slot),
    } satisfies StoredOwnerKeyPin);
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  if (created) return "first";

  const raced = await load_owner_pin(slot).catch(() => null);

  if (!raced || raced.state !== "found") {
    throw new RecipientPinUnreadableError(pin_id);
  }

  return !raced.conflict && raced.value.fingerprint === fingerprint
    ? "ok"
    : "changed";
}

export async function check_owner_key_pin(
  pin_id: string,
  armored_public_key: string,
): Promise<OwnerKeyPinStatus> {
  if (!pin_id || !armored_public_key) return "unknown";

  let slot: ContactSlot | null;

  try {
    slot = await open_pins(pin_id);
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  if (!slot) throw new KeyPinUnavailableError(pin_id);

  const opened = slot;

  return with_contact_lock(opened, () =>
    pin_owner_key_in_lock(opened, pin_id, armored_public_key),
  );
}

export async function lookup_owner_key_pin(
  pin_id: string,
): Promise<{ fingerprint: string; conflict: boolean } | "unreadable" | null> {
  try {
    const slot = await open_pins(pin_id);

    if (!slot) return "unreadable";

    const read = await load_owner_pin(slot);

    if (!is_settled(read)) return "unreadable";
    if (read.state === "absent") return null;

    return { fingerprint: read.value.fingerprint, conflict: read.conflict };
  } catch {
    return "unreadable";
  }
}

export type SavedKeyLookup =
  | { fingerprint: string; conflict: boolean; owner: boolean }
  | "unreadable"
  | null;

export async function lookup_saved_key(email: string): Promise<SavedKeyLookup> {
  try {
    const direct = await open_pins(email);

    if (!direct) return "unreadable";

    const direct_owner = await load_owner_pin(direct);

    if (!is_settled(direct_owner)) return "unreadable";

    if (direct_owner.state === "found") {
      return {
        fingerprint: direct_owner.value.fingerprint,
        conflict: direct_owner.conflict,
        owner: true,
      };
    }

    const hosted = await open_contact_as(email, "hosted");

    if (hosted.contact.id === direct.contact.id) return null;

    const hosted_owner = await load_owner_pin(hosted);
    const hosted_identity = await load_identity_pin(hosted);

    if (!is_settled(hosted_owner) || !is_settled(hosted_identity)) {
      return "unreadable";
    }

    if (
      hosted_owner.state === "found" &&
      is_hosted_owner_pin(hosted_owner, hosted_identity)
    ) {
      return {
        fingerprint: hosted_owner.value.fingerprint,
        conflict: hosted_owner.conflict,
        owner: true,
      };
    }

    if (hosted_identity.state === "found") {
      return {
        fingerprint: hosted_identity.value.fingerprint,
        conflict: hosted_identity.conflict,
        owner: false,
      };
    }

    return null;
  } catch {
    return "unreadable";
  }
}

export interface SavedRecipientKey {
  fingerprint: string;
  accepted_missing: boolean;
  unreadable: boolean;
}

interface SavedKeySources {
  sources: SavedKeySource[];
  unreadable: boolean;
}

interface SavedKeySource {
  prefix: string;
  slot: ContactSlot;
  value: StoredIdentityPin | StoredOwnerKeyPin;
}

async function saved_key_sources(email: string): Promise<SavedKeySources> {
  const sources: SavedKeySource[] = [];
  let unreadable = false;
  const direct = await open_contact_as(email, "external");
  const hosted = await open_contact_as(email, "hosted");
  const direct_owner = await load_owner_pin(direct);

  if (direct_owner.state === "unreadable") unreadable = true;

  if (direct_owner.state === "found") {
    sources.push({
      prefix: OWNER_KEY_PIN_PREFIX,
      slot: direct,
      value: direct_owner.value,
    });
  }

  const hosted_identity = await load_identity_pin(hosted);

  if (hosted_identity.state === "unreadable") unreadable = true;

  if (hosted_identity.state === "found") {
    sources.push({
      prefix: IDENTITY_PIN_PREFIX,
      slot: hosted,
      value: hosted_identity.value,
    });
  }

  if (hosted.contact.id !== direct.contact.id) {
    const hosted_owner = await load_owner_pin(hosted);

    if (hosted_owner.state === "unreadable") unreadable = true;

    if (
      hosted_owner.state === "found" &&
      is_hosted_owner_pin(hosted_owner, hosted_identity)
    ) {
      sources.push({
        prefix: OWNER_KEY_PIN_PREFIX,
        slot: hosted,
        value: hosted_owner.value,
      });
    }
  }

  return { sources, unreadable };
}

export async function find_saved_recipient_key(
  email: string,
): Promise<SavedRecipientKey | null> {
  const { sources, unreadable } = await saved_key_sources(email);

  if (sources.length === 0 && !unreadable) return null;

  return {
    fingerprint: sources[0]?.value.fingerprint ?? "",
    accepted_missing:
      !unreadable &&
      sources.every(
        (source) => typeof source.value.missing_accepted_at === "number",
      ),
    unreadable,
  };
}

async function mark_saved_recipient_key(
  email: string,
  accepted: boolean,
): Promise<void> {
  for (const source of (await saved_key_sources(email)).sources) {
    const marked = typeof source.value.missing_accepted_at === "number";

    if (marked === accepted) continue;

    await with_contact_lock(source.slot, async () => {
      const read = await read_contact_entry<
        StoredIdentityPin | StoredOwnerKeyPin
      >(source.prefix, source.slot, same_fingerprint);

      if (read.state !== "found" || read.conflict) return;
      if (read.value.fingerprint !== source.value.fingerprint) return;

      const kept = { ...read.value };

      delete kept.missing_accepted_at;

      await write_contact_entry(
        source.prefix,
        source.slot,
        accepted ? { ...kept, missing_accepted_at: Date.now() } : kept,
      );
    });
  }
}

export function accept_missing_recipient_key(email: string): Promise<void> {
  return mark_saved_recipient_key(email, true);
}

export function restore_missing_key_check(email: string): Promise<void> {
  return mark_saved_recipient_key(email, false);
}

export async function replace_owner_key_pin(
  pin_id: string,
  armored_public_key: string,
): Promise<void> {
  const slot = await open_pins(pin_id);

  if (!slot) throw new KeyPinUnavailableError(pin_id);

  const fingerprint = await owner_key_fingerprint(armored_public_key);

  await with_contact_lock(slot, async () => {
    await write_contact_entry(OWNER_KEY_PIN_PREFIX, slot, {
      fingerprint,
      pinned_at: Date.now(),
      ...hosted_field(slot),
    } satisfies StoredOwnerKeyPin);
    await mark_contact_reviewed(slot);
  });
}

function worst_health(reads: ContactRead<unknown>[]): RecipientPinHealth {
  if (reads.some((read) => !is_settled(read))) return "unreadable";

  return reads.some((read) => read.state === "found" && read.conflict)
    ? "conflict"
    : "settled";
}

export async function read_recipient_pins(
  pin_id: string,
): Promise<RecipientPinSnapshot> {
  const unreadable: RecipientPinSnapshot = {
    health: "unreadable",
    identity_fingerprint: null,
    owner_fingerprint: null,
    flagged: true,
    change: null,
  };

  try {
    const slot = await open_pins(pin_id);

    if (!slot) return unreadable;

    const identity = await load_identity_pin(slot);
    const owner = await load_owner_pin(slot);
    const flag = await load_untrusted_flag(slot);
    const change = await load_identity_change(slot);
    const history = await read_sender_history(slot);

    return {
      health: worst_health([identity, owner, history]),
      identity_fingerprint: settled_value(identity)?.fingerprint ?? null,
      owner_fingerprint: settled_value(owner)?.fingerprint ?? null,
      flagged: is_flag_raised(flag),
      change: settled_value(change),
    };
  } catch {
    return unreadable;
  }
}

export async function get_recipient_pin_health(
  pin_id: string,
): Promise<RecipientPinHealth> {
  if (!pin_id) return "settled";

  return (await read_recipient_pins(pin_id)).health;
}

export async function trust_recipient_keys(
  pin_id: string,
  kem_identity_key: string | null,
  armored_public_key: string | null,
  accepted_bundle: RecipientBundleBinding | null = null,
  address_rooted: boolean = false,
): Promise<void> {
  const slot = await open_pins(pin_id);

  if (!slot) throw new KeyPinUnavailableError(pin_id);

  await with_contact_lock(slot, async () => {
    const known = await load_identity_pin(slot).catch(() => null);
    const pq_seen = Boolean(known && settled_value(known)?.pq_seen);

    if (accepted_bundle) {
      await write_contact_entry(ACCEPTED_BUNDLE_PREFIX, slot, {
        fingerprint: await bundle_binding_fingerprint(accepted_bundle),
        accepted_at: Date.now(),
      } satisfies StoredAcceptedBundle);
    } else {
      await delete_contact_entry(ACCEPTED_BUNDLE_PREFIX, slot);
    }

    if (kem_identity_key) {
      await write_contact_entry(IDENTITY_PIN_PREFIX, slot, {
        fingerprint: await compute_hash(base64_to_array(kem_identity_key)),
        verified: false,
        pinned_at: Date.now(),
        pq_seen,
        ...rooted_field(address_rooted),
      } satisfies StoredIdentityPin);
    } else if (!known || worst_health([known]) !== "settled") {
      await delete_contact_entry(IDENTITY_PIN_PREFIX, slot);
    }

    if (armored_public_key) {
      await write_contact_entry(OWNER_KEY_PIN_PREFIX, slot, {
        fingerprint: await owner_key_fingerprint(armored_public_key),
        pinned_at: Date.now(),
        ...hosted_field(slot),
      } satisfies StoredOwnerKeyPin);
    } else {
      const owner = await load_owner_pin(slot).catch(() => null);

      if (!owner || worst_health([owner]) !== "settled") {
        await delete_contact_entry(OWNER_KEY_PIN_PREFIX, slot);
      }
    }

    const history = await read_sender_history(slot).catch(() => null);

    if (!history || !is_settled(history)) {
      await write_contact_entry(
        SENDER_HISTORY_PREFIX,
        slot,
        kem_identity_key ? [kem_identity_key] : [],
      );
    }

    await delete_contact_entry(IDENTITY_CHANGE_PREFIX, slot);
    await delete_contact_entry(IDENTITY_UNTRUSTED_PREFIX, slot);
    await mark_contact_reviewed(slot);
  });

  dismiss_peer_identity_event(pin_id);
}

export async function has_peer_advertised_pq(pin_id: string): Promise<boolean> {
  try {
    if (!pin_id) return false;

    const slot = await open_pins(pin_id);

    if (!slot) return false;

    return settled_value(await load_identity_pin(slot))?.pq_seen === true;
  } catch {
    return false;
  }
}

export async function lookup_identity_pin_record(
  pin_id: string,
): Promise<IdentityPinLookup> {
  try {
    const slot = await open_pins(pin_id);

    if (!slot) return "unreadable";

    const read = await load_identity_pin(slot);

    if (!is_settled(read)) return "unreadable";
    if (read.state === "absent") return null;

    return {
      fingerprint: read.value.fingerprint,
      rotated: read.value.rotated === true || read.conflict,
      address_rooted: read.value.address_rooted === true,
    };
  } catch {
    return "unreadable";
  }
}

export async function lookup_pinned_identity(
  pin_id: string,
): Promise<PinnedIdentity | null> {
  try {
    const slot = await open_pins(pin_id);

    if (!slot) return null;

    const read = await load_identity_pin(slot);

    if (!is_settled(read)) return null;

    return {
      id: slot.contact.id,
      fingerprint: settled_value(read)?.fingerprint ?? null,
    };
  } catch {
    return null;
  }
}

export async function get_identity_change(
  pin_id: string,
): Promise<IdentityChangeRecord | null> {
  try {
    if (!pin_id) return null;

    const slot = await open_pins(pin_id);

    return slot ? settled_value(await load_identity_change(slot)) : null;
  } catch {
    return null;
  }
}

export async function acknowledge_identity_change(
  pin_id: string,
): Promise<void> {
  if (!pin_id) return;

  const slot = await open_pins(pin_id);

  if (!slot) throw new KeyPinUnavailableError(pin_id);

  await with_contact_lock(slot, async () => {
    await delete_contact_entry(IDENTITY_CHANGE_PREFIX, slot);

    const read = await load_identity_pin(slot).catch(() => null);

    if (!read || read.state !== "found" || read.conflict) return;
    if (!read.value.rotated) return;

    await write_contact_entry(IDENTITY_PIN_PREFIX, slot, {
      fingerprint: read.value.fingerprint,
      verified: read.value.verified,
      pinned_at: read.value.pinned_at,
      pq_seen: read.value.pq_seen,
    } satisfies StoredIdentityPin);
  });

  dismiss_peer_identity_event(pin_id);
}

export async function reset_identity_pin(pin_id: string): Promise<void> {
  try {
    const slot = await open_pins(pin_id);

    if (!slot) return;

    for (const prefix of PIN_PREFIXES) {
      await delete_contact_entry(prefix, slot);
    }
  } catch {
    /* best-effort */
  }
}
