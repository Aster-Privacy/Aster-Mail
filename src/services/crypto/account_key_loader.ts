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
import type { AccountKeyTokenResponse } from "@/services/api/account_key";

import * as openpgp from "openpgp";

import { ACCOUNT_KEY_LENGTH } from "./account_data_key";
import {
  open_account_key_token,
  seal_account_key_token,
} from "./account_key_token";
import {
  get_account_key_generation,
  get_account_write_epoch,
  load_account_key_derived_keks_into_memory,
} from "./legacy_keks";
import { zero_uint8_array } from "./secure_memory";

import {
  MAX_ACCOUNT_KEY_HISTORY,
  get_account_key_token,
  get_account_key_token_history,
  put_account_key_token_if_absent,
} from "@/services/api/account_key";

function same_bytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];

  return diff === 0;
}

async function create_account_key_if_absent(
  identity_key: string,
  passphrase: string,
  generation: number,
): Promise<AccountKeyTokenResponse | null> {
  try {
    const history = await get_account_key_token_history();

    if (history.length > 0) return null;
  } catch {
    return null;
  }

  const account_key = crypto.getRandomValues(
    new Uint8Array(ACCOUNT_KEY_LENGTH),
  );
  let reopened: Uint8Array | null = null;

  try {
    const token = await seal_account_key_token(
      account_key,
      identity_key,
      passphrase,
    );

    reopened = await open_account_key_token(token, [identity_key], passphrase);
    if (!reopened || !same_bytes(reopened, account_key)) return null;

    const private_key = await openpgp.readPrivateKey({
      armoredKey: identity_key,
    });
    const key_fingerprint = private_key.getFingerprint().toLowerCase();

    if (generation !== get_account_key_generation()) return null;

    return await put_account_key_token_if_absent(token, key_fingerprint);
  } catch {
    return null;
  } finally {
    zero_uint8_array(account_key);
    if (reopened) zero_uint8_array(reopened);
  }
}

async function load_token(
  token: string,
  own_keys: string[],
  passphrase: string,
  generation: number,
  write_epoch: number | null = null,
): Promise<boolean> {
  const account_key = await open_account_key_token(token, own_keys, passphrase);

  if (!account_key) return false;

  try {
    return await load_account_key_derived_keks_into_memory(
      account_key,
      generation,
      write_epoch,
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
  const write_epoch = get_account_write_epoch();
  const own_keys = [vault.identity_key, ...(vault.previous_keys ?? [])];
  let current = await get_account_key_token();

  if (generation !== get_account_key_generation()) return 0;

  if (!current) {
    if (!vault.identity_key) return 0;

    current = await create_account_key_if_absent(
      vault.identity_key,
      passphrase,
      generation,
    );

    if (!current || generation !== get_account_key_generation()) return 0;
  }

  let loaded = 0;

  if (
    await load_token(
      current.token,
      own_keys,
      passphrase,
      generation,
      write_epoch,
    )
  ) {
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
