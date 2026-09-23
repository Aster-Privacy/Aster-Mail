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
import {
  merge_previous_ratchet_keys,
  retain_previous_ratchet_keys,
  type EncryptedVault,
  type RatchetKeySet,
} from "@/services/crypto/key_manager_core";

import {
  decrypt_vault,
  derive_public_keys_from_private,
} from "@/services/crypto/key_manager_pgp";
import { encrypt_vault } from "@/services/crypto/key_manager";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
  MASTER_KEY_VAULT_FORMAT,
} from "@/services/crypto/memory_key_store";
import { with_vault_write_lock } from "@/services/crypto/vault_write_lock";
import { get_vault_history, update_vault } from "@/services/api/key_rotation";
import { get_current_account } from "@/services/account_manager";

async function derive_public_or_null(
  armored_secret_key: string,
): Promise<string | null> {
  try {
    const derived = await derive_public_keys_from_private([armored_secret_key]);

    return derived[0] ?? null;
  } catch {
    return null;
  }
}

async function collect_public_key_set(
  armored_secret_keys: string[],
): Promise<Set<string>> {
  const publics = new Set<string>();

  for (const key of armored_secret_keys) {
    const pub = await derive_public_or_null(key);

    if (pub) publics.add(pub);
  }

  return publics;
}

export async function recover_private_keys_from_history(): Promise<string[]> {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return [];

  const response = await get_vault_history();

  if (!response.data?.entries?.length) return [];

  const known_publics = await collect_public_key_set([
    vault.identity_key,
    ...(vault.previous_keys ?? []),
  ]);
  const recovered: string[] = [];

  for (const entry of response.data.entries) {
    let archived: EncryptedVault;

    try {
      archived = await decrypt_vault(
        entry.encrypted_vault,
        entry.vault_nonce,
        passphrase,
      );
    } catch {
      continue;
    }

    for (const key of [
      archived.identity_key,
      ...(archived.previous_keys ?? []),
    ]) {
      if (!key) continue;

      const pub = await derive_public_or_null(key);

      if (!pub || known_publics.has(pub)) continue;

      known_publics.add(pub);
      recovered.push(key);
    }
  }

  return recovered;
}

export async function merge_recovered_keys_into_vault(
  recovered_keys: string[],
): Promise<boolean> {
  if (!recovered_keys.length) return false;

  return with_vault_write_lock(async () => {
    const vault = get_vault_from_memory();
    const passphrase = get_passphrase_from_memory();

    if (!vault || !passphrase) return false;

    const known_publics = await collect_public_key_set([
      vault.identity_key,
      ...(vault.previous_keys ?? []),
    ]);
    const additions: string[] = [];

    for (const key of recovered_keys) {
      const pub = await derive_public_or_null(key);

      if (!pub || known_publics.has(pub)) continue;

      known_publics.add(pub);
      additions.push(key);
    }

    if (!additions.length) return false;

    const new_vault: EncryptedVault = {
      ...vault,
      previous_keys: [...(vault.previous_keys ?? []), ...additions],
    };
    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      new_vault,
      passphrase,
    );
    const current_account = await get_current_account();
    const saved = await update_vault(
      encrypted_vault,
      vault_nonce,
      new_vault.data_kek ? MASTER_KEY_VAULT_FORMAT : new_vault.vault_format,
      current_account?.user?.id,
      undefined,
      new_vault,
    );

    if (!saved.success) return false;

    await store_vault_in_memory(new_vault, passphrase);

    return true;
  });
}

let ratchet_recovery_attempted_for: string | null = null;

export function reset_ratchet_key_recovery_state(): void {
  ratchet_recovery_attempted_for = null;
}

function known_ratchet_identities(vault: EncryptedVault): Set<string> {
  const known = new Set<string>();

  if (vault.ratchet_identity_public) known.add(vault.ratchet_identity_public);

  for (const previous of vault.ratchet_previous_keys ?? []) {
    if (previous.ratchet_identity_public) {
      known.add(previous.ratchet_identity_public);
    }
  }

  return known;
}

export async function recover_ratchet_keys_from_history_locked(): Promise<EncryptedVault | null> {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();
  const current_account = await get_current_account();
  const user_id = current_account?.user?.id;

  if (!vault || !passphrase || !user_id) return null;

  if (ratchet_recovery_attempted_for === user_id) return null;

  ratchet_recovery_attempted_for = user_id;

  const response = await get_vault_history();
  const entries = response.data?.entries ?? [];

  if (!entries.length) return null;

  const known = known_ratchet_identities(vault);
  const recovered: RatchetKeySet[] = [];

  for (const entry of entries) {
    let archived: EncryptedVault;

    try {
      archived = await decrypt_vault(
        entry.encrypted_vault,
        entry.vault_nonce,
        passphrase,
      );
    } catch {
      continue;
    }

    for (const key_set of retain_previous_ratchet_keys(archived)) {
      if (known.has(key_set.ratchet_identity_public)) continue;

      known.add(key_set.ratchet_identity_public);
      recovered.push(key_set);
    }
  }

  if (!recovered.length) return null;

  const merged = merge_previous_ratchet_keys(
    recovered,
    vault.ratchet_previous_keys,
  );
  const recovered_publics = new Set(
    recovered.map((key_set) => key_set.ratchet_identity_public),
  );

  if (
    !merged.some((key_set) =>
      recovered_publics.has(key_set.ratchet_identity_public),
    )
  ) {
    return null;
  }

  const next_vault: EncryptedVault = {
    ...vault,
    ratchet_previous_keys: merged,
  };
  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    next_vault,
    passphrase,
  );

  try {
    const roundtrip = await decrypt_vault(
      encrypted_vault,
      vault_nonce,
      passphrase,
    );

    if (
      roundtrip.identity_key !== next_vault.identity_key ||
      (roundtrip.ratchet_previous_keys?.length ?? 0) !== merged.length
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const saved = await update_vault(
    encrypted_vault,
    vault_nonce,
    next_vault.data_kek ? MASTER_KEY_VAULT_FORMAT : next_vault.vault_format,
    user_id,
    true,
    next_vault,
  );

  if (!saved.success) return null;

  await store_vault_in_memory(next_vault, passphrase, user_id);

  try {
    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);
  } catch {
    return next_vault;
  }

  return next_vault;
}

export function recover_ratchet_keys_from_history(): Promise<EncryptedVault | null> {
  return with_vault_write_lock(recover_ratchet_keys_from_history_locked);
}
