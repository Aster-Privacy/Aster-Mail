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
import * as openpgp from "openpgp";

import "@/services/crypto/openpgp_limits";

import { compute_hash } from "./key_manager_core";

const UNLOCKED_KEY_CACHE_MAX_ENTRIES = 8;

const UNLOCKED_KEY_CACHE = new Map<string, Promise<openpgp.PrivateKey>>();

async function unlocked_key_cache_id(
  secret_key: string,
  passphrase: string,
): Promise<string> {
  const encoder = new TextEncoder();

  return compute_hash(
    encoder.encode(`${secret_key.length}:${secret_key}\x00${passphrase}`),
  );
}

export async function unlock_private_key(
  secret_key: string,
  passphrase: string,
): Promise<openpgp.PrivateKey> {
  const cache_id = await unlocked_key_cache_id(secret_key, passphrase);
  const cached = UNLOCKED_KEY_CACHE.get(cache_id);

  if (cached) return cached;

  const pending = openpgp
    .readPrivateKey({ armoredKey: secret_key })
    .then((private_key) =>
      openpgp.decryptKey({
        ["privateKey" as const]: private_key,
        passphrase,
      }),
    );

  UNLOCKED_KEY_CACHE.set(cache_id, pending);

  if (UNLOCKED_KEY_CACHE.size > UNLOCKED_KEY_CACHE_MAX_ENTRIES) {
    const oldest = UNLOCKED_KEY_CACHE.keys().next();

    if (!oldest.done && oldest.value !== cache_id) {
      UNLOCKED_KEY_CACHE.delete(oldest.value);
    }
  }

  try {
    return await pending;
  } catch (error) {
    UNLOCKED_KEY_CACHE.delete(cache_id);

    throw error;
  }
}

export function clear_unlocked_key_cache(): void {
  UNLOCKED_KEY_CACHE.clear();
}
