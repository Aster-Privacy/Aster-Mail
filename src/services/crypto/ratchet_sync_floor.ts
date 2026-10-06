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
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";
import {
  RATCHET_SYNC_FLOOR_PREFIX,
  scoped_get,
  scoped_set,
} from "./storage_key_names";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

interface FloorScope {
  storage_key: CryptoKey;
  uid: string | null;
}

async function floor_scope(): Promise<FloorScope | null> {
  if (!has_vault_in_memory()) return null;

  const raw = get_derived_encryption_key();

  if (!raw) return null;

  const storage_key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(raw);

  const { get_current_account_id } = await import("@/services/account_manager");

  return { storage_key, uid: await get_current_account_id() };
}

async function stored_floor(
  scope: FloorScope,
  conversation_id: string,
): Promise<number> {
  const stored = await scoped_get<number>(
    RATCHET_SYNC_FLOOR_PREFIX,
    scope.uid,
    conversation_id,
    scope.storage_key,
    { include_unscoped: false },
  );

  return typeof stored === "number" && Number.isSafeInteger(stored)
    ? stored
    : 0;
}

export async function read_sync_floor(
  conversation_id: string,
): Promise<number> {
  try {
    const scope = await floor_scope();

    return scope ? await stored_floor(scope, conversation_id) : 0;
  } catch {
    return 0;
  }
}

export async function raise_sync_floor(
  conversation_id: string,
  sync_version: number,
): Promise<void> {
  if (!Number.isSafeInteger(sync_version)) return;

  try {
    const scope = await floor_scope();

    if (!scope) return;
    if (sync_version <= (await stored_floor(scope, conversation_id))) return;

    await scoped_set(
      RATCHET_SYNC_FLOOR_PREFIX,
      scope.uid,
      conversation_id,
      sync_version,
      scope.storage_key,
    );
  } catch {
    return;
  }
}
