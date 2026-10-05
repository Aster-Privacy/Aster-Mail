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

import { lock_unlocked_pgp_key } from "./key_manager_pgp_keygen";
import { unlock_private_key } from "./key_manager_pgp_unlocked_cache";
import { load_openpgp } from "./openpgp_loader";

const MAX_UNLOCKED_KEYS = 16;

export type UnlockedKeyPair = [string, string];

export type BackupVault = EncryptedVault & {
  unlocked_keys?: UnlockedKeyPair[];
};

export async function build_backup_vault(
  vault: EncryptedVault,
  passphrase: string,
): Promise<BackupVault> {
  const base = strip_backup_fields(vault);
  const unlocked_keys: UnlockedKeyPair[] = [];
  const seen = new Set<string>();

  await load_openpgp();

  for (const armored of [base.identity_key, ...(base.previous_keys ?? [])]) {
    if (!armored || seen.has(armored)) continue;
    if (unlocked_keys.length >= MAX_UNLOCKED_KEYS) break;
    seen.add(armored);

    try {
      const key = await unlock_private_key(armored, passphrase);

      unlocked_keys.push([armored, key.armor()]);
    } catch {
      continue;
    }
  }

  if (unlocked_keys.length === 0) return base;

  return { ...base, unlocked_keys };
}

export function strip_backup_fields(vault: BackupVault): EncryptedVault {
  if (!("unlocked_keys" in vault)) return vault;

  const rest: BackupVault = { ...vault };

  delete rest.unlocked_keys;

  return rest;
}

export function read_unlocked_keys(vault: BackupVault): Map<string, string> {
  const unlocked = new Map<string, string>();

  if (!Array.isArray(vault.unlocked_keys)) return unlocked;

  for (const pair of vault.unlocked_keys) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;

    const [locked, open] = pair;

    if (typeof locked !== "string" || typeof open !== "string") continue;
    if (!locked || !open) continue;
    if (unlocked.size >= MAX_UNLOCKED_KEYS) break;

    unlocked.set(locked, open);
  }

  return unlocked;
}

export function relock_with_unlocked_keys(
  unlocked: Map<string, string>,
  passphrase: string,
): (armored: string) => Promise<string> {
  return async (armored: string) => {
    const open = unlocked.get(armored);

    if (!open) throw new Error("no unlocked copy for this key");

    return lock_unlocked_pgp_key(open, passphrase);
  };
}
