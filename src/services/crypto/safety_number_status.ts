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
import { SAFETY_NUMBER_VERIFIED_PREFIX } from "./storage_key_names";
import {
  delete_contact_entry,
  open_contact,
  read_contact_entry,
  with_contact_lock,
  write_contact_entry,
  type ContactSlot,
} from "./contact_entries";
import {
  check_owner_key_pin,
  lookup_owner_key_pin,
  owner_key_fingerprint,
} from "./ratchet_identity_pin";
import { compute_safety_number, hex_fingerprint_bytes } from "./safety_number";
import { get_vault_from_memory } from "./memory_key_store";
import { held_public_key_armored } from "./ensure_pgp_key_published";

import { api_client } from "@/services/api/client";
import {
  extract_username_from_email,
  get_recipient_public_key,
} from "@/services/api/keys";

export type SafetyNumberState = "unverified" | "verified" | "changed";

export interface SafetyNumberView {
  email: string;
  groups: string[];
  state: SafetyNumberState;
  own_fingerprint: string;
  contact_fingerprint: string;
  unpinned_key: string | null;
}

interface StoredVerification {
  own_fingerprint: string;
  contact_fingerprint: string;
  verified_at: number;
}

const listeners = new Set<(email: string) => void>();

export function subscribe_safety_number(
  listener: (email: string) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function notify(email: string): void {
  for (const listener of listeners) listener(email);
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function same_verification(
  left: StoredVerification,
  right: StoredVerification,
): boolean {
  return (
    left.own_fingerprint === right.own_fingerprint &&
    left.contact_fingerprint === right.contact_fingerprint
  );
}

let own_cache: { source: string; fingerprint: string } | null = null;

export async function own_account_fingerprint(): Promise<string | null> {
  const source = get_vault_from_memory()?.identity_key;

  if (!source) return null;
  if (own_cache?.source === source) return own_cache.fingerprint;

  try {
    const response = await api_client.get<{ public_key_armored?: unknown }>(
      "/crypto/v1/encryption/pgp-key",
    );
    const armored = response.data?.public_key_armored;

    if (typeof armored !== "string" || !armored) return null;

    const fingerprint = await owner_key_fingerprint(armored);

    if (!(await held_public_key_armored(fingerprint))) return null;

    own_cache = { source, fingerprint };

    return fingerprint;
  } catch {
    return null;
  }
}

function cached_own_fingerprint(): string | null {
  const source = get_vault_from_memory()?.identity_key;

  return source && own_cache?.source === source ? own_cache.fingerprint : null;
}

async function read_verification(
  slot: ContactSlot,
): Promise<StoredVerification | null | "unreadable"> {
  const read = await read_contact_entry<StoredVerification>(
    SAFETY_NUMBER_VERIFIED_PREFIX,
    slot,
    same_verification,
  );

  if (read.state === "absent") return null;
  if (read.state !== "found" || read.conflict) return "unreadable";

  return read.value;
}

async function pinned_contact_fingerprint(
  email: string,
): Promise<string | null | "unreadable"> {
  const pin = await lookup_owner_key_pin(email);

  if (pin === "unreadable") return "unreadable";
  if (!pin) return null;

  return pin.conflict ? "unreadable" : pin.fingerprint;
}

function state_of(
  record: StoredVerification | null,
  own_fingerprint: string,
  contact_fingerprint: string,
): SafetyNumberState {
  if (!record) return "unverified";

  return record.own_fingerprint === own_fingerprint &&
    record.contact_fingerprint === contact_fingerprint
    ? "verified"
    : "changed";
}

export async function read_safety_number_state(
  raw_email: string,
): Promise<SafetyNumberState | null> {
  const email = normalize(raw_email);

  try {
    const slot = await open_contact(email);

    if (!slot) return null;

    const record = await read_verification(slot);

    if (record === "unreadable") return null;
    if (!record) return "unverified";

    const pinned = await pinned_contact_fingerprint(email);

    if (pinned === "unreadable") return null;
    if (!pinned) return "unverified";

    const own = cached_own_fingerprint() ?? record.own_fingerprint;

    return state_of(record, own, pinned);
  } catch {
    return null;
  }
}

export async function load_safety_number(
  raw_email: string,
): Promise<SafetyNumberView | null> {
  const email = normalize(raw_email);
  const username = extract_username_from_email(email);

  if (!username) return null;

  try {
    const response = await get_recipient_public_key(username, email);
    const published = response.data;

    if (!published?.public_key || published.internal !== true) return null;

    const [own, pinned, slot] = await Promise.all([
      own_account_fingerprint(),
      pinned_contact_fingerprint(email),
      open_contact(email),
    ]);

    if (!own || pinned === "unreadable" || !slot) return null;

    const contact_fingerprint =
      pinned ?? (await owner_key_fingerprint(published.public_key));
    const own_bytes = hex_fingerprint_bytes(own);
    const contact_bytes = hex_fingerprint_bytes(contact_fingerprint);

    if (!own_bytes || !contact_bytes) return null;

    const record = await read_verification(slot);

    if (record === "unreadable") return null;

    return {
      email,
      groups: await compute_safety_number(own_bytes, contact_bytes),
      state: state_of(record, own, contact_fingerprint),
      own_fingerprint: own,
      contact_fingerprint,
      unpinned_key: pinned ? null : published.public_key,
    };
  } catch {
    return null;
  }
}

export async function mark_safety_number_verified(
  view: SafetyNumberView,
): Promise<boolean> {
  try {
    if (view.unpinned_key) {
      const status = await check_owner_key_pin(view.email, view.unpinned_key);

      if (status !== "first" && status !== "ok") return false;
    }

    if (
      (await pinned_contact_fingerprint(view.email)) !==
      view.contact_fingerprint
    ) {
      return false;
    }
    if ((await own_account_fingerprint()) !== view.own_fingerprint) {
      return false;
    }

    const slot = await open_contact(view.email);

    if (!slot) return false;

    await with_contact_lock(slot, () =>
      write_contact_entry(SAFETY_NUMBER_VERIFIED_PREFIX, slot, {
        own_fingerprint: view.own_fingerprint,
        contact_fingerprint: view.contact_fingerprint,
        verified_at: Date.now(),
      } satisfies StoredVerification),
    );
  } catch {
    return false;
  }

  notify(view.email);

  return true;
}

export async function clear_safety_number_verification(
  raw_email: string,
): Promise<boolean> {
  const email = normalize(raw_email);

  try {
    const slot = await open_contact(email);

    if (!slot) return false;

    await with_contact_lock(slot, () =>
      delete_contact_entry(SAFETY_NUMBER_VERIFIED_PREFIX, slot),
    );
  } catch {
    return false;
  }

  notify(email);

  return true;
}
