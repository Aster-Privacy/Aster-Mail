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
  lock_unlocked_pgp_key,
  reprotect_pgp_key,
} from "./key_manager_pgp_keygen";
import {
  MAX_PREVIOUS_KEYS,
  private_key_unlocks,
  retained_identity_key_materials,
} from "./identity_key_materials";
import { load_openpgp } from "./openpgp_loader";

export class RecoveryPreviousPasswordIncorrect extends Error {
  constructor() {
    super("previous password does not unlock the identity key");
    this.name = "RecoveryPreviousPasswordIncorrect";
  }
}

export interface RecoveryVaultReseal {
  vault: EncryptedVault;
  identity_locked: boolean;
}

async function is_locked_pgp_key(armored: string | undefined): Promise<boolean> {
  if (!armored) return false;
  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readPrivateKey({ armoredKey: armored });

    return !key.isDecrypted();
  } catch {
    return false;
  }
}

export async function recovery_locked_identity_key(
  vault: EncryptedVault,
  unlocked_keys: Map<string, string>,
): Promise<string | null> {
  const identity = vault.identity_key;

  if (!identity || unlocked_keys.has(identity)) return null;

  return (await is_locked_pgp_key(identity)) ? identity : null;
}

export async function recovery_needs_previous_password(
  vault: EncryptedVault,
  unlocked_keys: Map<string, string>,
): Promise<boolean> {
  return (await recovery_locked_identity_key(vault, unlocked_keys)) !== null;
}

async function relock_from_backup(
  armored: string,
  unlocked_keys: Map<string, string>,
  new_password: string,
): Promise<string | null> {
  const open = unlocked_keys.get(armored);

  if (!open) return null;

  try {
    return await lock_unlocked_pgp_key(open, new_password);
  } catch {
    return null;
  }
}

async function reprotect_with_previous(
  armored: string,
  previous_password: string,
  new_password: string,
): Promise<string | null> {
  if (!(await is_locked_pgp_key(armored))) return null;

  try {
    return await reprotect_pgp_key(armored, previous_password, new_password);
  } catch {
    return null;
  }
}

async function reseal_key(
  armored: string,
  unlocked_keys: Map<string, string>,
  new_password: string,
  previous_password: string | null,
): Promise<string | null> {
  const relocked = await relock_from_backup(
    armored,
    unlocked_keys,
    new_password,
  );

  if (relocked) return relocked;
  if (!previous_password) return null;

  return reprotect_with_previous(armored, previous_password, new_password);
}

export async function reseal_recovery_vault(
  source: EncryptedVault,
  unlocked_keys: Map<string, string>,
  new_password: string,
  previous_password: string | null,
): Promise<RecoveryVaultReseal> {
  const usable_previous = previous_password ? previous_password : null;
  const locked_identity = await recovery_locked_identity_key(
    source,
    unlocked_keys,
  );

  if (
    locked_identity &&
    usable_previous &&
    !(await private_key_unlocks(locked_identity, usable_previous))
  ) {
    throw new RecoveryPreviousPasswordIncorrect();
  }

  const vault: EncryptedVault = { ...source };
  const retained = await retained_identity_key_materials(source);
  let changed = false;

  if (vault.identity_key) {
    const resealed = await reseal_key(
      vault.identity_key,
      unlocked_keys,
      new_password,
      usable_previous,
    );

    if (resealed) {
      vault.identity_key = resealed;
      changed = true;
    }
  }

  const previous_keys: string[] = [];
  const seen = new Set<string>([source.identity_key]);

  for (const armored of source.previous_keys ?? []) {
    if (!armored || seen.has(armored)) continue;
    seen.add(armored);

    const resealed = await reseal_key(
      armored,
      unlocked_keys,
      new_password,
      usable_previous,
    );

    if (resealed) changed = true;
    previous_keys.push(resealed ?? armored);
  }

  vault.previous_keys = previous_keys.slice(0, MAX_PREVIOUS_KEYS);

  if (vault.signed_prekey_private && usable_previous) {
    const resealed = await reprotect_with_previous(
      vault.signed_prekey_private,
      usable_previous,
      new_password,
    );

    if (resealed) vault.signed_prekey_private = resealed;
  }

  if (changed) {
    vault.legacy_identity_keys = retained;
  }

  const identity_locked =
    (await is_locked_pgp_key(vault.identity_key)) &&
    !(await private_key_unlocks(vault.identity_key, new_password));

  return { vault, identity_locked };
}
