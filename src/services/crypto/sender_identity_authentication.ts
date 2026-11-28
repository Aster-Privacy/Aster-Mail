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
import { drop_expired_entries, trim_map_to_size } from "@/lib/bounded_map";
import { SENDER_HISTORY_PREFIX } from "./storage_key_names";
import {
  fetch_prekey_bundle,
  fetch_published_identity_history,
  fetch_ratchet_identity,
  type PublishedIdentityHistory,
} from "./ratchet_prekey_bundle";
import { verify_address_entry } from "./address_identity_entry";
import {
  history_standing,
  received_at_us,
  standing_confirms,
  type PublishedIdentityEntry,
  type SenderKeyStanding,
} from "./sender_key_retirement";
import {
  dismiss_peer_identity_event,
  get_message_sender_identity,
  record_message_sender_identity,
  type SenderIdentityStatus,
} from "./ratchet_verification_status";
import {
  MAX_REMEMBERED_IDENTITIES,
  adopt_endorsed_identity_in_lock,
  lookup_identity_pin_record,
  open_pin_contact,
  read_sender_history,
} from "./ratchet_identity_pin";
import { base64_to_array, compute_hash } from "./key_manager_core";
import { is_address_identity_mode_enabled } from "./crypto_enforcement_policy";
import {
  with_contact_lock,
  write_contact_entry,
  type ContactSlot,
} from "./contact_entries";

import { extract_username_from_email } from "@/services/api/keys";

const PUBLISHED_CACHE_TTL_MS = 5 * 60 * 1000;

interface SenderPeer {
  address: string;
  slot: ContactSlot | null;
}

interface PublishedCacheEntry {
  identity_key: string | null;
  timestamp: number;
}

interface PublishedHistoryCacheEntry {
  history: PublishedIdentityHistory | null;
  timestamp: number;
}

const MAX_PEER_CACHE = 2000;
const published_cache = new Map<string, PublishedCacheEntry>();
const published_history_cache = new Map<string, PublishedHistoryCacheEntry>();
const status_cache = new Map<string, SenderIdentityStatus>();
const refresh_cache = new Map<string, number>();
interface AddressEntryKeys {
  current: string | null;
  entries: PublishedIdentityEntry[];
}

const address_entry_cache = new Map<
  string,
  AddressEntryKeys & { timestamp: number }
>();

function bound_peer_caches(): void {
  if (address_entry_cache.size > MAX_PEER_CACHE) {
    drop_expired_entries(address_entry_cache, PUBLISHED_CACHE_TTL_MS);
    trim_map_to_size(address_entry_cache, MAX_PEER_CACHE);
  }
  if (published_cache.size > MAX_PEER_CACHE) {
    drop_expired_entries(published_cache, PUBLISHED_CACHE_TTL_MS);
    trim_map_to_size(published_cache, MAX_PEER_CACHE);
  }
  if (published_history_cache.size > MAX_PEER_CACHE) {
    drop_expired_entries(published_history_cache, PUBLISHED_CACHE_TTL_MS);
    trim_map_to_size(published_history_cache, MAX_PEER_CACHE);
  }
  trim_map_to_size(status_cache, MAX_PEER_CACHE);
  trim_map_to_size(refresh_cache, MAX_PEER_CACHE);
}

export class SenderIdentityUnverifiedError extends Error {
  readonly sender_email: string;
  readonly status: SenderIdentityStatus;

  constructor(sender_email: string, status: SenderIdentityStatus) {
    super(`sender identity ${status} for ${sender_email}`);
    this.name = "SenderIdentityUnverifiedError";
    this.sender_email = sender_email;
    this.status = status;
  }
}

export class AccountBindingRefusedError extends SenderIdentityUnverifiedError {
  constructor(sender_email: string) {
    super(sender_email, "mismatch");
    this.name = "AccountBindingRefusedError";
  }
}

async function resolve_sender_peer(sender_email: string): Promise<SenderPeer> {
  const address = sender_email.trim().toLowerCase();

  return {
    address,
    slot: await open_pin_contact(address).catch(() => null),
  };
}

type RememberOutcome = "stored" | "present" | "refused";

