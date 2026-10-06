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
  IDENTITY_CHANGE_PREFIX,
  IDENTITY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  scoped_delete,
  scoped_get,
  scoped_set,
} from "./storage_key_names";
import { get_derived_encryption_key } from "./memory_key_store";
import { base64_to_array, compute_hash } from "./key_manager_core";
import {
  dismiss_peer_identity_event,
  record_peer_identity_event,
} from "./ratchet_verification_status";
import { KeyPinUnavailableError } from "./ratchet_types";

import { load_openpgp } from "@/services/crypto/openpgp_loader";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

export type OwnerKeyPinStatus = "first" | "ok" | "changed" | "unknown";

interface StoredOwnerKeyPin {
  fingerprint: string;
  pinned_at: number;
}

interface StoredUntrustedFlag {
  flagged_at: number;
}

export type IdentityPinStatus =
  "first" | "ok" | "rotated" | "drift" | "unknown";

interface StoredIdentityPin {
  fingerprint: string;
  verified: boolean;
  pinned_at: number;
  pq_seen?: boolean;
}

export interface IdentityChangeRecord {
  previous_fingerprint: string;
  fingerprint: string;
  changed_at: number;
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

async function get_pin_storage_key(): Promise<CryptoKey> {
  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) {
    throw new Error("pin storage key unavailable");
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

async function load_pin(
  storage_key: CryptoKey,
  uid: string | null,
  pin_id: string,
): Promise<StoredIdentityPin | null> {
  return scoped_get<StoredIdentityPin>(
    IDENTITY_PIN_PREFIX,
    uid,
    pin_id,
    storage_key,
  );
}

export async function check_and_pin_identity(
  pin_id: string,
  kem_identity_key: string,
  verified: boolean = false,
  advertises_pq: boolean = false,
): Promise<IdentityPinStatus> {
  try {
    if (!pin_id || !kem_identity_key) {
      return "ok";
    }

    const fingerprint = await compute_hash(base64_to_array(kem_identity_key));
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const existing = await load_pin(storage_key, uid, pin_id);
    const pq_seen = Boolean(existing?.pq_seen) || advertises_pq;

    if (!existing) {
      await scoped_set(
        IDENTITY_PIN_PREFIX,
        uid,
        pin_id,
        {
          fingerprint,
          verified,
          pinned_at: Date.now(),
          pq_seen,
        } satisfies StoredIdentityPin,
        storage_key,
      );

      return "first";
    }

    if (existing.fingerprint !== fingerprint) {
      if (!verified) {
        return "drift";
      }

      await scoped_set(
        IDENTITY_PIN_PREFIX,
        uid,
        pin_id,
        {
          fingerprint,
          verified,
          pinned_at: Date.now(),
          pq_seen,
        } satisfies StoredIdentityPin,
        storage_key,
      );

      await scoped_set(
        IDENTITY_CHANGE_PREFIX,
        uid,
        pin_id,
        {
          previous_fingerprint: existing.fingerprint,
          fingerprint,
          changed_at: Date.now(),
        } satisfies IdentityChangeRecord,
        storage_key,
      );

      record_peer_identity_event(pin_id, "rotated");

      return "rotated";
    }

    if (
      (verified && !existing.verified) ||
      pq_seen !== Boolean(existing.pq_seen)
    ) {
      await scoped_set(
        IDENTITY_PIN_PREFIX,
        uid,
        pin_id,
        {
          ...existing,
          verified: existing.verified || verified,
          pq_seen,
        } satisfies StoredIdentityPin,
        storage_key,
      );
    }

    return "ok";
  } catch {
    return "unknown";
  }
}

export async function flag_recipient_untrusted(pin_id: string): Promise<void> {
  record_peer_identity_event(pin_id, "untrusted");

  try {
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();

    await scoped_set(
      IDENTITY_UNTRUSTED_PREFIX,
      uid,
      pin_id,
      { flagged_at: Date.now() } satisfies StoredUntrustedFlag,
      storage_key,
    );
  } catch {
    return;
  }
}

export async function is_recipient_flagged_untrusted(
  pin_id: string,
): Promise<boolean> {
  try {
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const flag = await scoped_get<StoredUntrustedFlag>(
      IDENTITY_UNTRUSTED_PREFIX,
      uid,
      pin_id,
      storage_key,
    );

    return flag !== null && flag !== undefined;
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }
}

export async function owner_key_fingerprint(
  armored_public_key: string,
): Promise<string> {
  const openpgp = await load_openpgp();

  const key = await openpgp.readKey({ armoredKey: armored_public_key });

  return key.getFingerprint().toLowerCase();
}

export async function check_owner_key_pin(
  pin_id: string,
  armored_public_key: string,
): Promise<OwnerKeyPinStatus> {
  if (!pin_id || !armored_public_key) return "unknown";

  let storage_key: CryptoKey;
  let uid: string | null;
  let existing: StoredOwnerKeyPin | null | undefined;

  try {
    storage_key = await get_pin_storage_key();
    uid = await current_account_uid();
    existing = await scoped_get<StoredOwnerKeyPin>(
      OWNER_KEY_PIN_PREFIX,
      uid,
      pin_id,
      storage_key,
    );
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  await load_openpgp();

  let fingerprint: string;

  try {
    fingerprint = await owner_key_fingerprint(armored_public_key);
  } catch {
    return existing ? "changed" : "unknown";
  }

  if (existing) {
    return existing.fingerprint === fingerprint ? "ok" : "changed";
  }

  try {
    await scoped_set(
      OWNER_KEY_PIN_PREFIX,
      uid,
      pin_id,
      { fingerprint, pinned_at: Date.now() } satisfies StoredOwnerKeyPin,
      storage_key,
    );
  } catch {
    throw new KeyPinUnavailableError(pin_id);
  }

  return "first";
}

export async function get_pinned_owner_key_fingerprint(
  pin_id: string,
): Promise<string | null> {
  try {
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const existing = await scoped_get<StoredOwnerKeyPin>(
      OWNER_KEY_PIN_PREFIX,
      uid,
      pin_id,
      storage_key,
    );

    return existing?.fingerprint ?? null;
  } catch {
    return null;
  }
}

export async function trust_recipient_keys(
  pin_id: string,
  kem_identity_key: string | null,
  armored_public_key: string | null,
): Promise<void> {
  const storage_key = await get_pin_storage_key();
  const uid = await current_account_uid();
  const existing = await load_pin(storage_key, uid, pin_id);

  if (kem_identity_key) {
    await scoped_set(
      IDENTITY_PIN_PREFIX,
      uid,
      pin_id,
      {
        fingerprint: await compute_hash(base64_to_array(kem_identity_key)),
        verified: false,
        pinned_at: Date.now(),
        pq_seen: Boolean(existing?.pq_seen),
      } satisfies StoredIdentityPin,
      storage_key,
    );
  }

  if (armored_public_key) {
    await scoped_set(
      OWNER_KEY_PIN_PREFIX,
      uid,
      pin_id,
      {
        fingerprint: await owner_key_fingerprint(armored_public_key),
        pinned_at: Date.now(),
      } satisfies StoredOwnerKeyPin,
      storage_key,
    );
  }

  await scoped_delete(IDENTITY_CHANGE_PREFIX, uid, pin_id);
  await scoped_delete(IDENTITY_UNTRUSTED_PREFIX, uid, pin_id);
  dismiss_peer_identity_event(pin_id);
}

export async function has_peer_advertised_pq(pin_id: string): Promise<boolean> {
  try {
    if (!pin_id) return false;

    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const existing = await load_pin(storage_key, uid, pin_id);

    return existing?.pq_seen === true;
  } catch {
    return false;
  }
}

export async function get_pinned_identity_fingerprint(
  pin_id: string,
): Promise<string | null> {
  try {
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const existing = await load_pin(storage_key, uid, pin_id);

    return existing?.fingerprint ?? null;
  } catch {
    return null;
  }
}

export async function get_identity_change(
  pin_id: string,
): Promise<IdentityChangeRecord | null> {
  try {
    if (!pin_id) return null;

    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();

    return await scoped_get<IdentityChangeRecord>(
      IDENTITY_CHANGE_PREFIX,
      uid,
      pin_id,
      storage_key,
    );
  } catch {
    return null;
  }
}

export async function acknowledge_identity_change(
  pin_id: string,
): Promise<void> {
  if (!pin_id) return;

  const uid = await current_account_uid();

  await scoped_delete(IDENTITY_CHANGE_PREFIX, uid, pin_id);
  dismiss_peer_identity_event(pin_id);
}

export async function reset_identity_pin(pin_id: string): Promise<void> {
  try {
    const uid = await current_account_uid();

    await scoped_delete(IDENTITY_PIN_PREFIX, uid, pin_id);
    await scoped_delete(IDENTITY_CHANGE_PREFIX, uid, pin_id);
    await scoped_delete(OWNER_KEY_PIN_PREFIX, uid, pin_id);
    await scoped_delete(IDENTITY_UNTRUSTED_PREFIX, uid, pin_id);

    if (uid) {
      await scoped_delete(IDENTITY_PIN_PREFIX, null, pin_id);
    }
  } catch {
    /* best-effort */
  }
}
