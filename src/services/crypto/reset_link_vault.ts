//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64 } from "./base64";
import { carry_vault_through_reset } from "./carry_vault_through_reset";
import { reprotect_vault_keys_for_password_change } from "./identity_key_materials";
import { MASTER_KEY_VAULT_FORMAT } from "./memory_key_store";

export async function keep_vault_keys_through_reset(
  old_vault: EncryptedVault,
  old_password: string,
  new_password: string,
  recovery_codes: string[],
): Promise<EncryptedVault> {
  const kept: EncryptedVault = {
    ...old_vault,
    previous_keys: [...(old_vault.previous_keys ?? [])],
  };

  await reprotect_vault_keys_for_password_change(
    kept,
    old_password,
    new_password,
  );

  const master_key = crypto.getRandomValues(new Uint8Array(32));
  const resealed: EncryptedVault = {
    ...kept,
    recovery_codes,
    data_kek: array_to_base64(master_key),
    data_kek_random: true,
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: new Date().toISOString(),
  };

  master_key.fill(0);
  delete resealed.legacy_keks;
  delete resealed.storage_rekey;

  return carry_vault_through_reset(
    old_vault,
    old_password,
    resealed,
    new_password,
  );
}
