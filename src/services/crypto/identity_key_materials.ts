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

import * as openpgp from "openpgp";

import { reprotect_pgp_key } from "./key_manager_pgp_keygen";

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
