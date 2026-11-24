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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { FetchResult } from "@/services/crypto/vault_cas_write";

import {
  get_session_passphrase,
  store_encrypted_vault,
} from "./session_passphrase";
import { decrypt_vault_with_lock } from "./vault_decryption";

import { fetch_latest_vault } from "@/services/crypto/vault_cas_write";

export interface ServerVaultRestoreDeps {
  get_passphrase: (account_id: string) => Promise<string | null>;
  fetch_vault: () => Promise<FetchResult>;
  open_vault: (
    encrypted_vault: string,
    vault_nonce: string,
    passphrase: string,
    user_id: string,
  ) => Promise<EncryptedVault | null>;
  save_local: (
    account_id: string,
    encrypted_vault: string,
    vault_nonce: string,
  ) => void;
}

const default_deps: ServerVaultRestoreDeps = {
  get_passphrase: (account_id) => get_session_passphrase(account_id),
  fetch_vault: () => fetch_latest_vault(),
  open_vault: (encrypted_vault, vault_nonce, passphrase, user_id) =>
    decrypt_vault_with_lock(encrypted_vault, vault_nonce, passphrase, user_id),
  save_local: (account_id, encrypted_vault, vault_nonce) =>
    store_encrypted_vault(account_id, encrypted_vault, vault_nonce),
};

export async function restore_from_server_vault(
  account_id: string,
  user_id: string,
  deps: ServerVaultRestoreDeps = default_deps,
): Promise<boolean> {
  let passphrase: string | null = null;

  try {
    passphrase = await deps.get_passphrase(account_id);
  } catch {
    return false;
  }

  if (!passphrase) return false;

  const fetched = await deps.fetch_vault();

  if (fetched.kind !== "ok") return false;

  const { encrypted_vault, vault_nonce } = fetched.snapshot;

  try {
    const vault = await deps.open_vault(
      encrypted_vault,
      vault_nonce,
      passphrase,
      user_id,
    );

    if (!vault) return false;
  } catch {
    return false;
  }

  deps.save_local(account_id, encrypted_vault, vault_nonce);

  return true;
}
