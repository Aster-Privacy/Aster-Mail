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

import { get_account_key_capabilities } from "../api/account_key";
import {
  get_recovery_escrow_state,
  put_recovery_escrow_key,
  put_recovery_escrow_public_key,
} from "../api/recovery";

import { open_account_key_token } from "./account_key_token";
import { array_to_base64 } from "./base64";
import {
  push_vault_to_server,
  verify_vault_roundtrip,
} from "./ensure_ratchet_keys";
import { encrypt_vault } from "./key_manager";
import {
  get_vault_from_memory,
  is_vault_owned_by,
  store_vault_in_memory,
} from "./memory_key_store";
import {
  decode_escrow_seed,
  derive_escrow_keypair,
  encode_escrow_seed,
  generate_escrow_seed,
  seal_account_key_to_escrow,
} from "./recovery_key_escrow";
import { zero_uint8_array } from "./secure_memory";
import { with_vault_write_lock } from "./vault_write_lock";

export async function recovery_escrow_enabled(): Promise<boolean> {
  try {
    return (await get_account_key_capabilities()).key_escrow;
  } catch {
    return false;
  }
}

async function persist_seed(
  user_id: string,
  vault: EncryptedVault,
  passphrase: string,
  seed: Uint8Array,
): Promise<boolean> {
  const next_vault: EncryptedVault = {
    ...vault,
    escrow_seed: encode_escrow_seed(seed),
  };
  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    next_vault,
    passphrase,
  );
  const roundtrip_ok = await verify_vault_roundtrip(
    encrypted_vault,
    vault_nonce,
    passphrase,
    next_vault.identity_key,
  );

  if (!roundtrip_ok) return false;

  const pushed = await push_vault_to_server(
    encrypted_vault,
    vault_nonce,
    user_id,
    next_vault.vault_format,
    next_vault,
  );

  if (!pushed) return false;

  await store_vault_in_memory(next_vault, passphrase, user_id);

  localStorage.setItem(`astermail_encrypted_vault_${user_id}`, encrypted_vault);
  localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

  return true;
}

export async function ensure_escrow_seed(
  user_id: string,
  vault: EncryptedVault,
  passphrase: string,
): Promise<Uint8Array | null> {
  const existing = vault.escrow_seed
    ? decode_escrow_seed(vault.escrow_seed)
    : null;

  if (existing) return existing;

  return with_vault_write_lock(async () => {
    if (!is_vault_owned_by(user_id)) return null;

    const current = get_vault_from_memory() ?? vault;
    const already = current.escrow_seed
      ? decode_escrow_seed(current.escrow_seed)
      : null;

    if (already) return already;

    const seed = generate_escrow_seed();

    if (!(await persist_seed(user_id, current, passphrase, seed))) {
      zero_uint8_array(seed);

      return null;
    }

    return seed;
  });
}

export async function sync_recovery_escrow(
  user_id: string,
  vault: EncryptedVault,
  passphrase: string,
  token: AccountKeyTokenResponse,
  own_keys: string[],
): Promise<boolean> {
  if (!is_vault_owned_by(user_id)) return false;
  if (!(await recovery_escrow_enabled())) return false;

  const seed = await ensure_escrow_seed(user_id, vault, passphrase);

  if (!seed) return false;

  const keypair = derive_escrow_keypair(seed, user_id);

  zero_uint8_array(seed);

  try {
    const public_key = array_to_base64(keypair.public_key);
    const state = await get_recovery_escrow_state();

    if (state.error || !state.data) return false;

    if (state.data.escrow_public_key !== public_key) {
      const published = await put_recovery_escrow_public_key(public_key);

      if (published.error) return false;
    } else if (state.data.token_versions.includes(token.version)) {
      return true;
    }

    const account_key = await open_account_key_token(
      token.token,
      own_keys,
      passphrase,
    );

    if (!account_key) return false;

    try {
      const sealed = await seal_account_key_to_escrow(
        account_key,
        keypair.public_key,
        user_id,
        token.version,
      );
      const stored = await put_recovery_escrow_key(token.version, sealed);

      return !stored.error;
    } finally {
      zero_uint8_array(account_key);
    }
  } finally {
    zero_uint8_array(keypair.private_key);
  }
}
