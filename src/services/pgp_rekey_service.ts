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
  generate_identity_keypair,
  prepare_pgp_key_data,
  encrypt_vault,
} from "@/services/crypto/key_manager";
import type {
  EncryptedVault,
  PgpKeyData,
} from "@/services/crypto/key_manager_core";
import { update_vault, republish_pgp_key } from "@/services/api/key_rotation";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
} from "@/services/crypto/memory_key_store";

const PREVIOUS_KEYS_LIMIT = 10;

let rekey_in_progress = false;

export interface RekeyBuild {
  new_vault: EncryptedVault;
  pgp_key_data: PgpKeyData;
}

export async function build_pgp_rekey(
  current_vault: EncryptedVault,
  password: string,
  user_email: string,
  user_name: string,
): Promise<RekeyBuild> {
  const new_keypair = await generate_identity_keypair(
    user_name,
    user_email,
    password,
  );

  const existing_previous = current_vault.previous_keys ?? [];
  const deduped = [
    new_keypair.secret_key,
    ...existing_previous.filter((k) => k !== new_keypair.secret_key),
  ].slice(0, PREVIOUS_KEYS_LIMIT);

  const new_vault: EncryptedVault = {
    ...current_vault,
    previous_keys: deduped,
  };

  const pgp_key_data = await prepare_pgp_key_data(new_keypair, password);

  return { new_vault, pgp_key_data };
}

export interface RekeyResult {
  success: boolean;
  error?: string;
  new_vault?: EncryptedVault;
  fingerprint?: string;
}

export async function perform_pgp_rekey(
  current_vault: EncryptedVault,
  password: string,
  user_email: string,
  user_name: string,
): Promise<RekeyResult> {
  try {
    const { new_vault, pgp_key_data } = await build_pgp_rekey(
      current_vault,
      password,
      user_email,
      user_name,
    );

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      new_vault,
      password,
    );

    const vault_saved = await update_vault(encrypted_vault, vault_nonce);

    if (!vault_saved.success) {
      return {
        success: false,
        error: vault_saved.error ?? "Failed to persist vault",
      };
    }

    const published = await republish_pgp_key(
      pgp_key_data as unknown as Record<string, unknown>,
    );

    if (published.error || !published.data?.success) {
      return {
        success: false,
        error: published.error ?? "Failed to republish key",
      };
    }

    return {
      success: true,
      new_vault,
      fingerprint: published.data.fingerprint,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown re-key error",
    };
  }
}

export async function rekey_pgp_if_needed(
  user_email: string | null,
  user_name: string | null,
): Promise<void> {
  if (rekey_in_progress) return;
  if (!user_email) return;

  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return;

  rekey_in_progress = true;

  try {
    const result = await perform_pgp_rekey(
      vault,
      passphrase,
      user_email,
      user_name || user_email,
    );

    if (result.success && result.new_vault) {
      await store_vault_in_memory(result.new_vault, passphrase);
    }
  } catch {
  } finally {
    rekey_in_progress = false;
  }
}
