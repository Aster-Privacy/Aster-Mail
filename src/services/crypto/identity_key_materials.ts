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

import { reprotect_pgp_key } from "./key_manager_pgp_keygen";
import { unlock_private_key } from "./key_manager_pgp_unlocked_cache";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

export const MAX_PREVIOUS_KEYS = 10;
export const MAX_LEGACY_IDENTITY_KEYS = 32;

type IdentityKeySource = Pick<
  EncryptedVault,
  "identity_key" | "previous_keys" | "legacy_identity_keys"
>;

function unique_non_empty(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

export function vault_identity_key_materials(
  vault: IdentityKeySource | null | undefined,
): string[] {
  if (!vault) return [];

  return unique_non_empty([
    vault.identity_key,
    ...(vault.previous_keys ?? []),
    ...(vault.legacy_identity_keys ?? []),
  ]);
}

async function key_identity(armored: string): Promise<string> {
  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readKey({ armoredKey: armored });

    return `fp:${key.getFingerprint().toUpperCase()}`;
  } catch {
    return `raw:${armored}`;
  }
}

async function unique_by_fingerprint(keys: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const armored of keys) {
    if (!armored) continue;
    const id = await key_identity(armored);

    if (seen.has(id)) continue;
    seen.add(id);
    result.push(armored);
  }

  return result;
}

export async function retained_identity_key_materials(
  vault: IdentityKeySource,
): Promise<string[]> {
  const existing = unique_non_empty(vault.legacy_identity_keys ?? []);
  const known = new Set<string>();

  for (const armored of existing) {
    known.add(await key_identity(armored));
  }

  const added: string[] = [];

  if (vault.identity_key) {
    added.push(vault.identity_key);
    known.add(await key_identity(vault.identity_key));
  }

  for (const previous_key of vault.previous_keys ?? []) {
    if (!previous_key) continue;
    const id = await key_identity(previous_key);

    if (known.has(id)) continue;
    known.add(id);
    added.push(previous_key);
  }

  return unique_non_empty([...added, ...existing]).slice(
    0,
    MAX_LEGACY_IDENTITY_KEYS,
  );
}

export interface RecoveredIdentityKeys {
  identity_key?: string;
  signed_prekey_private?: string;
  previous_keys: string[];
  legacy_identity_keys: string[];
  absorbed: boolean[];
}

export async function merge_recovered_identity_keys(
  vault: IdentityKeySource,
  old_vaults: IdentityKeySource[],
  old_password: string,
  current_password: string,
): Promise<RecoveredIdentityKeys> {
  return merge_identity_keys_with(vault, old_vaults, (armored) =>
    reprotect_pgp_key(armored, old_password, current_password),
  );
}

export async function merge_identity_keys_with(
  vault: IdentityKeySource,
  old_vaults: IdentityKeySource[],
  relock: (armored: string) => Promise<string>,
): Promise<RecoveredIdentityKeys> {
  const recovered_per_vault: string[][] = [];
  const identity_recovered: boolean[] = [];
  const old_materials: string[] = [];

  for (const old_vault of old_vaults) {
    const reprotected: string[] = [];
    let identity_ok = !old_vault.identity_key;

    old_materials.push(...vault_identity_key_materials(old_vault));

    for (const armored of unique_non_empty([
      old_vault.identity_key,
      ...(old_vault.previous_keys ?? []),
    ])) {
      try {
        reprotected.push(await relock(armored));
        if (armored === old_vault.identity_key) identity_ok = true;
      } catch {
        continue;
      }
    }

    recovered_per_vault.push(reprotected);
    identity_recovered.push(identity_ok);
  }

  const previous_keys = (
    await unique_by_fingerprint([
      ...(vault.previous_keys ?? []),
      ...recovered_per_vault.flat(),
    ])
  ).slice(0, MAX_PREVIOUS_KEYS);

  const kept = new Set<string>();

  for (const armored of [vault.identity_key, ...previous_keys]) {
    if (armored) kept.add(await key_identity(armored));
  }

  const absorbed: boolean[] = [];

  for (let i = 0; i < old_vaults.length; i++) {
    const reprotected = recovered_per_vault[i];
    let all_kept = identity_recovered[i];

    for (const armored of reprotected) {
      if (!kept.has(await key_identity(armored))) all_kept = false;
    }

    absorbed.push(all_kept);
  }

  const legacy_identity_keys = unique_non_empty([
    ...(vault.legacy_identity_keys ?? []),
    ...old_materials,
  ]).slice(0, MAX_LEGACY_IDENTITY_KEYS);

  return { previous_keys, legacy_identity_keys, absorbed };
}

