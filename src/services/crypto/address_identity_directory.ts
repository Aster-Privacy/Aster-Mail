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
import type { EncryptedVault } from "./key_manager";

import { api_client } from "../api/client";

import {
  address_entry_forms,
  matches_local_address_keys,
  sign_address_entry,
  verify_address_entry,
  type AddressEntryKeys,
} from "./address_identity_entry";
import { normalize_identity_address } from "./address_sender_identity";
import { base64_to_array, compute_hash } from "./key_manager_core";
import {
  lookup_identity_pin_record,
  lookup_owner_key_pin,
} from "./ratchet_identity_pin";
import {
  fetch_prekey_bundle,
  fetch_ratchet_identity,
} from "./ratchet_prekey_bundle";
import { type PrekeyBundle } from "./x3dh";

const ADDRESS_BUNDLE_PATH = "/crypto/v1/ratchet/address-bundle";
const IDENTITY_LOOKUP_PATH = "/crypto/v1/ratchet/identity";
const INACTIVE_RETRY_MS = 10 * 60 * 1000;
const ACTIVE_REFRESH_MS = 6 * 60 * 60 * 1000;

export type DirectoryTrust =
  | "account"
  | "entry"
  | "endorsed"
  | "replaced"
  | "invalid"
  | "downgraded";

export interface DirectoryEntry extends AddressEntryKeys {
  address_scoped?: boolean | null;
}

export interface ResolvedDirectoryEntry<T extends DirectoryEntry> {
  entry: T;
  scoped: boolean;
  trust: DirectoryTrust;
}

export type AddressEntryState = "active" | "inactive" | "failed";

export type AddressSendState =
  "active" | "inactive" | "mismatch" | "unavailable";

export type OwnAddressEntryLookup =
  | { status: "active"; entry: AddressEntryKeys }
  | { status: "none" }
  | { status: "unavailable" };

interface OwnIdentityResponse extends AddressEntryKeys {
  address_scoped?: boolean | null;
}

interface PublishedState {
  fingerprint: string;
  state: AddressEntryState;
  retry_at: number;
}

interface UploadOutcome {
  state: AddressEntryState;
  retry_ms: number;
}

interface AddressBundleUploadResult {
  success: boolean;
  active: boolean;
}

const published_states = new Map<string, PublishedState>();
const publishing = new Map<string, Promise<AddressEntryState>>();
let unsupported_until = 0;

export function clear_address_identity_directory_state(): void {
  published_states.clear();
  publishing.clear();
  unsupported_until = 0;
}

function vault_fingerprint(vault: EncryptedVault): string {
  return [
    vault.ratchet_identity_public ?? "",
    vault.ratchet_signed_prekey_public ?? "",
    vault.ratchet_pq_identity_public ?? "",
    (vault.ratchet_previous_keys ?? []).length,
  ].join("|");
}

async function upload_address_entry(
  vault: EncryptedVault,
  form: string,
): Promise<UploadOutcome> {
  const entry = sign_address_entry(vault, form);

  if (!entry) return { state: "failed", retry_ms: 0 };

  const response = await api_client.put<AddressBundleUploadResult>(
    ADDRESS_BUNDLE_PATH,
    {
      address: entry.address,
      kem_identity_key: entry.kem_identity_key,
      signed_prekey: entry.signed_prekey,
      signed_prekey_signature: entry.signed_prekey_signature,
      pq_kem_public_key: entry.pq_kem_public_key ?? null,
    },
  );

  if (response.status === 404 || response.status === 405) {
    unsupported_until = Date.now() + INACTIVE_RETRY_MS;

    return { state: "inactive", retry_ms: INACTIVE_RETRY_MS };
  }

  if (response.error || !response.data) {
    const rejected =
      typeof response.status === "number" &&
      response.status >= 400 &&
      response.status < 500;

    return rejected
      ? { state: "inactive", retry_ms: INACTIVE_RETRY_MS }
      : { state: "failed", retry_ms: 0 };
  }

  return response.data.active === true
    ? { state: "active", retry_ms: ACTIVE_REFRESH_MS }
    : { state: "inactive", retry_ms: INACTIVE_RETRY_MS };
}

async function publish_address_forms(
  vault: EncryptedVault,
  address: string,
  fingerprint: string,
): Promise<AddressEntryState> {
  const [exact, ...others] = address_entry_forms(address);

  if (!exact) return "inactive";

  let result: UploadOutcome;

  try {
    result = await upload_address_entry(vault, exact);

    for (const form of others) {
      if (Date.now() < unsupported_until) break;

      await upload_address_entry(vault, form).catch(() => null);
    }
  } catch {
    result = { state: "failed", retry_ms: 0 };
  }

  if (result.state === "failed") {
    published_states.delete(exact);

    return "failed";
  }

  published_states.set(exact, {
    fingerprint,
    state: result.state,
    retry_at: Date.now() + result.retry_ms,
  });

  return result.state;
}

export async function address_entry_state(
  vault: EncryptedVault,
  address: string,
): Promise<AddressEntryState> {
  const exact = normalize_identity_address(address);

  if (!exact || !vault.ratchet_identity_key) return "failed";

  const fingerprint = vault_fingerprint(vault);
  const known = published_states.get(exact);

  if (known && known.fingerprint === fingerprint && Date.now() < known.retry_at) {
    return known.state;
  }

  if (Date.now() < unsupported_until) return "inactive";

  const in_flight = publishing.get(exact);

  if (in_flight) return in_flight;

  const started = publish_address_forms(vault, exact, fingerprint).finally(
    () => {
      publishing.delete(exact);
    },
  );

  publishing.set(exact, started);

  return started;
}

