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
  dedupe_ratchet_keys,
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
  server_vault_matches_stored,
  sync_vault_with_server,
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
import { refresh_recovery_backup } from "./recovery_backup_refresh";
import { reprotect_pgp_key } from "./key_manager_pgp_keygen";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

export async function latest_vault_for_commit(): Promise<EncryptedVault | null> {
  const freshness = await sync_vault_with_server();

  if (freshness.status === "unverified") return null;
  if (freshness.status === "adopted") return freshness.vault;

  return get_vault_from_memory();
}

export function carries_master_key(vault: EncryptedVault): boolean {
  return (
    (vault.vault_format ?? 1) >= 2 &&
    typeof vault.data_kek === "string" &&
    vault.data_kek.length > 0
  );
}

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

export interface PasswordRestoreResult {
  restored: number;
  incomplete: number;
  wrong_password: boolean;
}

const NO_PASSWORD_RESTORE: PasswordRestoreResult = {
  restored: 0,
  incomplete: 0,
  wrong_password: false,
};

export async function restore_inactive_key_sets(
  old_password: string,
): Promise<PasswordRestoreResult> {
  const listed = await list_inactive_key_sets();
  const inactive = listed.data?.inactive_key_sets ?? [];

  if (inactive.length === 0) return NO_PASSWORD_RESTORE;

  return with_vault_write_lock(async () => {
    const account = await get_current_account();
    const user_id = account?.user?.id;
    const vault = await latest_vault_for_commit();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) return NO_PASSWORD_RESTORE;

    const recovered: RatchetKeySet[][] = [];
    const recovered_keks: Uint8Array[] = [];
    const unlocked: string[] = [];
    const old_vaults: EncryptedVault[] = [];
    let fetched_count = 0;
    let locked_count = 0;

    for (const key_set of inactive) {
      const fetched = await fetch_inactive_key_set(key_set.id);

      if (!fetched.data) continue;

      fetched_count += 1;

      let old_vault: EncryptedVault;

      try {
        old_vault = await decrypt_vault(
          fetched.data.encrypted_vault,
          fetched.data.vault_nonce,
          old_password,
        );
      } catch {
        locked_count += 1;
        continue;
      }

      try {
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

    if (unlocked.length === 0) {
      return {
        restored: 0,
        incomplete: 0,
        wrong_password: fetched_count > 0 && locked_count === fetched_count,
      };
    }

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

    if (!committed.written) {
      return {
        restored: 0,
        incomplete: unlocked.length,
        wrong_password: false,
      };
    }

    const absorbed = commit_dropped_keys(committed)
      ? []
      : unlocked.filter((_, i) => identity_keys.absorbed[i]);

    for (const id of absorbed) {
      await consume_inactive_key_set(id);
    }

    return {
      restored: unlocked.length,
      incomplete: unlocked.length - absorbed.length,
      wrong_password: false,
    };
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
    const vault = await latest_vault_for_commit();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) {
      return { restored: 0, incomplete: 0 };
    }

    const recovered: RatchetKeySet[][] = [];
    const recovered_keks: Uint8Array[] = [];
    const opened: string[] = [];
    const password_bound: boolean[] = [];
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
        password_bound.push(!carries_master_key(old_vault));
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

    if (!committed.written) return { restored: 0, incomplete: opened.length };

    const absorbed = commit_dropped_keys(committed)
      ? []
      : opened.filter(
          (_, i) => identity_keys.absorbed[i] && !password_bound[i],
        );

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

export interface RecoveredKeyCommitResult {
  written: boolean;
  dropped_keks: number;
  dropped_ratchet_keys: number;
  roundtrip_failed?: boolean;
}

const COMMIT_NOT_WRITTEN: RecoveredKeyCommitResult = {
  written: false,
  dropped_keks: 0,
  dropped_ratchet_keys: 0,
};

export function commit_dropped_keys(committed: RecoveredKeyCommitResult): boolean {
  return committed.dropped_keks > 0 || committed.dropped_ratchet_keys > 0;
}

export async function commit_recovered_keys(
  commit: RecoveredKeyCommit,
): Promise<RecoveredKeyCommitResult> {
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

  const ratchet_previous_keys = dedupe_ratchet_keys(
    vault.ratchet_previous_keys,
    ...commit.ratchet_groups,
  );
  const next_vault: EncryptedVault = {
    ...vault,
    previous_keys: identity_keys.previous_keys,
    legacy_identity_keys: identity_keys.legacy_identity_keys,
    legacy_keks: absorbed_keks.list,
    ratchet_previous_keys,
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

  if (!roundtrip_ok) return { ...COMMIT_NOT_WRITTEN, roundtrip_failed: true };
  if (!(await server_vault_matches_stored(user_id))) return COMMIT_NOT_WRITTEN;

  const pushed = await push_vault_to_server(
    encrypted_vault,
    vault_nonce,
    user_id,
    next_vault.vault_format,
    next_vault,
  );

  if (!pushed) return COMMIT_NOT_WRITTEN;

  await store_vault_in_memory(next_vault, passphrase, user_id);

  localStorage.setItem(`astermail_encrypted_vault_${user_id}`, encrypted_vault);
  localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

  await refresh_recovery_backup(next_vault, passphrase);

  return {
    written: true,
    dropped_keks: absorbed_keks.dropped,
    dropped_ratchet_keys: 0,
  };
}

export const KEY_FILE_MAX_BYTES = 256 * 1024;
const PRIVATE_KEY_HEADER = "-----BEGIN PGP PRIVATE KEY BLOCK-----";

export interface KeyFileImportResult {
  status:
    | "imported"
    | "invalid"
    | "wrong_password"
    | "already_present"
    | "failed";
  unlocked: boolean;
}

async function read_key_file_fingerprint(
  armored: string,
): Promise<string | null> {
  if (
    armored.length > KEY_FILE_MAX_BYTES ||
    !armored.startsWith(PRIVATE_KEY_HEADER)
  ) {
    return null;
  }

  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readPrivateKey({ armoredKey: armored });

    return key.getFingerprint().toUpperCase();
  } catch {
    return null;
  }
}

async function fingerprints_of(
  keys: (string | undefined)[],
): Promise<Set<string>> {
  const openpgp = await load_openpgp();
  const result = new Set<string>();

  for (const armored of keys) {
    if (!armored) continue;

    try {
      const key = await openpgp.readKey({ armoredKey: armored });

      result.add(key.getFingerprint().toUpperCase());
    } catch {
      continue;
    }
  }

  return result;
}

async function derive_key_file_storage_keys(
  password: string,
): Promise<Uint8Array[]> {
  const passphrase_bytes = new TextEncoder().encode(password);

  try {
    return [
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_STRETCHED,
      ),
      await derive_encryption_key_from_passphrase(
        passphrase_bytes,
        STORAGE_KDF_VERSION_LEGACY,
      ),
    ];
  } finally {
    zero_uint8_array(passphrase_bytes);
  }
}

export async function import_identity_key_file(
  key_file_text: string,
  key_password: string,
): Promise<KeyFileImportResult> {
  const armored = key_file_text.replace(/\r\n?/g, "\n").trim() + "\n";
  const materials = Array.from(new Set([key_file_text, armored]));
  const fingerprint =
    key_file_text.length > KEY_FILE_MAX_BYTES
      ? null
      : await read_key_file_fingerprint(armored);

  if (!fingerprint) return { status: "invalid", unlocked: false };

  return with_vault_write_lock(async () => {
    const account = await get_current_account();
    const user_id = account?.user?.id;
    const vault = await latest_vault_for_commit();
    const passphrase = get_passphrase_from_memory();

    if (!user_id || !vault || !passphrase) {
      return { status: "failed", unlocked: false };
    }

    let relocked: string | null = null;

    if (key_password) {
      try {
        relocked = await reprotect_pgp_key(armored, key_password, passphrase);
      } catch {
        return { status: "wrong_password", unlocked: false };
      }
    }

    const held = await fingerprints_of([
      vault.identity_key,
      ...(vault.previous_keys ?? []),
    ]);
    const material_known = materials.every((material) =>
      (vault.legacy_identity_keys ?? []).includes(material),
    );

    if (material_known && (held.has(fingerprint) || !relocked)) {
      return { status: "already_present", unlocked: held.has(fingerprint) };
    }

    const identity_keys = await merge_identity_keys_with(
      vault,
      [{ identity_key: armored, previous_keys: materials }],
      async (candidate) => {
        if (!relocked || !materials.includes(candidate)) {
          throw new Error("key_file_locked");
        }

        return relocked;
      },
    );

    if (
      !materials.every((material) =>
        identity_keys.legacy_identity_keys.includes(material),
      )
    ) {
      return { status: "failed", unlocked: false };
    }

    const unlocked =
      held.has(fingerprint) ||
      (!!relocked &&
        (await fingerprints_of(identity_keys.previous_keys)).has(fingerprint));

    const committed = await commit_recovered_keys({
      user_id,
      vault,
      passphrase,
      identity_keys,
      ratchet_groups: [],
      storage_keys: key_password
        ? await derive_key_file_storage_keys(key_password)
        : [],
    });

    if (!committed.written) return { status: "failed", unlocked: false };

    return { status: "imported", unlocked };
  });
}
