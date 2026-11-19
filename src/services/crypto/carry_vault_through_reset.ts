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
import { MASTER_KEY_VAULT_FORMAT } from "./memory_key_store";
import { mark_keks_for_retirement } from "./retired_storage_keks";
import { with_retired_storage_hashes } from "./retired_storage_hashes";
import { zero_uint8_array } from "./secure_memory";
import {
  collect_prior_storage_keys,
  has_pending_storage_rekey,
  install_random_storage_key,
} from "./storage_write_key";

function merge_folder_pins(
  old_vault: EncryptedVault,
  fresh_vault: EncryptedVault,
): EncryptedVault["folder_pins"] {
  if (!old_vault.folder_pins && !fresh_vault.folder_pins) return undefined;

  return { ...old_vault.folder_pins, ...fresh_vault.folder_pins };
}

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

  const keeps_master_key =
    carries_master_key(old_vault) && old_vault.data_kek_random === true;
  const harvested = await harvest_storage_keys(old_vault, old_password);
  const legacy_keks = append_keks_to_list(
    [...(old_vault.legacy_keks ?? []), ...(fresh_vault.legacy_keks ?? [])],
    harvested.map((raw) => serialize_kek_for_vault(raw)),
  ).list;

  const carried: EncryptedVault = {
    ...fresh_vault,
    previous_keys: identity.previous_keys,
    legacy_identity_keys: identity.legacy_identity_keys,
    legacy_keks,
    ratchet_previous_keys: merge_previous_ratchet_keys(
      fresh_vault.ratchet_previous_keys,
      retain_previous_ratchet_keys(old_vault),
    ),
  };
  const folder_pins = merge_folder_pins(old_vault, fresh_vault);

  if (folder_pins) carried.folder_pins = folder_pins;

  delete carried.storage_rekey;

  if (keeps_master_key) {
    carried.data_kek = old_vault.data_kek;
    carried.data_kek_random = true;
    carried.vault_format = MASTER_KEY_VAULT_FORMAT;

    if (old_vault.mk_created_at) {
      carried.mk_created_at = old_vault.mk_created_at;
    }

    if (old_vault.storage_rekey) {
      carried.storage_rekey = {
        ...old_vault.storage_rekey,
        prior_keys: old_vault.storage_rekey.prior_keys
          ? [...old_vault.storage_rekey.prior_keys]
          : undefined,
      };
    }

    carried.legacy_keks = legacy_keks.filter(
      (entry) => entry.k !== old_vault.data_kek,
    );
  } else {
    const prior_keys = await collect_prior_storage_keys(
      old_vault,
      old_password,
    );

    if (has_pending_storage_rekey(old_vault)) {
      carried.storage_rekey = old_vault.storage_rekey;
    }

    try {
      install_random_storage_key(carried, prior_keys);
    } finally {
      prior_keys.forEach((raw) => zero_uint8_array(raw));
    }
  }

  const pending_retire_kek_ids = mark_keks_for_retirement(
    [
      ...(old_vault.pending_retire_kek_ids ?? []),
      ...(fresh_vault.pending_retire_kek_ids ?? []),
    ],
    harvested,
    carried.data_kek,
  );

  if (pending_retire_kek_ids.length > 0) {
    carried.pending_retire_kek_ids = pending_retire_kek_ids;
  }

  for (const raw of harvested) zero_uint8_array(raw);

  if (old_vault.escrow_seed && !fresh_vault.escrow_seed) {
    carried.escrow_seed = old_vault.escrow_seed;

    if (old_vault.escrow_format === undefined) {
      delete carried.escrow_format;
    } else {
      carried.escrow_format = old_vault.escrow_format;
    }
  }

  if (old_vault.prekey_seal_key && !fresh_vault.prekey_seal_key) {
    carried.prekey_seal_key = old_vault.prekey_seal_key;
  }

  if (old_vault.prekey_seal_migrated === true) {
    carried.prekey_seal_migrated = true;
  }

  return with_retired_storage_hashes(carried, old_vault);
}
