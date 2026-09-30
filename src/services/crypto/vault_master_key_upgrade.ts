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

import {
  MASTER_KEY_VAULT_FORMAT,
  derive_encryption_key_from_passphrase,
  get_storage_kdf_version,
  is_master_key_vault,
} from "./memory_key_store";
import { prepend_kek_to_list, serialize_kek_for_vault } from "./legacy_keks";

export async function upgrade_vault_to_master_key(
  vault: EncryptedVault,
  current_password: string,
): Promise<boolean> {
  if (is_master_key_vault(vault)) return true;

  const passphrase_bytes = new TextEncoder().encode(current_password);

  let storage_key: Uint8Array;

  try {
    storage_key = await derive_encryption_key_from_passphrase(
      passphrase_bytes,
      get_storage_kdf_version(vault),
    );
  } catch {
    return false;
  } finally {
    passphrase_bytes.fill(0);
  }

  if (storage_key.length !== 32) {
    storage_key.fill(0);

    return false;
  }

  const serialized = serialize_kek_for_vault(storage_key);

  vault.data_kek = serialized.k;
  vault.vault_format = MASTER_KEY_VAULT_FORMAT;
  vault.mk_created_at = vault.mk_created_at ?? new Date().toISOString();
  vault.legacy_keks = prepend_kek_to_list(vault.legacy_keks, serialized);

  storage_key.fill(0);

  return true;
}
