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
  encrypted_set,
  encrypted_get,
  encrypted_delete,
} from "./encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";
import { DoubleRatchet, type SerializedState } from "./double_ratchet";
import {
  RATCHET_STATE_PREFIX,
  delete_scoped_entries,
  scoped_delete,
  scoped_get,
  scoped_set,
} from "./storage_key_names";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

const RATCHET_INDEX_KEY = "ratchet_conversation_index";
const MAX_ARCHIVED_RATCHET_STATES = 3;

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
  const { get_current_account_id, accounts_storage_unreadable } =
    await import("@/services/account_manager");

  const uid = await get_current_account_id();

  if (uid === null && accounts_storage_unreadable()) {
    throw new Error("Account storage unavailable. Retry once it is readable.");
  }

  return uid;
}

function archive_name(conversation_id: string): string {
  return `${conversation_id}_archive`;
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

  await scoped_set(
    RATCHET_STATE_PREFIX,
    uid,
    serialized.conversation_id,
    serialized,
    storage_key,
  );
  await add_conversation_to_index(storage_key, uid, serialized.conversation_id);
}

function archived_entry_id(state: SerializedState): string {
  return `${state.state.dh_keypair.public_key}:${state.state.root_key}`;
}

export async function load_archived_ratchet_states(
  conversation_id: string,
): Promise<DoubleRatchet[]> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();
  const archived = await scoped_get<SerializedState[]>(
    RATCHET_STATE_PREFIX,
    uid,
    archive_name(conversation_id),
    storage_key,
    { include_unscoped: false },
  );

  if (!archived || archived.length === 0) return [];

  return archived.map((entry) => DoubleRatchet.deserialize(entry));
}

export async function archive_ratchet_state(
  state: SerializedState,
): Promise<void> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();
  const name = archive_name(state.conversation_id);
  const stored =
    (await scoped_get<SerializedState[]>(
      RATCHET_STATE_PREFIX,
      uid,
      name,
      storage_key,
      { include_unscoped: false },
    )) || [];
  const id = archived_entry_id(state);
  const kept = stored.filter((entry) => archived_entry_id(entry) !== id);

  kept.push(state);

  await scoped_set(
    RATCHET_STATE_PREFIX,
    uid,
    name,
    kept.slice(Math.max(0, kept.length - MAX_ARCHIVED_RATCHET_STATES)),
    storage_key,
  );
}

export async function load_ratchet_state(
  conversation_id: string,
): Promise<DoubleRatchet | null> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();
  const state = await scoped_get<SerializedState>(
    RATCHET_STATE_PREFIX,
    uid,
    conversation_id,
    storage_key,
  );

  if (state && uid) {
    await add_conversation_to_index(storage_key, uid, conversation_id);
  }

  if (!state) return null;

  return DoubleRatchet.deserialize(state);
}

export async function delete_ratchet_state(
  conversation_id: string,
): Promise<void> {
  const storage_key = await get_storage_encryption_key();
  const uid = await current_account_uid();

  await scoped_delete(RATCHET_STATE_PREFIX, uid, conversation_id, {
    include_unscoped: true,
  });
  await scoped_delete(RATCHET_STATE_PREFIX, uid, archive_name(conversation_id));

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

async function clear_unscoped_ratchet_states(): Promise<void> {
  const storage_key = await get_storage_encryption_key();
  const index =
    (await encrypted_get<string[]>(RATCHET_INDEX_KEY, storage_key)) || [];

  for (const conversation_id of index) {
    await scoped_delete(RATCHET_STATE_PREFIX, null, conversation_id);
    await scoped_delete(
      RATCHET_STATE_PREFIX,
      null,
      archive_name(conversation_id),
    );
  }

  await encrypted_delete(RATCHET_INDEX_KEY);
}

export async function clear_all_ratchet_states(
  account_id?: string,
): Promise<void> {
  try {
    if (account_id) {
      await delete_scoped_entries(RATCHET_STATE_PREFIX, account_id);
      await encrypted_delete(index_key_for(account_id));

      return;
    }

    await get_storage_encryption_key();

    const uid = await current_account_uid();

    if (uid) {
      await delete_scoped_entries(RATCHET_STATE_PREFIX, uid);
      await encrypted_delete(index_key_for(uid));
    }

    await clear_unscoped_ratchet_states();
  } catch {
    return;
  }
}
