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
import type { PrivateKey } from "openpgp";

import { compute_hash } from "./key_manager_core";
import { clear_key_id_cache } from "./pgp_key_selection";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

const UNLOCKED_KEY_CACHE_MAX_ENTRIES = 64;
const FAILED_UNLOCK_MAX_ENTRIES = 64;

const UNLOCKED_KEY_CACHE = new Map<string, Promise<PrivateKey>>();
const FAILED_UNLOCKS = new Set<string>();

export class unlock_failed_error extends Error {
  constructor() {
    super("private key unlock failed");
    this.name = "unlock_failed_error";
  }
}

async function unlocked_key_cache_id(
  secret_key: string,
  passphrase: string,
): Promise<string> {
  const encoder = new TextEncoder();

  return compute_hash(
    encoder.encode(`${secret_key.length}:${secret_key}\x00${passphrase}`),
  );
}

function evict_oldest<T>(entries: Map<string, T> | Set<string>, max: number) {
  while (entries.size > max) {
    const oldest = entries.keys().next();

    if (oldest.done) return;
    entries.delete(oldest.value);
  }
}

export async function unlock_private_key(
  secret_key: string,
  passphrase: string,
): Promise<PrivateKey> {
  const openpgp = await load_openpgp();
  const cache_id = await unlocked_key_cache_id(secret_key, passphrase);

  if (FAILED_UNLOCKS.has(cache_id)) throw new unlock_failed_error();

  const cached = UNLOCKED_KEY_CACHE.get(cache_id);

  if (cached) {
    UNLOCKED_KEY_CACHE.delete(cache_id);
    UNLOCKED_KEY_CACHE.set(cache_id, cached);

    return cached;
  }

  const pending = openpgp
    .readPrivateKey({ armoredKey: secret_key })
    .then((private_key) =>
      openpgp.decryptKey({
        ["privateKey" as const]: private_key,
        passphrase,
      }),
    );

  UNLOCKED_KEY_CACHE.set(cache_id, pending);
  evict_oldest(UNLOCKED_KEY_CACHE, UNLOCKED_KEY_CACHE_MAX_ENTRIES);

  try {
    return await pending;
  } catch (error) {
    UNLOCKED_KEY_CACHE.delete(cache_id);
    FAILED_UNLOCKS.add(cache_id);
    evict_oldest(FAILED_UNLOCKS, FAILED_UNLOCK_MAX_ENTRIES);

    throw error;
  }
}

export function clear_unlocked_key_cache(): void {
  UNLOCKED_KEY_CACHE.clear();
  FAILED_UNLOCKS.clear();
  clear_key_id_cache();
}
