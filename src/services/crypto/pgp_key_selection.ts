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

const KEY_ID_CACHE_MAX_ENTRIES = 128;

const KEY_ID_CACHE = new Map<string, Promise<string[] | null>>();

function read_key_ids(armored: string): Promise<string[] | null> {
  const cached = KEY_ID_CACHE.get(armored);

  if (cached) return cached;

  const pending = openpgp
    .readPrivateKey({ armoredKey: armored })
    .then((key) => key.getKeyIDs().map((id) => id.toHex()))
    .catch(() => null);

  KEY_ID_CACHE.set(armored, pending);

  while (KEY_ID_CACHE.size > KEY_ID_CACHE_MAX_ENTRIES) {
    const oldest = KEY_ID_CACHE.keys().next();

    if (oldest.done) break;
    KEY_ID_CACHE.delete(oldest.value);
  }

  return pending;
}

async function message_key_ids(ciphertext: string): Promise<string[] | null> {
  try {
    const message = await openpgp.readMessage({ armoredMessage: ciphertext });
    const ids = message.getEncryptionKeyIDs();

    if (ids.length === 0 || ids.some((id) => /^0+$/.test(id.toHex()))) return null;

    return ids.map((id) => id.toHex());
  } catch {
    return null;
  }
}

export async function order_keys_for_message(
  ciphertext: string,
  keys: string[],
): Promise<string[]> {
  if (keys.length < 2) return keys;

  const wanted = await message_key_ids(ciphertext);

  if (!wanted) return keys;

  const wanted_set = new Set(wanted);
  const matched: string[] = [];
  const unknown: string[] = [];

  for (const key of keys) {
    const ids = await read_key_ids(key);

    if (ids === null) {
      unknown.push(key);
    } else if (ids.some((id) => wanted_set.has(id))) {
      matched.push(key);
    }
  }

  if (matched.length === 0) return keys;

  return [...matched, ...unknown];
}

export function clear_key_id_cache(): void {
  KEY_ID_CACHE.clear();
}
