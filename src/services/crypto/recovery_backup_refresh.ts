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

import { build_backup_vault } from "./backup_unlocked_keys";
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
    const backup = await encrypt_vault_backup(
      await build_backup_vault(vault, passphrase),
      recovery_key,
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

    return !response.error && response.data?.success === true;
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh", caught);

    return false;
  } finally {
    clear_recovery_key(recovery_key);
  }
}
