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

import { is_master_key_vault } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";
import {
  collect_prior_storage_keys,
  install_random_storage_key,
  is_weak_storage_vault,
} from "./storage_write_key";

export async function upgrade_vault_to_master_key(
  vault: EncryptedVault,
  current_password: string,
): Promise<boolean> {
  if (is_master_key_vault(vault)) {
    if (vault.data_kek_random === true) return true;

    try {
      if (!(await is_weak_storage_vault(vault, current_password))) return true;
    } catch {
      return true;
    }
  }

  let prior_keys: Uint8Array[];

  try {
    prior_keys = await collect_prior_storage_keys(vault, current_password);
  } catch {
    return false;
  }

  try {
    install_random_storage_key(vault, prior_keys);
  } finally {
    prior_keys.forEach((raw) => zero_uint8_array(raw));
  }

  return true;
}