async function remember_identity(
  peer: SenderPeer,
  identity_key: string,
): Promise<RememberOutcome> {
  const slot = peer.slot;

  if (!slot || !identity_key) return "refused";

  try {
    return await with_contact_lock(slot, async () => {
      const continuity = await resolve_continuity(peer, identity_key);

      if (continuity !== "known" && continuity !== "new") return "refused";

      const history = await read_sender_history(slot);

      if (history.state !== "found" && history.state !== "absent") {
        return "refused";
      }

      const remembered = history.state === "found" ? history.value : [];

      if (remembered.includes(identity_key)) return "present";

      await write_contact_entry(
        SENDER_HISTORY_PREFIX,
        slot,
        [identity_key, ...remembered].slice(0, MAX_REMEMBERED_IDENTITIES),
      );

      return "stored";
    });
  } catch {
    return "refused";
  }
}

async function resolve_published_identity(
  peer: string,
): Promise<string | null> {
  const cached = published_cache.get(peer);

  if (cached && Date.now() - cached.timestamp < PUBLISHED_CACHE_TTL_MS) {
    return cached.identity_key;
  }

  const username = extract_username_from_email(peer);

  if (!username) return null;

  let identity_key: string | null = null;

  try {
    const identity = await fetch_ratchet_identity(username, peer);

    identity_key = identity?.kem_identity_key ?? null;

    if (!identity_key) {
      const bundle = await fetch_prekey_bundle(username, peer);

      identity_key = bundle?.kem_identity_key ?? null;
    }
  } catch {
    identity_key = null;
  }

  published_cache.set(peer, { identity_key, timestamp: Date.now() });
  bound_peer_caches();

  return identity_key;
}

async function resolve_published_history(
  peer: string,
): Promise<PublishedIdentityHistory | null> {
  const cached = published_history_cache.get(peer);

  if (cached && Date.now() - cached.timestamp < PUBLISHED_CACHE_TTL_MS) {
    return cached.history;
  }

  const username = extract_username_from_email(peer);

  if (!username) return null;

  let history: PublishedIdentityHistory | null = null;

  try {
    history = await fetch_published_identity_history(username, peer);
  } catch {
    history = null;
  }

  published_history_cache.set(peer, { history, timestamp: Date.now() });
  bound_peer_caches();

  return history;
}

async function resolve_address_entry_keys(
  peer: string,
): Promise<AddressEntryKeys> {
  const none: AddressEntryKeys = { current: null, entries: [] };

  if (!is_address_identity_mode_enabled()) return none;

  const cached = address_entry_cache.get(peer);

  if (cached && Date.now() - cached.timestamp < PUBLISHED_CACHE_TTL_MS) {
    return cached;
  }

  const username = extract_username_from_email(peer);

  if (!username) return none;

  let keys = none;

  try {
    const entry = await fetch_ratchet_identity(username, peer, true);

    if (entry?.address_scoped === true) {
      const history = await fetch_published_identity_history(
        username,
        peer,
        true,
      );

      keys = {
        current: entry.kem_identity_key || null,
        entries: history?.address_scoped === true ? history.entries : [],
      };
    }
  } catch {
    keys = none;
  }

  address_entry_cache.set(peer, { ...keys, timestamp: Date.now() });
  bound_peer_caches();

  return keys;
}

function address_entry_keys(keys: AddressEntryKeys): string[] {
  return [
    ...(keys.current ? [keys.current] : []),
    ...keys.entries.flatMap((entry) =>
      entry.kem_identity_key ? [entry.kem_identity_key] : [],
    ),
  ];
}

async function key_standing(
  peer: string,
  identity_key: string,
  received_at: number | null,
): Promise<SenderKeyStanding> {
  if ((await resolve_published_identity(peer)) === identity_key) {
    return "current";
  }

  const history = await resolve_published_history(peer);
  const account = history_standing(
    identity_key,
    history?.entries ?? [],
    received_at,
  );

  if (account !== "unlisted") return account;

  const address = await resolve_address_entry_keys(peer);

  if (address.current === identity_key) return "current";

  const scoped = history_standing(identity_key, address.entries, received_at);

  if (scoped !== "unlisted") return scoped;

  return history ? "unlisted" : "unavailable";
}