export async function reprotect_vault_keys_for_password_change(
  vault: EncryptedVault,
  current_password: string,
  new_password: string,
): Promise<void> {
  const retained = await retained_identity_key_materials(vault);

  const reprotected_identity_key = await reprotect_pgp_key(
    vault.identity_key,
    current_password,
    new_password,
  );

  const reprotected_previous: string[] = [];

  for (const previous_key of vault.previous_keys ?? []) {
    try {
      reprotected_previous.push(
        await reprotect_pgp_key(previous_key, current_password, new_password),
      );
    } catch {
      reprotected_previous.push(previous_key);
    }
  }

  const signed_prekey_private = vault.signed_prekey_private
    ? await reprotect_pgp_key(
        vault.signed_prekey_private,
        current_password,
        new_password,
      )
    : vault.signed_prekey_private;

  const previous_keys = await unique_by_fingerprint([
    reprotected_identity_key,
    ...reprotected_previous,
  ]);

  vault.identity_key = reprotected_identity_key;
  vault.previous_keys = previous_keys.slice(0, MAX_PREVIOUS_KEYS);
  vault.signed_prekey_private = signed_prekey_private;
  vault.legacy_identity_keys = retained;
}

export async function private_key_unlocks(
  armored: string,
  passphrase: string,
): Promise<boolean> {
  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readPrivateKey({ armoredKey: armored });

    if (key.isDecrypted()) return true;
  } catch {
    return true;
  }

  try {
    await unlock_private_key(armored, passphrase);

    return true;
  } catch {
    return false;
  }
}

export interface VaultPgpKeyRepair {
  identity_key: string;
  signed_prekey_private: string;
  previous_keys: string[];
  legacy_identity_keys: string[];
  repaired: number;
  locked: number;
}

export async function repair_vault_pgp_keys_with(
  vault: EncryptedVault,
  unlocks: (armored: string) => Promise<boolean>,
  relock: (armored: string) => Promise<string>,
): Promise<VaultPgpKeyRepair> {
  const locked_ids = new Set<string>();
  const repaired_ids = new Set<string>();
  const usable_ids = new Set<string>();
  const replaced: string[] = [];
  const usable_materials = new Set<string>();

  const repair = async (armored: string): Promise<string> => {
    if (!armored) return armored;

    const id = await key_identity(armored);

    if (await unlocks(armored)) {
      usable_ids.add(id);
      usable_materials.add(armored);

      return armored;
    }

    locked_ids.add(id);

    try {
      const relocked = await relock(armored);

      repaired_ids.add(id);
      usable_ids.add(id);
      usable_materials.add(relocked);
      replaced.push(armored);

      return relocked;
    } catch {
      return armored;
    }
  };

  const identity_key = await repair(vault.identity_key);
  const signed_prekey_private = await repair(vault.signed_prekey_private);
  const repaired_previous: string[] = [];

  for (const previous_key of vault.previous_keys ?? []) {
    repaired_previous.push(await repair(previous_key));
  }

  const recovered_legacy: string[] = [];

  for (const legacy_key of unique_non_empty(vault.legacy_identity_keys ?? [])) {
    if (usable_ids.has(await key_identity(legacy_key))) continue;

    const relocked = await repair(legacy_key);

    if (relocked !== legacy_key) recovered_legacy.push(relocked);
  }

  for (const id of usable_ids) locked_ids.delete(id);

  if (repaired_ids.size === 0) {
    return {
      identity_key: vault.identity_key,
      signed_prekey_private: vault.signed_prekey_private,
      previous_keys: vault.previous_keys ?? [],
      legacy_identity_keys: vault.legacy_identity_keys ?? [],
      repaired: 0,
      locked: locked_ids.size,
    };
  }

  const previous_keys = (
    await unique_by_fingerprint([
      ...repaired_previous.filter((key) => usable_materials.has(key)),
      ...recovered_legacy,
      ...repaired_previous.filter((key) => !usable_materials.has(key)),
    ])
  ).slice(0, MAX_PREVIOUS_KEYS);

  const legacy_identity_keys = unique_non_empty([
    ...replaced,
    ...(vault.legacy_identity_keys ?? []),
  ]).slice(0, MAX_LEGACY_IDENTITY_KEYS);

  return {
    identity_key,
    signed_prekey_private,
    previous_keys,
    legacy_identity_keys,
    repaired: repaired_ids.size,
    locked: locked_ids.size,
  };
}

export async function repair_vault_pgp_keys(
  vault: EncryptedVault,
  old_password: string,
  current_password: string,
): Promise<VaultPgpKeyRepair> {
  return repair_vault_pgp_keys_with(
    vault,
    (armored) => private_key_unlocks(armored, current_password),
    (armored) => reprotect_pgp_key(armored, old_password, current_password),
  );
}
