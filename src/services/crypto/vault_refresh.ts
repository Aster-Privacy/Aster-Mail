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
import { api_client } from "../api/client";
import { get_current_account } from "../account_manager";
import { decrypt_vault, type EncryptedVault } from "./key_manager";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { with_vault_write_lock } from "./vault_write_lock";

const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 30 * 1000;

export interface RefreshedVault {
  vault: EncryptedVault;
  encrypted_vault: string;
  vault_nonce: string;
  user_id: string;
}

let last_success_at = 0;
let last_failure_at = 0;
let last_result: RefreshedVault | null = null;
let adopted_encrypted_vault: string | null = null;
let in_flight: Promise<RefreshedVault | null> | null = null;

export function reset_vault_refresh_state(): void {
  last_success_at = 0;
  last_failure_at = 0;
  last_result = null;
  adopted_encrypted_vault = null;
  in_flight = null;
}

export async function fetch_refreshed_vault(): Promise<RefreshedVault | null> {
  if (in_flight) return in_flight;

  const now = Date.now();

  if (last_result && now - last_success_at < REFRESH_COOLDOWN_MS) {
    const account = await get_current_account();

    if (account?.user?.id === last_result.user_id) return last_result;

    reset_vault_refresh_state();
  }

  if (now - last_failure_at < FAILURE_RETRY_MS) return null;

  in_flight = run().finally(() => {
    in_flight = null;
  });

  return in_flight;
}

async function run(): Promise<RefreshedVault | null> {
  try {
    const passphrase = get_passphrase_from_memory();

    if (!passphrase) return null;

    const account = await get_current_account();
    const user_id = account?.user?.id;

    if (!user_id) return null;

    if (last_result && last_result.user_id !== user_id) {
      last_result = null;
      adopted_encrypted_vault = null;
    }

    const response = await api_client.get<{
      encrypted_vault: string;
      vault_nonce: string;
    }>("/core/v1/auth/vault");

    if (
      response.error ||
      !response.data?.encrypted_vault ||
      !response.data.vault_nonce
    ) {
      last_failure_at = Date.now();

      return last_result;
    }

    const vault = await decrypt_vault(
      response.data.encrypted_vault,
      response.data.vault_nonce,
      passphrase,
    );

    last_result = {
      vault,
      encrypted_vault: response.data.encrypted_vault,
      vault_nonce: response.data.vault_nonce,
      user_id,
    };
    last_success_at = Date.now();

    return last_result;
  } catch {
    last_failure_at = Date.now();

    return last_result;
  }
}

function vaults_carry_the_same_identity(
  current: EncryptedVault,
  refreshed: EncryptedVault,
): boolean {
  return (
    current.ratchet_identity_public === refreshed.ratchet_identity_public &&
    (current.ratchet_pq_identity_public ?? null) ===
      (refreshed.ratchet_pq_identity_public ?? null) &&
    Boolean(current.ratchet_pq_identity_key ?? current.ratchet_pq_identity_seed) ===
      Boolean(
        refreshed.ratchet_pq_identity_key ?? refreshed.ratchet_pq_identity_seed,
      ) &&
    (current.ratchet_previous_keys?.length ?? 0) >=
      (refreshed.ratchet_previous_keys?.length ?? 0)
  );
}

export async function adopt_refreshed_vault(
  refreshed: RefreshedVault,
): Promise<boolean> {
  if (adopted_encrypted_vault === refreshed.encrypted_vault) return true;

  return with_vault_write_lock(async () => {
    if (adopted_encrypted_vault === refreshed.encrypted_vault) return true;

    try {
      const passphrase = get_passphrase_from_memory();

      if (!passphrase) return false;

      const current = get_vault_from_memory();

      if (current && vaults_carry_the_same_identity(current, refreshed.vault)) {
        adopted_encrypted_vault = refreshed.encrypted_vault;

        return true;
      }

      await store_vault_in_memory(refreshed.vault, passphrase);

      try {
        localStorage.setItem(
          `astermail_encrypted_vault_${refreshed.user_id}`,
          refreshed.encrypted_vault,
        );
        localStorage.setItem(
          `astermail_vault_nonce_${refreshed.user_id}`,
          refreshed.vault_nonce,
        );
      } catch {}

      adopted_encrypted_vault = refreshed.encrypted_vault;

      return true;
    } catch {
      return false;
    }
  });
}
