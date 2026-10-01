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
  unlock_inactive_key_sets_with_code,
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
import { append_keks_to_list, serialize_kek_for_vault } from "./legacy_keks";
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
import {
  merge_identity_keys_with,
  merge_recovered_identity_keys,
  type RecoveredIdentityKeys,
} from "./identity_key_materials";
import {
  read_unlocked_keys,
  relock_with_unlocked_keys,
  strip_backup_fields,
  type BackupVault,
} from "./backup_unlocked_keys";
import {
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
  hash_recovery_code,
} from "./recovery_key";

export function harvest_vault_storage_keys(
  old_vault: EncryptedVault,
): Uint8Array[] {
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

  return harvested;
}

export async function harvest_storage_keys(
  old_vault: EncryptedVault,
  old_password: string,
): Promise<Uint8Array[]> {
  const harvested = harvest_vault_storage_keys(old_vault);

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
    const old_vaults: EncryptedVault[] = [];

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
        old_vaults.push(old_vault);
      } catch {
        continue;
      }
    }

    if (unlocked.length === 0) return 0;

    const identity_keys = await merge_recovered_identity_keys(
      vault,
      old_vaults,
      old_password,
      passphrase,
    );

    const committed = await commit_recovered_keys({
      user_id,
      vault,
      passphrase,
      identity_keys,
      ratchet_groups: recovered,
      storage_keys: recovered_keks,
    });

    if (!committed) return 0;

    const absorbed = unlocked.filter((_, i) => identity_keys.absorbed[i]);

    for (const id of absorbed) {
      await consume_inactive_key_set(id);
    }

    return unlocked.length;
  });
}

export const RECOVERY_CODE_RATE_LIMITED = "recovery_code_rate_limited";

export interface CodeRestoreResult {
  restored: number;
  incomplete: number;
}

export async function restore_inactive_key_sets_with_code(
  code: string,
): Promise<CodeRestoreResult> {
  const code_hash = await hash_recovery_code(code);
  const response = await unlock_inactive_key_sets_with_code(code_hash);

  if (!response.data) {
    throw new Error(
      response.status === 429
        ? RECOVERY_CODE_RATE_LIMITED
        : (response.code ?? "recovery_code_unlock_failed"),
    );
  }

  const key_sets = response.data.key_sets;

  if (key_sets.length === 0) return { restored: 0, incomplete: 0 };

  return with_vault_write_lock(async () => {
    const account = await get_current_account();
    const user_id = account?.user?.id;
    const vault = get_vault_from_memory();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) {
      return { restored: 0, incomplete: 0 };
    }

    const recovered: RatchetKeySet[][] = [];
    const recovered_keks: Uint8Array[] = [];
    const opened: string[] = [];
    const old_vaults: EncryptedVault[] = [];
    const unlocked_keys = new Map<string, string>();

    for (const key_set of key_sets) {
      let recovery_key: Uint8Array | null = null;

      try {
        recovery_key = await decrypt_recovery_key_with_code(
          {
            encrypted_key: key_set.encrypted_recovery_key,
            nonce: key_set.recovery_key_nonce,
            salt: key_set.code_salt,
          },
          code,
        );

        const old_vault: BackupVault = await decrypt_vault_backup(
          {
            encrypted_data: key_set.encrypted_vault_backup,
            nonce: key_set.vault_backup_nonce,
            salt: key_set.recovery_key_salt,
          },
          recovery_key,
        );

        for (const [locked, open] of read_unlocked_keys(old_vault)) {
          unlocked_keys.set(locked, open);
        }

        recovered.push(retain_previous_ratchet_keys(old_vault));
        recovered_keks.push(...harvest_vault_storage_keys(old_vault));
        opened.push(key_set.inactive_vault_id);
        old_vaults.push(strip_backup_fields(old_vault));
      } catch {
        continue;
      } finally {
        if (recovery_key) zero_uint8_array(recovery_key);
      }
    }

    if (opened.length === 0) return { restored: 0, incomplete: 0 };

    const identity_keys = await merge_identity_keys_with(
      vault,
      old_vaults,
      relock_with_unlocked_keys(unlocked_keys, passphrase),
    );

    unlocked_keys.clear();

    const committed = await commit_recovered_keys({
      user_id,
      vault,
      passphrase,
      identity_keys,
      ratchet_groups: recovered,
      storage_keys: recovered_keks,
    });

    if (!committed) return { restored: 0, incomplete: opened.length };

    const absorbed = opened.filter((_, i) => identity_keys.absorbed[i]);

    for (const id of absorbed) {
      await consume_inactive_key_set(id);
    }

    return {
      restored: opened.length,
      incomplete: opened.length - absorbed.length,
    };
  });
}

export interface RecoveredKeyCommit {
  user_id: string;
  vault: EncryptedVault;
  passphrase: string;
  identity_keys: RecoveredIdentityKeys;
  ratchet_groups: RatchetKeySet[][];
  storage_keys: Uint8Array[];
}

export async function commit_recovered_keys(
  commit: RecoveredKeyCommit,
): Promise<boolean> {
  const { user_id, vault, passphrase, identity_keys } = commit;
  const harvested_entries: LegacyDerivedKek[] = [];

  for (const raw of commit.storage_keys) {
    harvested_entries.push(serialize_kek_for_vault(raw));
    zero_uint8_array(raw);
  }

  const absorbed_keks = append_keks_to_list(
    vault.legacy_keks,
    harvested_entries,
  );

  const next_vault: EncryptedVault = {
    ...vault,
    previous_keys: identity_keys.previous_keys,
    legacy_identity_keys: identity_keys.legacy_identity_keys,
    legacy_keks: absorbed_keks.list,
    ratchet_previous_keys: merge_previous_ratchet_keys(
      vault.ratchet_previous_keys,
      ...commit.ratchet_groups,
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

  if (!roundtrip_ok) return false;

  const pushed = await push_vault_to_server(
    encrypted_vault,
    vault_nonce,
    user_id,
    next_vault.vault_format,
    next_vault,
  );

  if (!pushed) return false;

  await store_vault_in_memory(next_vault, passphrase, user_id);

  localStorage.setItem(`astermail_encrypted_vault_${user_id}`, encrypted_vault);
  localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

  return absorbed_keks.dropped === 0;
}
