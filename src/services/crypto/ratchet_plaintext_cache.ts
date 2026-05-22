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

const CACHE_KEY_PREFIX = "ratchet_plaintext_";
const TTL_MS = 60 * 24 * 60 * 60 * 1000;

interface CachedPlaintext {
  plaintext: string;
  stored_at: number;
}

function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
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

  secure_zero_memory(raw);

  return key;
}

export async function get_cached_ratchet_plaintext(
  message_id: string,
): Promise<string | null> {
  if (!message_id) return null;
  try {
    const key = await get_cache_key();

    if (!key) return null;

    const entry = await encrypted_get<CachedPlaintext>(
      `${CACHE_KEY_PREFIX}${message_id}`,
      key,
    );

    if (!entry) return null;

    if (Date.now() - entry.stored_at > TTL_MS) {
      await encrypted_delete(`${CACHE_KEY_PREFIX}${message_id}`);

      return null;
    }

    return entry.plaintext;
  } catch {
    return null;
  }
}

export async function set_cached_ratchet_plaintext(
  message_id: string,
  plaintext: string,
): Promise<void> {
  if (!message_id) return;
  try {
    const key = await get_cache_key();

    if (!key) return;

    const entry: CachedPlaintext = {
      plaintext,
      stored_at: Date.now(),
    };

    await encrypted_set(`${CACHE_KEY_PREFIX}${message_id}`, entry, key);
  } catch {
    /* best-effort */
  }
}

export async function delete_cached_ratchet_plaintext(
  message_id: string,
): Promise<void> {
  if (!message_id) return;
  try {
    await encrypted_delete(`${CACHE_KEY_PREFIX}${message_id}`);
  } catch {
    /* best-effort */
  }
}
