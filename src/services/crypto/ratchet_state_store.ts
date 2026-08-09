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
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  encrypted_set,
  encrypted_get,
  encrypted_delete,
} from "./encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";
import { DoubleRatchet, type SerializedState } from "./double_ratchet";

const RATCHET_STORAGE_KEY_PREFIX = "ratchet_state_";
const RATCHET_INDEX_KEY = "ratchet_conversation_index";

async function get_storage_encryption_key(): Promise<CryptoKey> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(encryption_key);

  return crypto_key;
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

function legacy_state_key(conversation_id: string): string {
  return `${RATCHET_STORAGE_KEY_PREFIX}${conversation_id}`;
}

function state_key_for(uid: string | null, conversation_id: string): string {
  if (!uid) return legacy_state_key(conversation_id);

  return `${RATCHET_STORAGE_KEY_PREFIX}${uid}_${conversation_id}`;
}

function index_key_for(uid: string | null): string {
  if (!uid) return RATCHET_INDEX_KEY;

  return `${RATCHET_INDEX_KEY}_${uid}`;
}

async function add_conversation_to_index(
  storage_key: CryptoKey,
  uid: string | null,
  conversation_id: string,
): Promise<void> {
  const key = index_key_for(uid);
  const index = (await encrypted_get<string[]>(key, storage_key)) || [];

  if (!index.includes(conversation_id)) {
    index.push(conversation_id);
    await encrypted_set(key, index, storage_key);
  }
}

export async function save_ratchet_state(
  ratchet: DoubleRatchet,
): Promise<void> {
  const serialized = await ratchet.serialize();
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();
  const state_key = state_key_for(uid, serialized.conversation_id);

  await encrypted_set(state_key, serialized, storage_key);
  await add_conversation_to_index(storage_key, uid, serialized.conversation_id);
}

export async function load_ratchet_state(
  conversation_id: string,
): Promise<DoubleRatchet | null> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();
  const state_key = state_key_for(uid, conversation_id);

  let state = await encrypted_get<SerializedState>(state_key, storage_key);

  if (!state && uid) {
    const legacy_key = legacy_state_key(conversation_id);
    const legacy_state = await encrypted_get<SerializedState>(
      legacy_key,
      storage_key,
    );

    if (legacy_state) {
      await encrypted_set(state_key, legacy_state, storage_key);
      await encrypted_delete(legacy_key);
      await add_conversation_to_index(storage_key, uid, conversation_id);
      state = legacy_state;
    }
  }

  if (!state) return null;

  return DoubleRatchet.deserialize(state);
}

export async function delete_ratchet_state(
  conversation_id: string,
): Promise<void> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();

  await encrypted_delete(state_key_for(uid, conversation_id));

  if (uid) {
    await encrypted_delete(legacy_state_key(conversation_id));
  }

  const index_key = index_key_for(uid);
  const index = (await encrypted_get<string[]>(index_key, storage_key)) || [];
  const filtered = index.filter((id) => id !== conversation_id);

  if (filtered.length === 0) {
    await encrypted_delete(index_key);
  } else {
    await encrypted_set(index_key, filtered, storage_key);
  }
}

export async function list_ratchet_conversations(): Promise<string[]> {
  try {
    const storage_key = await get_storage_encryption_key();
    const uid = await current_account_uid();
    const index = await encrypted_get<string[]>(
      index_key_for(uid),
      storage_key,
    );

    return index || [];
  } catch {
    return [];
  }
}

export async function clear_all_ratchet_states(): Promise<void> {
  try {
    const storage_key = await get_storage_encryption_key();
    const uid = await current_account_uid();
    const index_keys = uid
      ? [index_key_for(uid), RATCHET_INDEX_KEY]
      : [RATCHET_INDEX_KEY];

    for (const key of index_keys) {
      const is_legacy = key === RATCHET_INDEX_KEY && uid !== null;
      const index = (await encrypted_get<string[]>(key, storage_key)) || [];

      for (const conversation_id of index) {
        const state_key = is_legacy
          ? legacy_state_key(conversation_id)
          : state_key_for(uid, conversation_id);

        await encrypted_delete(state_key);
      }

      await encrypted_delete(key);
    }
  } catch {
    return;
  }
}

