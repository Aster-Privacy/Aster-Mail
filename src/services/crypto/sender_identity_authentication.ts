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
import {
  record_message_sender_identity,
  type SenderIdentityStatus,
} from "./ratchet_verification_status";
import {
  MAX_REMEMBERED_IDENTITIES,
  lookup_identity_pin_record,
  open_pin_contact,
  read_sender_history,
} from "./ratchet_identity_pin";
import { base64_to_array, compute_hash } from "./key_manager_core";
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

function bound_peer_caches(): void {
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
): Promise<SenderIdentityStatus> {
  if (refresh) {
    published_cache.delete(peer.address);
    published_history_cache.delete(peer.address);
  }

  const published = await resolve_published_identity(peer.address);
  const published_history = await resolve_published_history(peer.address);

  const published_confirms =
    Boolean(published) && published === sender_identity_key;
  const history_confirms = Boolean(
    published_history?.identity_keys.includes(sender_identity_key),
  );

  if (published_confirms || history_confirms) {
    return (await remember_identity(peer, sender_identity_key)) === "refused"
      ? "unverified"
      : "verified";
  }

  return published_history?.history_complete ? "mismatch" : "unverified";
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

export async function authenticate_sender_identity(
  sender_email: string,
  sender_identity_key: string,
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

  let status = await resolve_directory_status(peer, sender_identity_key, false);

  if (status !== "verified" && claim_directory_refresh(peer.address)) {
    status = await resolve_directory_status(peer, sender_identity_key, true);
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

export function note_message_sender_identity(
  message_key: string,
  sender_email: string,
): void {
  if (!message_key) return;

  record_message_sender_identity(
    message_key,
    peek_sender_identity_status(sender_email) ?? "unverified",
  );
}

export function clear_sender_identity_authentication_cache(): void {
  published_cache.clear();
  published_history_cache.clear();
  status_cache.clear();
  refresh_cache.clear();
}
