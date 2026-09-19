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
import type { EncryptedVault } from "./key_manager_core";

import { open_account_key_token } from "./account_key_token";
import {
  get_account_key_generation,
  load_account_key_derived_keks_into_memory,
} from "./legacy_keks";
import { zero_uint8_array } from "./secure_memory";

import {
  MAX_ACCOUNT_KEY_HISTORY,
  get_account_key_token,
  get_account_key_token_history,
} from "@/services/api/account_key";

async function load_token(
  token: string,
  own_keys: string[],
  passphrase: string,
  generation: number,
): Promise<boolean> {
  const account_key = await open_account_key_token(token, own_keys, passphrase);

  if (!account_key) return false;

  try {
    return await load_account_key_derived_keks_into_memory(
      account_key,
      generation,
    );
  } finally {
    zero_uint8_array(account_key);
  }
}

export async function load_account_keys_for_session(
  vault: EncryptedVault,
  passphrase: string,
): Promise<number> {
  const generation = get_account_key_generation();
  const own_keys = [vault.identity_key, ...(vault.previous_keys ?? [])];
  const current = await get_account_key_token();

  if (!current || generation !== get_account_key_generation()) return 0;

  let loaded = 0;

  if (await load_token(current.token, own_keys, passphrase, generation)) {
    loaded += 1;
  }

  const history = await get_account_key_token_history();

  for (const entry of history.slice(0, MAX_ACCOUNT_KEY_HISTORY)) {
    if (generation !== get_account_key_generation()) break;

    if (await load_token(entry.token, own_keys, passphrase, generation)) {
      loaded += 1;
    }
  }

  return loaded;
}