export async function sender_key_standing(
  sender_email: string,
  sender_identity_key: string,
  sent_at: number | undefined,
): Promise<SenderKeyStanding> {
  if (!sender_email.includes("@") || !sender_identity_key) {
    return "unavailable";
  }

  return key_standing(
    sender_email.trim().toLowerCase(),
    sender_identity_key,
    received_at_us(sent_at),
  );
}

function claim_directory_refresh(peer: string): boolean {
  const last = refresh_cache.get(peer);

  if (last !== undefined && Date.now() - last < PUBLISHED_CACHE_TTL_MS) {
    return false;
  }

  refresh_cache.set(peer, Date.now());

  return true;
}

async function resolve_directory_status(
  peer: SenderPeer,
  sender_identity_key: string,
  refresh: boolean,
  received_at: number | null,
): Promise<SenderIdentityStatus> {
  if (refresh) {
    published_cache.delete(peer.address);
    published_history_cache.delete(peer.address);
    address_entry_cache.delete(peer.address);
  }

  const standing = await key_standing(
    peer.address,
    sender_identity_key,
    received_at,
  );

  if (standing_confirms(standing)) {
    return (await remember_identity(peer, sender_identity_key)) === "refused"
      ? "unverified"
      : "verified";
  }

  if (standing !== "unlisted") return "unverified";

  return (await resolve_published_history(peer.address))?.history_complete
    ? "mismatch"
    : "unverified";
}

export type SenderIdentityContinuity =
  | "known"
  | "new"
  | "changed"
  | "superseded"
  | "unreadable";

async function resolve_continuity(
  peer: SenderPeer,
  sender_identity_key: string,
): Promise<SenderIdentityContinuity> {
  const slot = peer.slot;

  if (!slot) return "unreadable";

  try {
    const pinned = await lookup_identity_pin_record(peer.address);

    if (pinned === "unreadable") return "unreadable";

    const history = await read_sender_history(slot);

    if (history.state !== "found" && history.state !== "absent") {
      return "unreadable";
    }

    const remembered = history.state === "found" ? history.value : [];

    if (pinned) {
      if (pinned.rotated) return "changed";

      const fingerprint = await compute_hash(
        base64_to_array(sender_identity_key),
      );

      if (pinned.fingerprint === fingerprint) return "known";

      return remembered.includes(sender_identity_key)
        ? "superseded"
        : "changed";
    }

    if (remembered.includes(sender_identity_key)) return "known";

    return remembered.length > 0 ? "changed" : "new";
  } catch {
    return "unreadable";
  }
}

export async function check_sender_identity_continuity(
  sender_email: string,
  sender_identity_key: string,
): Promise<SenderIdentityContinuity> {
  if (!sender_email || !sender_identity_key) return "unreadable";

  return resolve_continuity(
    await resolve_sender_peer(sender_email),
    sender_identity_key,
  );
}

async function is_endorsed_by_known_key(
  peer: SenderPeer,
  sender_identity_key: string,
  endorsers: string[],
): Promise<boolean> {
  if (!peer.slot || endorsers.length === 0) return false;

  const pinned = await lookup_identity_pin_record(peer.address);

  if (pinned === "unreadable") return false;

  if (
    pinned?.rotated &&
    pinned.fingerprint !==
      (await compute_hash(base64_to_array(sender_identity_key)))
  ) {
    return false;
  }

  if (pinned && !pinned.rotated) {
    for (const endorser of endorsers) {
      if (
        (await compute_hash(base64_to_array(endorser))) === pinned.fingerprint
      ) {
        return true;
      }
    }

    return false;
  }

  const history = await read_sender_history(peer.slot);

  if (history.state !== "found" && history.state !== "absent") return false;

  const remembered = history.state === "found" ? history.value : [];

  return endorsers.some((endorser) => remembered.includes(endorser));
}

