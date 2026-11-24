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
  get_codes_status,
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
} from "./memory_key_store";
import {
  recovery_codes_of,
  refresh_recovery_backup,
} from "./recovery_backup_refresh";
import {
  ESCROW_FORMAT,
  decode_escrow_seed,
  derive_escrow_keys,
  encode_escrow_seed,
  generate_escrow_seed,
  seal_account_key_to_escrow,
  zero_escrow_keys,
  type EscrowKeys,
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

async function persist_vault(
  user_id: string,
  base: EncryptedVault,
  next: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    next,
    passphrase,
  );
  const roundtrip_ok = await verify_vault_roundtrip(
    encrypted_vault,
    vault_nonce,
    passphrase,
    next.identity_key,
  );

  if (!roundtrip_ok) return false;

  const pushed = await push_vault_to_server(
    encrypted_vault,
    vault_nonce,
    user_id,
    next.vault_format,
    next,
    base,
  );

  return pushed !== null;
}

interface HeldEscrowSeed {
  seed: Uint8Array;
  vault: EncryptedVault;
}

async function ensure_escrow_seed(
  user_id: string,
  vault: EncryptedVault,
  passphrase: string,
): Promise<HeldEscrowSeed | null> {
  const existing = vault.escrow_seed
    ? decode_escrow_seed(vault.escrow_seed)
    : null;

  if (existing) return { seed: existing, vault };

  return with_vault_write_lock(async () => {
    if (!is_vault_owned_by(user_id)) return null;

    const current = get_vault_from_memory() ?? vault;
    const already = current.escrow_seed
      ? decode_escrow_seed(current.escrow_seed)
      : null;

    if (already) return { seed: already, vault: current };

    const seed = generate_escrow_seed();
    const next: EncryptedVault = {
      ...current,
      escrow_seed: encode_escrow_seed(seed),
      escrow_format: ESCROW_FORMAT,
    };

    if (!(await persist_vault(user_id, current, next, passphrase))) {
      zero_uint8_array(seed);

      return null;
    }

    return { seed, vault: next };
  });
}

async function recovery_backup_absent(): Promise<boolean> {
  try {
    const status = await get_codes_status({ skip_cache: true });

    if (status.error || !status.data) return false;

    return status.data.total === 0 && !status.data.created_at;
  } catch {
    return false;
  }
}

async function carry_format_into_backup(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (recovery_codes_of(vault).length > 0) {
    return refresh_recovery_backup(vault, passphrase);
  }

  return recovery_backup_absent();
}

async function mark_escrow_format(
  user_id: string,
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (vault.escrow_format === ESCROW_FORMAT) return true;

  return with_vault_write_lock(async () => {
    if (!is_vault_owned_by(user_id)) return false;

    const current = get_vault_from_memory() ?? vault;

    if (current.escrow_format === ESCROW_FORMAT) return true;

    const next: EncryptedVault = { ...current, escrow_format: ESCROW_FORMAT };

    if (!(await carry_format_into_backup(next, passphrase))) return false;

    return persist_vault(user_id, current, next, passphrase);
  });
}

async function store_escrow_entry(
  user_id: string,
  keys: EscrowKeys,
  passphrase: string,
  token: AccountKeyTokenResponse,
  own_keys: string[],
): Promise<boolean> {
  const public_key = array_to_base64(keys.public_key);
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
      keys,
      user_id,
      token.version,
    );
    const stored = await put_recovery_escrow_key(token.version, sealed);

    return !stored.error;
  } finally {
    zero_uint8_array(account_key);
  }
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

  const held = await ensure_escrow_seed(user_id, vault, passphrase);

  if (!held) return false;

  const keys = derive_escrow_keys(held.seed, user_id);

  zero_uint8_array(held.seed);

  try {
    if (!(await store_escrow_entry(user_id, keys, passphrase, token, own_keys))) {
      return false;
    }
  } finally {
    zero_escrow_keys(keys);
  }

  return mark_escrow_format(user_id, held.vault, passphrase);
}
