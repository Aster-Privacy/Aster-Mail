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
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";

const PQ_PREKEY_STORAGE_PREFIX = "pq_prekey_secret_";
const PQ_PREKEY_INDEX_KEY = "pq_prekey_secret_index";

interface StoredPqSecret {
  key_id: number;
  secret_key_b64: string;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function secure_zero(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

async function get_storage_key(): Promise<CryptoKey> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const master = get_derived_encryption_key();

  if (!master) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  secure_zero(master);

  return crypto_key;
}

function record_key(key_id: number): string {
  return `${PQ_PREKEY_STORAGE_PREFIX}${key_id}`;
}

async function update_index(
  storage_key: CryptoKey,
  mutate: (current: number[]) => number[],
): Promise<void> {
  const current =
    (await encrypted_get<number[]>(PQ_PREKEY_INDEX_KEY, storage_key)) || [];
  const next = mutate(current);

  if (next.length === 0) {
    await encrypted_delete(PQ_PREKEY_INDEX_KEY);
  } else {
    await encrypted_set(PQ_PREKEY_INDEX_KEY, next, storage_key);
  }
}

export async function save_pq_secret(
  key_id: number,
  secret: Uint8Array,
): Promise<void> {
  const storage_key = await get_storage_key();
  const record: StoredPqSecret = {
    key_id,
    secret_key_b64: array_to_base64(secret),
  };

  await encrypted_set(record_key(key_id), record, storage_key);

  await update_index(storage_key, (current) => {
    if (current.includes(key_id)) {
      return current;
    }

    return [...current, key_id];
  });
}

export async function load_pq_secret(
  key_id: number,
): Promise<Uint8Array | null> {
  try {
    const storage_key = await get_storage_key();
    const record = await encrypted_get<StoredPqSecret>(
      record_key(key_id),
      storage_key,
    );

    if (!record) {
      return null;
    }

    return base64_to_array(record.secret_key_b64);
  } catch {
    return null;
  }
}

export async function delete_pq_secret(key_id: number): Promise<void> {
  try {
    const storage_key = await get_storage_key();

    await encrypted_delete(record_key(key_id));

    await update_index(storage_key, (current) =>
      current.filter((id) => id !== key_id),
    );
  } catch {
    return;
  }
}

export async function list_pq_secret_ids(): Promise<number[]> {
  try {
    const storage_key = await get_storage_key();
    const index = await encrypted_get<number[]>(
      PQ_PREKEY_INDEX_KEY,
      storage_key,
    );

    return index || [];
  } catch {
    return [];
  }
}
