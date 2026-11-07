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
import { user_facing_error } from "@/utils/user_facing_error";
import "@/services/crypto/openpgp_limits";
import type { PrivateKey } from "openpgp";

import { decrypt_message_with_any_key } from "@/services/crypto/key_manager_pgp";
import { load_openpgp } from "@/services/crypto/openpgp_loader";

export interface pgp_decrypt_worker_request {
  id: number;
  ciphertext: string;
  secret_keys: (string | null | undefined)[];
  passphrase: string;
  unlocked_armored_keys?: string[];
}

export interface pgp_decrypt_worker_response {
  id: number;
  plaintext?: string;
  error?: string;
}

const UNLOCKED_KEY_CACHE_LIMIT = 4;
const unlocked_key_cache = new Map<string, Promise<PrivateKey>>();

function read_unlocked_key(armored: string): Promise<PrivateKey> {
  const cached = unlocked_key_cache.get(armored);

  if (cached) return cached;

  const parsed = load_openpgp().then((openpgp) =>
    openpgp.readPrivateKey({ armoredKey: armored }),
  );

  parsed.catch(() => unlocked_key_cache.delete(armored));

  if (unlocked_key_cache.size >= UNLOCKED_KEY_CACHE_LIMIT) {
    unlocked_key_cache.clear();
  }

  unlocked_key_cache.set(armored, parsed);

  return parsed;
}

async function read_unlocked_keys(armored_keys: string[]): Promise<PrivateKey[]> {
  const keys = await Promise.all(
    armored_keys.map((armored) => read_unlocked_key(armored).catch(() => null)),
  );

  return keys.filter((key): key is PrivateKey => key !== null);
}

self.onmessage = async (event: MessageEvent<pgp_decrypt_worker_request>) => {
  if (event.origin !== "" && event.origin !== self.location.origin) {
    return;
  }

  const { id, ciphertext, secret_keys, passphrase, unlocked_armored_keys } =
    event.data;

  try {
    const unlocked_keys = unlocked_armored_keys?.length
      ? await read_unlocked_keys(unlocked_armored_keys)
      : [];
    const plaintext = await decrypt_message_with_any_key(
      ciphertext,
      secret_keys,
      passphrase,
      unlocked_keys,
    );

    const response: pgp_decrypt_worker_response = { id, plaintext };

    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: pgp_decrypt_worker_response = {
      id,
      error: user_facing_error(error, "decrypt_failed"),
    };

    (self as unknown as Worker).postMessage(response);
  }
};
