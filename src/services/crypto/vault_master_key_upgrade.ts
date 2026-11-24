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
import { mark_keks_for_retirement } from "./retired_storage_keks";
import {
  collect_prior_storage_keys,
  derive_password_storage_keys,
  install_random_storage_key,
  is_weak_storage_vault,
} from "./storage_write_key";

export async function upgrade_vault_to_master_key(
  vault: EncryptedVault,
  current_password: string,
): Promise<void> {
  if (is_master_key_vault(vault)) {
    if (vault.data_kek_random === true) return;
    if (!(await is_weak_storage_vault(vault, current_password))) return;
  }

  const prior_keys = await collect_prior_storage_keys(vault, current_password);
  const password_keys = await derive_password_storage_keys(
    vault,
    current_password,
  );

  try {
    install_random_storage_key(vault, prior_keys);
    vault.pending_retire_kek_ids = mark_keks_for_retirement(
      vault.pending_retire_kek_ids,
      password_keys,
      vault.data_kek,
    );
  } finally {
    prior_keys.forEach((raw) => zero_uint8_array(raw));
    password_keys.forEach((raw) => zero_uint8_array(raw));
  }
}