export async function ensure_address_entry(
  vault: EncryptedVault,
  address: string,
): Promise<boolean> {
  return (await address_entry_state(vault, address)) === "active";
}

export async function lookup_own_address_entry(
  username: string,
  address: string,
): Promise<OwnAddressEntryLookup> {
  const email = normalize_identity_address(address);

  if (!username || !email) return { status: "unavailable" };

  try {
    const response = await api_client.get<OwnIdentityResponse>(
      `${IDENTITY_LOOKUP_PATH}/${encodeURIComponent(username)}?email=${encodeURIComponent(email)}&scope=address`,
    );

    if (response.status === 404 || response.code === "NOT_FOUND") {
      return { status: "none" };
    }

    const data = response.data;

    if (response.error || !data || typeof data.kem_identity_key !== "string") {
      return { status: "unavailable" };
    }

    if (data.address_scoped !== true) return { status: "none" };

    return { status: "active", entry: data };
  } catch {
    return { status: "unavailable" };
  }
}

export async function resolve_address_send_state(
  vault: EncryptedVault,
  address: string,
  username: string | null,
): Promise<AddressSendState> {
  const state = await address_entry_state(vault, address).catch(
    (): AddressEntryState => "failed",
  );

  if (state !== "failed") return state;

  const lookup = username
    ? await lookup_own_address_entry(username, address)
    : ({ status: "unavailable" } as const);

  if (lookup.status === "unavailable") return "unavailable";
  if (lookup.status === "none") return "inactive";

  return matches_local_address_keys(vault, address, lookup.entry)
    ? "active"
    : "mismatch";
}

export async function publish_address_entries(
  vault: EncryptedVault,
  addresses: string[],
): Promise<void> {
  const unique = new Set(
    addresses.map(normalize_identity_address).filter(Boolean),
  );

  for (const address of unique) {
    if (Date.now() < unsupported_until) return;

    await ensure_address_entry(vault, address).catch(() => false);
  }
}

async function fingerprint_of(public_key: string): Promise<string> {
  return compute_hash(base64_to_array(public_key));
}

async function is_address_rooted(pin_id: string): Promise<boolean> {
  try {
    const pin = await lookup_identity_pin_record(pin_id);

    return pin !== null && pin !== "unreadable" && pin.address_rooted;
  } catch {
    return false;
  }
}

async function classify_scoped_entry(
  pin_id: string,
  entry: DirectoryEntry,
  session_identity: string | undefined,
): Promise<DirectoryTrust | "unreadable"> {
  const pin = await lookup_identity_pin_record(pin_id);

  if (pin === "unreadable") return "unreadable";

  const verification = verify_address_entry(pin_id, entry);

  if (!verification.valid) {
    return pin?.address_rooted ? "invalid" : "account";
  }

  if (pin === null) {
    if (session_identity) {
      return session_identity === entry.kem_identity_key ? "entry" : "account";
    }

    const owner_pin = await lookup_owner_key_pin(pin_id);

    return owner_pin === null ? "entry" : "account";
  }

  if (pin.fingerprint === (await fingerprint_of(entry.kem_identity_key))) {
    return "entry";
  }

  for (const endorser of verification.endorsers) {
    if ((await fingerprint_of(endorser)) === pin.fingerprint) {
      return "endorsed";
    }
  }

  return pin.address_rooted ? "replaced" : "account";
}

async function resolve_directory_entry<T extends DirectoryEntry>(
  email: string | undefined,
  fetch_entry: (address_scope: boolean) => Promise<T | null>,
  session_identity?: string,
): Promise<ResolvedDirectoryEntry<T> | null> {
  const pin_id = normalize_identity_address(email ?? "");

  if (!pin_id) {
    const account = await fetch_entry(false);

    return account ? { entry: account, scoped: false, trust: "account" } : null;
  }

  const first = await fetch_entry(true);

  if (!first) return null;

  if (first.address_scoped !== true) {
    return {
      entry: first,
      scoped: false,
      trust: (await is_address_rooted(pin_id)) ? "downgraded" : "account",
    };
  }

  let trust: DirectoryTrust | "unreadable";

  try {
    trust = await classify_scoped_entry(pin_id, first, session_identity);
  } catch {
    trust = "unreadable";
  }

  if (trust === "account" || trust === "unreadable") {
    const account = await fetch_entry(false);

    if (!account || account.address_scoped === true) return null;

    return { entry: account, scoped: false, trust: "account" };
  }

  return { entry: first, scoped: true, trust };
}

export function resolve_recipient_identity(
  username: string,
  email: string | undefined,
  session_identity?: string,
) {
  return resolve_directory_entry(
    email,
    (address_scope) => fetch_ratchet_identity(username, email, address_scope),
    session_identity,
  );
}

export function resolve_recipient_bundle(
  username: string,
  email: string | undefined,
  session_identity?: string,
): Promise<ResolvedDirectoryEntry<PrekeyBundle> | null> {
  return resolve_directory_entry(
    email,
    (address_scope) => fetch_prekey_bundle(username, email, address_scope),
    session_identity,
  );
}

export function is_directory_trust_rejected(trust: DirectoryTrust): boolean {
  return trust === "replaced" || trust === "downgraded" || trust === "invalid";
}