export async function accept_endorsed_sender_rotation(
  sender_email: string,
  sender_identity_key: string,
  persist: boolean,
): Promise<boolean> {
  if (!sender_email || !sender_identity_key) return false;
  if (!is_address_identity_mode_enabled()) return false;

  const peer = await resolve_sender_peer(sender_email);
  const slot = peer.slot;
  const username = extract_username_from_email(peer.address);

  if (!slot || !username) return false;

  try {
    const entry = await fetch_ratchet_identity(username, peer.address, true);

    if (
      !entry ||
      entry.address_scoped !== true ||
      entry.kem_identity_key !== sender_identity_key
    ) {
      return false;
    }

    const verification = verify_address_entry(peer.address, entry);

    if (!verification.valid) return false;

    const accepted = await with_contact_lock(slot, async () => {
      if (!(await is_endorsed_by_known_key(
          peer,
          sender_identity_key,
          verification.endorsers,
        ))) {
        return false;
      }

      if (!persist) return true;

      if (!(await adopt_endorsed_identity_in_lock(slot, sender_identity_key))) {
        return false;
      }

      const history = await read_sender_history(slot);
      const remembered = history.state === "found" ? history.value : [];

      if (!remembered.includes(sender_identity_key)) {
        await write_contact_entry(
          SENDER_HISTORY_PREFIX,
          slot,
          [sender_identity_key, ...remembered].slice(
            0,
            MAX_REMEMBERED_IDENTITIES,
          ),
        );
      }

      return true;
    });

    if (accepted && persist) dismiss_peer_identity_event(peer.address);

    return accepted;
  } catch {
    return false;
  }
}

async function is_remembered(
  peer: SenderPeer,
  sender_identity_key: string,
): Promise<boolean> {
  if (!peer.slot) return false;

  const history = await read_sender_history(peer.slot).catch(() => null);

  return Boolean(
    history &&
      history.state === "found" &&
      history.value.includes(sender_identity_key),
  );
}

export async function has_received_sender_identity(
  sender_email: string,
  sender_identity_key: string,
): Promise<boolean> {
  if (!sender_email || !sender_identity_key) return false;

  return is_remembered(
    await resolve_sender_peer(sender_email),
    sender_identity_key,
  );
}

export async function is_sender_identity_published(
  sender_email: string,
  sender_identity_key: string,
): Promise<boolean> {
  if (!sender_email || !sender_identity_key) return false;

  const peer = sender_email.trim().toLowerCase();

  if ((await resolve_published_identity(peer)) === sender_identity_key) {
    return true;
  }

  const published_history = await resolve_published_history(peer);

  if (published_history?.identity_keys.includes(sender_identity_key)) {
    return true;
  }

  return address_entry_keys(await resolve_address_entry_keys(peer)).includes(
    sender_identity_key,
  );
}

export async function authenticate_sender_identity(
  sender_email: string,
  sender_identity_key: string,
  sent_at?: number,
): Promise<SenderIdentityStatus> {
  if (!sender_email || !sender_identity_key) return "unverified";

  const peer = await resolve_sender_peer(sender_email);
  const continuity = await resolve_continuity(peer, sender_identity_key);

  if (
    continuity === "known" &&
    (await is_remembered(peer, sender_identity_key))
  ) {
    status_cache.set(peer.address, "verified");
    bound_peer_caches();

    return "verified";
  }

  const received_at = received_at_us(sent_at);
  let status = await resolve_directory_status(
    peer,
    sender_identity_key,
    false,
    received_at,
  );

  if (status !== "verified" && claim_directory_refresh(peer.address)) {
    status = await resolve_directory_status(
      peer,
      sender_identity_key,
      true,
      received_at,
    );
  }

  status_cache.set(peer.address, status);
  bound_peer_caches();

  return status;
}

export function peek_sender_identity_status(
  sender_email: string,
): SenderIdentityStatus | null {
  if (!sender_email) return null;

  return status_cache.get(sender_email.trim().toLowerCase()) ?? null;
}

export function note_message_sender_identity(message_key: string): void {
  if (!message_key || get_message_sender_identity(message_key) !== null) return;

  record_message_sender_identity(message_key, "unverified");
}

export function clear_sender_identity_authentication_cache(): void {
  published_cache.clear();
  published_history_cache.clear();
  status_cache.clear();
  refresh_cache.clear();
  address_entry_cache.clear();
}
