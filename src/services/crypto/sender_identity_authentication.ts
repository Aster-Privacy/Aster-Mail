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
import { encrypted_get, encrypted_set } from "./encrypted_storage";
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

import { extract_username_from_email } from "@/services/api/keys";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

const PUBLISHED_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_STORAGE_PREFIX = "ratchet_sender_identity_history_";
const MAX_REMEMBERED_IDENTITIES = 12;

interface PublishedCacheEntry {
  identity_key: string | null;
  timestamp: number;
}

interface PublishedHistoryCacheEntry {
  history: PublishedIdentityHistory | null;
  timestamp: number;
}

const published_cache = new Map<string, PublishedCacheEntry>();
const published_history_cache = new Map<string, PublishedHistoryCacheEntry>();
const status_cache = new Map<string, SenderIdentityStatus>();
const history_cache = new Map<string, string[]>();

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

async function load_identity_history(peer: string): Promise<string[]> {
  const cached = history_cache.get(peer);

  if (cached) return cached;

  try {
    const storage_key = await history_storage_key();

    if (!storage_key) return [];

    const stored = await encrypted_get<string[]>(
      `${HISTORY_STORAGE_PREFIX}${peer}`,
      storage_key,
    );

    const history = Array.isArray(stored) ? stored : [];

    history_cache.set(peer, history);

    return history;
  } catch {
    return [];
  }
}

async function remember_identity(
  peer: string,
  identity_key: string,
): Promise<void> {
  if (!identity_key) return;

  try {
    const history = await load_identity_history(peer);

    if (history.includes(identity_key)) return;

    const next = [identity_key, ...history].slice(0, MAX_REMEMBERED_IDENTITIES);

    history_cache.set(peer, next);

    const storage_key = await history_storage_key();

    if (!storage_key) return;

    await encrypted_set(`${HISTORY_STORAGE_PREFIX}${peer}`, next, storage_key);
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

  return history;
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

  const published = await resolve_published_identity(peer);
  const published_history = await resolve_published_history(peer);

  const published_confirms =
    Boolean(published) && published === sender_identity_key;
  const history_confirms = Boolean(
    published_history?.identity_keys.includes(sender_identity_key),
  );

  if (published_confirms || history_confirms) {
    await remember_identity(peer, sender_identity_key);

    status_cache.set(peer, "verified");

    return "verified";
  }

  const status: SenderIdentityStatus = published_history?.history_complete
    ? "mismatch"
    : "unverified";

  status_cache.set(peer, status);

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
}
