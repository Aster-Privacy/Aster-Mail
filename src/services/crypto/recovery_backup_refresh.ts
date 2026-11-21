//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import type { EncryptedVault } from "./key_manager";

import { get_codes_status, save_recovery_backup } from "../api/recovery";
import { get_sync_format_readiness } from "../api/sync_format_readiness";

import { build_backup_vault } from "./backup_unlocked_keys";
import { get_vault_from_memory } from "./memory_key_store";
import { write_vault_merged } from "./vault_cas_write";
import {
  next_recovery_backup_binding,
  raise_recovery_backup_floor,
  type RecoveryBackupBinding,
} from "./recovery_backup_floor";
import {
  clear_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  generate_recovery_key,
  type RecoveryShareOptions,
} from "./recovery_key";

import { ignore_error } from "@/lib/ignore_error";

export function recovery_codes_of(vault: EncryptedVault): string[] {
  return (vault.recovery_codes ?? []).filter(
    (code) => typeof code === "string" && code.length > 0,
  );
}

export async function recovery_backup_binding_if_ready(
  user_id: string,
  known_generation = 0,
): Promise<RecoveryBackupBinding | null> {
  if (!user_id) return null;

  const binding = next_recovery_backup_binding(
    user_id,
    Math.max(
      known_generation,
      get_vault_from_memory()?.recovery_backup_generation ?? 0,
    ),
  );

  if (binding.generation > 1) return binding;

  const readiness = await get_sync_format_readiness();

  return readiness.recovery_backup_bound ? binding : null;
}

export async function current_recovery_backup_binding(
  vault?: EncryptedVault,
): Promise<RecoveryBackupBinding | null> {
  const { get_current_account } = await import("@/services/account_manager");

  return recovery_backup_binding_if_ready(
    (await get_current_account())?.user?.id ?? "",
    vault?.recovery_backup_generation ?? 0,
  );
}

export async function record_recovery_backup_generation(
  binding: RecoveryBackupBinding | null,
  vault: EncryptedVault | null,
  passphrase?: string,
): Promise<void> {
  if (!binding) return;

  raise_recovery_backup_floor(binding.user_id, binding.generation);

  const base = vault ?? get_vault_from_memory();

  if (!base) return;

  try {
    await write_vault_merged({
      next: { ...base, recovery_backup_generation: binding.generation },
      base,
      passphrase,
      user_id: binding.user_id,
    });
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:generation", caught);
  }
}

export async function stored_user_id_for_email(
  email: string,
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();

  if (!wanted) return null;

  try {
    const { get_all_accounts } = await import("@/services/account_manager");
    const match = (await get_all_accounts()).find(
      (account) => account.user?.email?.trim().toLowerCase() === wanted,
    );

    return match?.user?.id ?? null;
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:accounts", caught);

    return null;
  }
}

async function current_set_share_options(): Promise<RecoveryShareOptions> {
  try {
    const status = (await get_codes_status({ skip_cache: true })).data;
    const salts = status?.verifier_salts ?? [];
    const first = salts[0];

    if (typeof first === "string" && salts.every((salt) => salt === first)) {
      return {
        verifier_salt: first,
        include_code_hash: status?.code_hash_optional !== true,
      };
    }
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:status", caught);
  }

  return { include_code_hash: true };
}

export async function refresh_recovery_backup(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  const codes = recovery_codes_of(vault);

  if (codes.length === 0) return false;

  const recovery_key = generate_recovery_key();

  try {
    const binding = await current_recovery_backup_binding(vault);
    const backup = await encrypt_vault_backup(
      await build_backup_vault(vault, passphrase),
      recovery_key,
      binding,
    );
    const shares = await generate_all_recovery_shares(
      codes,
      recovery_key,
      await current_set_share_options(),
    );
    const response = await save_recovery_backup(
      backup.encrypted_data,
      backup.nonce,
      backup.salt,
      shares,
    );

    if (response.error || response.data?.success !== true) return false;

    await record_recovery_backup_generation(binding, vault, passphrase);

    return true;
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh", caught);

    return false;
  } finally {
    clear_recovery_key(recovery_key);
  }
}

export async function reseal_unbound_recovery_backup(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if ((vault.recovery_backup_generation ?? 0) > 0) return false;

  if (recovery_codes_of(vault).length === 0) return false;

  const readiness = await get_sync_format_readiness();

  if (!readiness.recovery_backup_bound) return false;

  return refresh_recovery_backup(vault, passphrase);
}
