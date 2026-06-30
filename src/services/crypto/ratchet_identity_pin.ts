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
  encrypted_get,
  encrypted_set,
  encrypted_delete,
} from "./encrypted_storage";
import { get_derived_encryption_key } from "./memory_key_store";
import {
  base64_to_array,
  compute_hash,
  secure_zero_memory,
} from "./key_manager_core";

const PIN_STORAGE_KEY_PREFIX = "ratchet_identity_pin_";

export type IdentityPinStatus = "first" | "ok" | "drift";

interface StoredIdentityPin {
  fingerprint: string;
  verified: boolean;
  pinned_at: number;
}

async function current_account_uid(): Promise<string | null> {
  try {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );

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
    true,
    ["encrypt", "decrypt"],
  );

  secure_zero_memory(key_bytes);

  return crypto_key;
}

function storage_key_for(uid: string | null, pin_id: string): string {
  if (!uid) return `${PIN_STORAGE_KEY_PREFIX}${pin_id}`;

  return `${PIN_STORAGE_KEY_PREFIX}${uid}_${pin_id}`;
}

async function load_pin(
  storage_key: CryptoKey,
  uid: string | null,
  pin_id: string,
): Promise<StoredIdentityPin | null> {
  const key = storage_key_for(uid, pin_id);
  const current = await encrypted_get<StoredIdentityPin>(key, storage_key);

  if (current) return current;

  if (uid) {
    const legacy = await encrypted_get<StoredIdentityPin>(
      storage_key_for(null, pin_id),
      storage_key,
    );

    if (legacy) {
      await encrypted_set(key, legacy, storage_key);

      return legacy;
    }
  }

  return null;
}

export async function check_and_pin_identity(
  pin_id: string,
  kem_identity_key: string,
  verified: boolean = false,
): Promise<IdentityPinStatus> {
  try {
    if (!pin_id || !kem_identity_key) {
      return "ok";
    }

    const fingerprint = await compute_hash(base64_to_array(kem_identity_key));
    const storage_key = await get_pin_storage_key();
    const uid = await current_account_uid();
    const existing = await load_pin(storage_key, uid, pin_id);

    if (!existing) {
      await encrypted_set(
        storage_key_for(uid, pin_id),
        {
          fingerprint,
          verified,
          pinned_at: Date.now(),
        } satisfies StoredIdentityPin,
        storage_key,
      );

      return "first";
    }

    if (existing.fingerprint !== fingerprint) {
      return "drift";
    }

    if (verified && !existing.verified) {
      await encrypted_set(
        storage_key_for(uid, pin_id),
        {
          ...existing,
          verified: true,
        } satisfies StoredIdentityPin,
        storage_key,
      );
    }

    return "ok";
  } catch {
    return "ok";
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

export async function reset_identity_pin(pin_id: string): Promise<void> {
  try {
    const uid = await current_account_uid();

    await encrypted_delete(storage_key_for(uid, pin_id));

    if (uid) {
      await encrypted_delete(storage_key_for(null, pin_id));
    }
  } catch {
    /* best-effort */
  }
}
