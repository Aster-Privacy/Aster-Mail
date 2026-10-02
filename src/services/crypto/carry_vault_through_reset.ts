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
import { merge_recovered_identity_keys } from "./identity_key_materials";
import {
  merge_previous_ratchet_keys,
  retain_previous_ratchet_keys,
} from "./key_manager_core";
import { append_keks_to_list, serialize_kek_for_vault } from "./legacy_keks";
import {
  carries_master_key,
  harvest_storage_keys,
} from "./restore_inactive_keys";
import { zero_uint8_array } from "./secure_memory";

export async function carry_vault_through_reset(
  old_vault: EncryptedVault,
  old_password: string,
  fresh_vault: EncryptedVault,
  new_password: string,
): Promise<EncryptedVault> {
  const identity = await merge_recovered_identity_keys(
    fresh_vault,
    [old_vault],
    old_password,
    new_password,
  );

  const keeps_master_key = carries_master_key(old_vault);
  const data_kek = keeps_master_key ? old_vault.data_kek : fresh_vault.data_kek;
  const harvested = await harvest_storage_keys(old_vault, old_password);
  const entries = harvested
    .filter((raw) => array_to_base64(raw) !== data_kek)
    .map((raw) => serialize_kek_for_vault(raw));
  const legacy_keks = append_keks_to_list(
    [...(old_vault.legacy_keks ?? []), ...(fresh_vault.legacy_keks ?? [])],
    entries,
  ).list;

  for (const raw of harvested) zero_uint8_array(raw);

  const carried: EncryptedVault = {
    ...fresh_vault,
    previous_keys: identity.previous_keys,
    legacy_identity_keys: identity.legacy_identity_keys,
    data_kek,
    legacy_keks,
    ratchet_previous_keys: merge_previous_ratchet_keys(
      fresh_vault.ratchet_previous_keys,
      retain_previous_ratchet_keys(old_vault),
    ),
  };

  if (keeps_master_key && old_vault.mk_created_at) {
    carried.mk_created_at = old_vault.mk_created_at;
  }

  if (old_vault.escrow_seed && !fresh_vault.escrow_seed) {
    carried.escrow_seed = old_vault.escrow_seed;
  }

  return carried;
}
