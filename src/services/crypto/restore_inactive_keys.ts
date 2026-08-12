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

import { decrypt_vault, encrypt_vault, type EncryptedVault } from "./key_manager";
import {
  merge_previous_ratchet_keys,
  retain_previous_ratchet_keys,
  type RatchetKeySet,
} from "./key_manager_core";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import {
  push_vault_to_server,
  verify_vault_roundtrip,
} from "./ensure_ratchet_keys";
import { with_vault_write_lock } from "./vault_write_lock";
import { get_current_account } from "../account_manager";
import {
  consume_inactive_key_set,
  fetch_inactive_key_set,
  list_inactive_key_sets,
} from "../api/recovery";

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
        unlocked.push(key_set.id);
      } catch {
        continue;
      }
    }

    if (unlocked.length === 0) return 0;

    const next_vault: EncryptedVault = {
      ...vault,
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
