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
  sender?: string;
  conversation_id?: string;
}

export interface PlaintextBinding {
  sender: string;
  conversation_id: string;
}

function normalize_binding(binding: PlaintextBinding): PlaintextBinding {
  return {
    sender: binding.sender.trim().toLowerCase(),
    conversation_id: binding.conversation_id,
  };
}

function is_foreign_entry(
  entry: CachedPlaintext,
  binding: PlaintextBinding | undefined,
): boolean {
  if (typeof entry.sender !== "string") return false;
  if (!binding) return true;

  const bound = normalize_binding(binding);

  if (entry.sender !== bound.sender) return true;

  return (
    typeof entry.conversation_id === "string" &&
    !!bound.conversation_id &&
    entry.conversation_id !== bound.conversation_id
  );
}

function build_entry(
  plaintext: string,
  unauthenticated: boolean,
  binding: PlaintextBinding | undefined,
): CachedPlaintext {
  const bound = binding ? normalize_binding(binding) : null;

  return {
    plaintext,
    stored_at: Date.now(),
    ...(unauthenticated ? { unauthenticated: true } : {}),
    ...(bound
      ? { sender: bound.sender, conversation_id: bound.conversation_id }
      : {}),
  };
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

interface FoundEntry {
  entry: CachedPlaintext;
  key: CryptoKey;
  scope: CacheScope;
}

async function read_entry(message_id: string): Promise<FoundEntry | null> {
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

  return entry ? { entry, key, scope } : null;
}

export async function is_cached_plaintext_foreign(
  message_id: string,
  binding: PlaintextBinding,
): Promise<boolean> {
  if (!message_id) return false;
  try {
    const found = await read_entry(message_id);

    return found
      ? is_foreign_entry(found.entry, binding) && !found.entry.unauthenticated
      : false;
  } catch {
    return true;
  }
}

export async function get_cached_ratchet_plaintext(
  message_id: string,
  binding?: PlaintextBinding,
): Promise<string | null> {
  if (!message_id) return null;
  try {
    const found = await read_entry(message_id);

    if (!found) return null;

    const { entry, key, scope } = found;
    const age = Date.now() - entry.stored_at;

    if (age > RETENTION_MS) {
      await scoped_delete(RATCHET_PLAINTEXT_PREFIX, scope.uid, message_id);

      return null;
    }

    if (is_foreign_entry(entry, binding)) return null;

    const unbound = typeof entry.sender !== "string";

    if (age > REFRESH_AFTER_MS) {
      const refreshed: CachedPlaintext = { ...entry, stored_at: Date.now() };

      await scoped_set(
        RATCHET_PLAINTEXT_PREFIX,
        scope.uid,
        message_id,
        refreshed,
        key,
      );
    }

    if (entry.unauthenticated || unbound) {
      mark_unauthenticated_plaintext(entry.plaintext, message_id);
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
  binding?: PlaintextBinding,
): Promise<void> {
  if (!message_id) return;
  try {
    const key = await get_cache_key();

    if (!key) return;

    const scope = await current_cache_scope();

    if (!scope) return;

    const existing = await scoped_get<CachedPlaintext>(
      RATCHET_PLAINTEXT_PREFIX,
      scope.uid,
      message_id,
      key,
      { include_unscoped: false },
    );

    if (
      existing &&
      is_foreign_entry(existing, binding) &&
      (unauthenticated || !existing.unauthenticated || !binding)
    ) {
      return;
    }

    await scoped_set(
      RATCHET_PLAINTEXT_PREFIX,
      scope.uid,
      message_id,
      build_entry(plaintext, unauthenticated, binding),
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
