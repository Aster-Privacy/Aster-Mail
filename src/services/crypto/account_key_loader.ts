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
  get_account_key_token,
  get_account_key_token_history,
} from "@/services/api/account_key";

export async function load_account_keys_for_session(
  vault: EncryptedVault,
  passphrase: string,
): Promise<number> {
  const generation = get_account_key_generation();
  const own_keys = [vault.identity_key, ...(vault.previous_keys ?? [])];
  const current = await get_account_key_token();

  if (!current || generation !== get_account_key_generation()) return 0;

  const history = await get_account_key_token_history();
  const tokens = [current.token, ...history.map((entry) => entry.token)];
  let loaded = 0;

  for (const token of tokens) {
    if (generation !== get_account_key_generation()) break;

    const account_key = await open_account_key_token(
      token,
      own_keys,
      passphrase,
    );

    if (!account_key) continue;

    try {
      if (
        await load_account_key_derived_keks_into_memory(account_key, generation)
      ) {
        loaded += 1;
      }
    } finally {
      zero_uint8_array(account_key);
    }
  }

  return loaded;
}
