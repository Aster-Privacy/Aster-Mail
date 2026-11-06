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
import type { EncryptedVault } from "./key_manager";

import { get_current_account } from "../account_manager";

import { sync_vault_with_server } from "./ensure_ratchet_keys";
import { write_vault_merged } from "./vault_cas_write";
import {
  is_master_key_vault,
  get_vault_from_memory,
  MASTER_KEY_VAULT_FORMAT,
} from "./memory_key_store";
import { with_vault_write_lock } from "./vault_write_lock";
import { zero_uint8_array } from "./secure_memory";
import {
  collect_prior_storage_keys,
  install_random_storage_key,
} from "./storage_write_key";

let adoption_in_flight: Promise<boolean> | null = null;

export async function adopt_master_key_if_needed(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (adoption_in_flight) return adoption_in_flight;

  adoption_in_flight = with_vault_write_lock(() =>
    run_adoption(get_vault_from_memory() ?? vault, passphrase),
  ).finally(() => {
    adoption_in_flight = null;
  });

  return adoption_in_flight;
}

export function is_mk_adoption_enabled(): boolean {
  return import.meta.env.VITE_MK_ADOPTION_ENABLED === "true";
}

async function run_adoption(
  local_vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (!is_mk_adoption_enabled()) return false;

  if (is_master_key_vault(local_vault)) return false;

  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const freshness = await sync_vault_with_server();

  if (freshness.status === "unverified") return false;

  const vault = freshness.status === "adopted" ? freshness.vault : local_vault;

  if (is_master_key_vault(vault)) return false;

  const account = await get_current_account();
  const user_id = account?.user?.id;

  if (!user_id) return false;

  const prior_keys = await collect_prior_storage_keys(vault, passphrase);
  const upgraded: EncryptedVault = { ...vault };

  try {
    install_random_storage_key(upgraded, prior_keys);
  } finally {
    prior_keys.forEach((raw) => zero_uint8_array(raw));
  }

  const result = await write_vault_merged({
    next: upgraded,
    base: vault,
    passphrase,
    user_id,
    vault_format: MASTER_KEY_VAULT_FORMAT,
    preserve_pq_prekeys: true,
    owns_storage_key: true,
  });

  return result.status === "written" && result.vault.data_kek_random === true;
}
