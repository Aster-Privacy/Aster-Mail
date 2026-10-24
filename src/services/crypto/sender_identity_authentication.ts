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
import {
  SENDER_HISTORY_PREFIX,
  scoped_get,
  scoped_set,
} from "./storage_key_names";
import { get_derived_encryption_key } from "./memory_key_store";
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
import { get_identity_pin_record } from "./ratchet_identity_pin";
import { base64_to_array, compute_hash } from "./key_manager_core";

import { extract_username_from_email } from "@/services/api/keys";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

const PUBLISHED_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REMEMBERED_IDENTITIES = 12;

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
const history_cache = new Map<string, string[]>();

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
  trim_map_to_size(history_cache, MAX_PEER_CACHE);
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

async function current_account_uid(): Promise<string | null> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return await get_current_account_id();
  } catch {
    return null;
  }
}

function history_key_for(uid: string | null, peer: string): string {
  return `${uid ?? ""}\u0000${peer}`;
}

async function history_storage_key(): Promise<CryptoKey | null> {
  try {
    const key_bytes = get_derived_encryption_key();

    if (!key_bytes) return null;

    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_bytes,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    zero_uint8_array(key_bytes);

    return crypto_key;
  } catch {
    return null;
  }
}

async function read_identity_history(peer: string): Promise<string[] | null> {
  const uid = await current_account_uid();
  const cache_key = history_key_for(uid, peer);
  const cached = history_cache.get(cache_key);

  if (cached) return cached;

  try {
    const storage_key = await history_storage_key();

    if (!storage_key) return null;

    const stored = await scoped_get<string[]>(
      SENDER_HISTORY_PREFIX,
      uid,
      peer,
      storage_key,
    );

    const history = Array.isArray(stored) ? stored : [];

    history_cache.set(cache_key, history);

    return history;
  } catch {
    return null;
  }
}

async function load_identity_history(peer: string): Promise<string[]> {
  return (await read_identity_history(peer)) ?? [];
}

async function remember_identity(
  peer: string,
  identity_key: string,
): Promise<void> {
  if (!identity_key) return;

  try {
    const history = await read_identity_history(peer);

    if (!history || history.includes(identity_key)) return;

    const next = [identity_key, ...history].slice(0, MAX_REMEMBERED_IDENTITIES);
    const uid = await current_account_uid();
    const cache_key = history_key_for(uid, peer);

    const storage_key = await history_storage_key();

    if (!storage_key) return;

    await scoped_set(SENDER_HISTORY_PREFIX, uid, peer, next, storage_key);
    history_cache.set(cache_key, next);
  } catch {
    return;
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
  peer: string,
  sender_identity_key: string,
  refresh: boolean,
): Promise<SenderIdentityStatus> {
  if (refresh) {
    published_cache.delete(peer);
    published_history_cache.delete(peer);
  }

  const published = await resolve_published_identity(peer);
  const published_history = await resolve_published_history(peer);

  const published_confirms =
    Boolean(published) && published === sender_identity_key;
  const history_confirms = Boolean(
    published_history?.identity_keys.includes(sender_identity_key),
  );

  if (published_confirms || history_confirms) {
    const continuity = await check_sender_identity_continuity(
      peer,
      sender_identity_key,
    );

    if (continuity !== "changed") {
      await remember_identity(peer, sender_identity_key);
    }

    return "verified";
  }

  return published_history?.history_complete ? "mismatch" : "unverified";
}

export type SenderIdentityContinuity = "known" | "new" | "changed";

async function matches_pinned_identity(
  peer: string,
  sender_identity_key: string,
): Promise<boolean | null> {
  try {
    const pinned = await get_identity_pin_record(peer);

    if (!pinned) return null;
    if (pinned.rotated) return false;

    const fingerprint = await compute_hash(
      base64_to_array(sender_identity_key),
    );

    return pinned.fingerprint === fingerprint;
  } catch {
    return null;
  }
}

export async function check_sender_identity_continuity(
  sender_email: string,
  sender_identity_key: string,
): Promise<SenderIdentityContinuity> {
  if (!sender_email || !sender_identity_key) return "new";

  const peer = sender_email.toLowerCase();
  const remembered = await load_identity_history(peer);

  if (remembered.includes(sender_identity_key)) return "known";

  const pinned = await matches_pinned_identity(peer, sender_identity_key);

  if (pinned === true) return "known";

  return remembered.length > 0 || pinned === false ? "changed" : "new";
}

export async function authenticate_sender_identity(
  sender_email: string,
  sender_identity_key: string,
): Promise<SenderIdentityStatus> {
  if (!sender_email || !sender_identity_key) return "unverified";

  const peer = sender_email.toLowerCase();

  const remembered = await load_identity_history(peer);

  if (remembered.includes(sender_identity_key)) {
    status_cache.set(peer, "verified");

    return "verified";
  }

  let status = await resolve_directory_status(peer, sender_identity_key, false);

  if (status !== "verified" && claim_directory_refresh(peer)) {
    status = await resolve_directory_status(peer, sender_identity_key, true);
  }

  status_cache.set(peer, status);
  bound_peer_caches();

  return status;
}

export function peek_sender_identity_status(
  sender_email: string,
): SenderIdentityStatus | null {
  if (!sender_email) return null;

  return status_cache.get(sender_email.toLowerCase()) ?? null;
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
  history_cache.clear();
  refresh_cache.clear();
}
