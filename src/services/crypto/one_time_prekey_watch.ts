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
import { array_to_base64 } from "./base64";
import { encrypted_get, encrypted_set } from "./encrypted_storage";
import { has_vault_in_memory } from "./memory_key_store";
import { load_storage_write_key_bytes } from "./storage_write_key";

const PEER_STORE_PREFIX = "one_time_prekey_peers_";
const PEER_TAG_BYTES = 16;
const MAX_TRACKED_PEERS = 5000;

export const ONE_TIME_PREKEY_GRACE_MS = 6 * 60 * 60 * 1000;

export type OneTimePrekeyVerdict =
  | "offered"
  | "never_offered"
  | "grace"
  | "withheld";

let peers = new Map<string, number>();
let loaded_scope: string | null = null;

async function current_scope(): Promise<string> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return (await get_current_account_id()) ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function storage_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;

  const master = await load_storage_write_key_bytes();

  if (!master) return null;

  try {
    return await crypto.subtle.importKey(
      "raw",
      master,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    master.fill(0);
  }
}

function absorb_stored(stored: unknown): void {
  if (!Array.isArray(stored)) return;

  for (const entry of stored) {
    if (typeof entry === "string") {
      peers.set(entry, 0);
    } else if (
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "number" &&
      Number.isFinite(entry[1])
    ) {
      peers.set(entry[0], entry[1]);
    }
  }
}

async function ensure_loaded(): Promise<string> {
  const scope = await current_scope();

  if (scope === loaded_scope) return scope;

  loaded_scope = scope;
  peers = new Map();

  try {
    const key = await storage_key();

    if (!key) return scope;

    absorb_stored(
      await encrypted_get<unknown>(`${PEER_STORE_PREFIX}${scope}`, key),
    );
  } catch {
    return scope;
  }

  return scope;
}

async function persist(scope: string): Promise<void> {
  try {
    const key = await storage_key();

    if (!key) return;

    await encrypted_set(`${PEER_STORE_PREFIX}${scope}`, [...peers], key);
  } catch {
    return;
  }
}

async function peer_tag(identity_raw: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", identity_raw),
  );

  return array_to_base64(digest.slice(0, PEER_TAG_BYTES));
}

function remember_peer(tag: string, grace_at: number): void {
  peers.delete(tag);
  peers.set(tag, grace_at);

  if (peers.size > MAX_TRACKED_PEERS) {
    const oldest = peers.keys().next().value;

    if (oldest !== undefined) peers.delete(oldest);
  }
}

export async function judge_one_time_prekey_offer(
  identity_raw: Uint8Array,
  offered: boolean,
  now: number = Date.now(),
): Promise<OneTimePrekeyVerdict> {
  const tag = await peer_tag(identity_raw);
  const scope = await ensure_loaded();
  const grace_at = peers.get(tag);

  if (offered) {
    if (grace_at === undefined) {
      remember_peer(tag, 0);
      await persist(scope);
    }

    return "offered";
  }

  if (grace_at === undefined) return "never_offered";

  if (grace_at > now || now - grace_at >= ONE_TIME_PREKEY_GRACE_MS) {
    remember_peer(tag, now);
    await persist(scope);

    return "grace";
  }

  return "withheld";
}

export async function start_with_fresh_bundle_once<B, T>(
  bundle: B,
  start: (candidate: B) => Promise<T>,
  refetch: () => Promise<B | null>,
  same_peer: (first: B, fresh: B) => boolean,
  withheld: (started: T) => boolean,
  offers_one_time_prekey: (candidate: B) => boolean,
): Promise<{ started: T; bundle: B; withheld: boolean }> {
  const started = await start(bundle);

  if (!withheld(started)) return { started, bundle, withheld: false };

  let fresh: B | null = null;

  try {
    fresh = await refetch();
  } catch {
    fresh = null;
  }

  if (!fresh || !same_peer(bundle, fresh) || !offers_one_time_prekey(fresh)) {
    return { started, bundle, withheld: true };
  }

  const retried = await start(fresh);

  return { started: retried, bundle: fresh, withheld: withheld(retried) };
}
