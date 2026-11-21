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

import {
  folder_key_pin_level,
  pin_folder_kdf,
  vault_folder_pin,
  with_folder_key_pin,
} from "./folder_kdf_pin";
import {
  get_last_vault_owner_id,
  get_vault_from_memory,
  has_vault_in_memory_for,
} from "./memory_key_store";
import { write_vault_merged } from "./vault_cas_write";
import { with_vault_write_lock_bounded } from "./vault_write_lock";
import { VAULT_LOCK_WAIT_MS } from "./storage_rotation/vault_step";

export function current_folder_key_pin_level(folder_id: string): number {
  const level = folder_key_pin_level(folder_id, get_vault_from_memory());

  return vault_folder_pin(folder_id)?.current === true
    ? Math.max(level, 1)
    : level;
}

export async function record_folder_key_pin(
  folder_id: string,
  level: number,
): Promise<boolean> {
  pin_folder_kdf(folder_id, level);

  const user_id = get_last_vault_owner_id();

  if (!user_id) return false;

  return with_vault_write_lock_bounded(async () => {
    const vault = get_vault_from_memory();

    if (!vault || !has_vault_in_memory_for(user_id)) return false;

    const pins = with_folder_key_pin(vault.folder_key_pins, folder_id, level);

    if (!pins) return true;

    const result = await write_vault_merged({
      next: { ...vault, folder_key_pins: pins },
      user_id,
    });

    return result.status === "written";
  }, VAULT_LOCK_WAIT_MS).catch(() => false);
}
