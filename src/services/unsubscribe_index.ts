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
import type { UnsubscribeInfo } from "@/types/email";

import {
  encrypted_get,
  encrypted_set,
  encrypted_delete,
} from "@/services/crypto/encrypted_storage";
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_current_account_id } from "@/services/account_manager";

export interface UnsubscribeFact {
  email: string;
  name: string;
  unsub: UnsubscribeInfo | null;
}

export type UnsubscribeFacts = Map<string, UnsubscribeFact>;

const INDEX_VERSION = 1;
const MAX_INDEX_ENTRIES = 50000;

interface StoredIndex {
  version: number;
  entries: Array<[string, UnsubscribeFact]>;
}

async function storage_key_for_account(): Promise<{
  key: CryptoKey;
  record: string;
} | null> {
  const account_id = await get_current_account_id();

  if (!account_id) {
    return null;
  }

  const master = get_derived_encryption_key();

  if (!master) {
    return null;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      master,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return { key, record: `unsubscribe_index_${account_id}` };
  } finally {
    zero_uint8_array(master);
  }
}

export async function load_unsubscribe_facts(): Promise<UnsubscribeFacts> {
  try {
    const target = await storage_key_for_account();

    if (!target) {
      return new Map();
    }

    const stored = await encrypted_get<StoredIndex>(target.record, target.key);

    if (!stored || stored.version !== INDEX_VERSION) {
      return new Map();
    }

    return new Map(stored.entries);
  } catch {
    return new Map();
  }
}

export async function save_unsubscribe_facts(
  facts: UnsubscribeFacts,
): Promise<void> {
  try {
    const target = await storage_key_for_account();

    if (!target) {
      return;
    }

    const entries = Array.from(facts.entries()).slice(0, MAX_INDEX_ENTRIES);

    await encrypted_set(
      target.record,
      { version: INDEX_VERSION, entries } satisfies StoredIndex,
      target.key,
    );
  } catch {
    return;
  }
}

export async function clear_unsubscribe_facts(): Promise<void> {
  try {
    const account_id = await get_current_account_id();

    if (!account_id) {
      return;
    }

    await encrypted_delete(`unsubscribe_index_${account_id}`);
  } catch {
    return;
  }
}
