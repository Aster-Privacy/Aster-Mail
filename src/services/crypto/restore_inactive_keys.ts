/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { get_current_account } from "../account_manager";
import {
  consume_inactive_key_set,
  fetch_inactive_key_set,
  list_inactive_key_sets,
} from "../api/recovery";

import {
  decrypt_vault,
  encrypt_vault,
  type EncryptedVault,
} from "./key_manager";
import {
  merge_previous_ratchet_keys,
  retain_previous_ratchet_keys,
  type LegacyDerivedKek,
  type RatchetKeySet,
} from "./key_manager_core";
import {
  prepend_kek_to_list,
  serialize_kek_for_vault,
} from "./legacy_keks";
import { base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";
import {
  derive_encryption_key_from_passphrase,
  get_passphrase_from_memory,
  get_storage_kdf_version,
  get_vault_from_memory,
  store_vault_in_memory,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
} from "./memory_key_store";
import {
  push_vault_to_server,
  verify_vault_roundtrip,
} from "./ensure_ratchet_keys";
import { with_vault_write_lock } from "./vault_write_lock";

async function harvest_storage_keys(
  old_vault: EncryptedVault,
  old_password: string,
): Promise<Uint8Array[]> {
  const harvested: Uint8Array[] = [];
  const encoded_keys = old_vault.data_kek ? [old_vault.data_kek] : [];

  for (const entry of old_vault.legacy_keks ?? []) {
    encoded_keys.push(entry.k);
  }

  for (const encoded of encoded_keys) {
    try {
      harvested.push(base64_to_array(encoded));
    } catch {
      continue;
    }
  }

  const passphrase_bytes = new TextEncoder().encode(old_password);
  const kdf_version = get_storage_kdf_version(old_vault);

  harvested.push(
    await derive_encryption_key_from_passphrase(passphrase_bytes, kdf_version),
  );

  if (kdf_version >= STORAGE_KDF_VERSION_STRETCHED) {
    harvested.push(
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_LEGACY,
      ),
    );
  }

  zero_uint8_array(passphrase_bytes);

  return harvested;
}

export async function count_inactive_key_sets(): Promise<number> {
  const listed = await list_inactive_key_sets();

  return listed.data?.inactive_key_sets.length ?? 0;
}

export async function restore_inactive_key_sets(
  old_password: string,
): Promise<number> {
  const listed = await list_inactive_key_sets();
  const inactive = listed.data?.inactive_key_sets ?? [];

  if (inactive.length === 0) return 0;

  return with_vault_write_lock(async () => {
    const account = await get_current_account();
    const user_id = account?.user?.id;
    const vault = get_vault_from_memory();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) return 0;

    const recovered: RatchetKeySet[][] = [];
    const recovered_keks: Uint8Array[] = [];
    const unlocked: string[] = [];

    for (const key_set of inactive) {
      const fetched = await fetch_inactive_key_set(key_set.id);

      if (!fetched.data) continue;

      try {
        const old_vault = await decrypt_vault(
          fetched.data.encrypted_vault,
          fetched.data.vault_nonce,
          old_password,
        );

        recovered.push(retain_previous_ratchet_keys(old_vault));
        recovered_keks.push(
          ...(await harvest_storage_keys(old_vault, old_password)),
        );
        unlocked.push(key_set.id);
      } catch {
        continue;
      }
    }

    if (unlocked.length === 0) return 0;

    let next_legacy_keks: LegacyDerivedKek[] | undefined = vault.legacy_keks;

    for (const raw of recovered_keks) {
      next_legacy_keks = prepend_kek_to_list(
        next_legacy_keks,
        serialize_kek_for_vault(raw),
      );
      zero_uint8_array(raw);
    }

    const next_vault: EncryptedVault = {
      ...vault,
      legacy_keks: next_legacy_keks,
      ratchet_previous_keys: merge_previous_ratchet_keys(
        vault.ratchet_previous_keys,
        ...recovered,
      ),
    };

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      next_vault,
      passphrase,
    );

    const roundtrip_ok = await verify_vault_roundtrip(
      encrypted_vault,
      vault_nonce,
      passphrase,
      next_vault.identity_key,
    );

    if (!roundtrip_ok) return 0;

    const pushed = await push_vault_to_server(
      encrypted_vault,
      vault_nonce,
      user_id,
      next_vault.vault_format,
      next_vault,
    );

    if (!pushed) return 0;

    await store_vault_in_memory(next_vault, passphrase, user_id);

    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

    for (const id of unlocked) {
      await consume_inactive_key_set(id);
    }

    return unlocked.length;
  });
}
