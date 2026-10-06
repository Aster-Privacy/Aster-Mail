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
import { encrypted_delete_where } from "./encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";

import { mark_unauthenticated_plaintext } from "./ratchet_verification_status";
import {
  RATCHET_PLAINTEXT_PREFIX,
  delete_scoped_entries,
  scoped_delete,
  scoped_get,
  scoped_set,
} from "./storage_key_names";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface CachedPlaintext {
  plaintext: string;
  stored_at: number;
  unauthenticated?: boolean;
}

interface CacheScope {
  uid: string | null;
}

async function current_cache_scope(): Promise<CacheScope | null> {
  try {
    const { get_current_account_id, accounts_storage_unreadable } =
      await import("@/services/account_manager");
    const uid = await get_current_account_id();

    if (uid === null && accounts_storage_unreadable()) return null;

    return { uid };
  } catch {
    return null;
  }
}

async function get_cache_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;

  const raw = get_derived_encryption_key();

  if (!raw) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(raw);

  return key;
}

export async function get_cached_ratchet_plaintext(
  message_id: string,
): Promise<string | null> {
  if (!message_id) return null;
  try {
    const key = await get_cache_key();

    if (!key) return null;

    const scope = await current_cache_scope();

    if (!scope) return null;

    const entry = await scoped_get<CachedPlaintext>(
      RATCHET_PLAINTEXT_PREFIX,
      scope.uid,
      message_id,
      key,
      { include_unscoped: false },
    );

    if (!entry) return null;

    const age = Date.now() - entry.stored_at;

    if (age > RETENTION_MS) {
      await scoped_delete(RATCHET_PLAINTEXT_PREFIX, scope.uid, message_id);

      return null;
    }

    if (age > REFRESH_AFTER_MS) {
      const refreshed: CachedPlaintext = {
        plaintext: entry.plaintext,
        stored_at: Date.now(),
        ...(entry.unauthenticated ? { unauthenticated: true } : {}),
      };

      await scoped_set(
        RATCHET_PLAINTEXT_PREFIX,
        scope.uid,
        message_id,
        refreshed,
        key,
      );
    }

    if (entry.unauthenticated) {
      mark_unauthenticated_plaintext(entry.plaintext);
    }

    return entry.plaintext;
  } catch {
    return null;
  }
}

export async function set_cached_ratchet_plaintext(
  message_id: string,
  plaintext: string,
  unauthenticated = false,
): Promise<void> {
  if (!message_id) return;
  try {
    const key = await get_cache_key();

    if (!key) return;

    const entry: CachedPlaintext = {
      plaintext,
      stored_at: Date.now(),
      ...(unauthenticated ? { unauthenticated: true } : {}),
    };

    const scope = await current_cache_scope();

    if (!scope) return;

    await scoped_set(
      RATCHET_PLAINTEXT_PREFIX,
      scope.uid,
      message_id,
      entry,
      key,
    );
  } catch {
    /* best-effort */
  }
}

export async function clear_plaintext_cache(): Promise<void> {
  try {
    await encrypted_delete_where((key) =>
      key.startsWith(RATCHET_PLAINTEXT_PREFIX),
    );
  } catch {
    /* best-effort */
  }
}

export async function clear_account_plaintext_cache(
  account_id: string,
): Promise<void> {
  try {
    await delete_scoped_entries(RATCHET_PLAINTEXT_PREFIX, account_id);
  } catch {
    /* best-effort */
  }
}
