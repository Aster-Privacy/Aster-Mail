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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { FormatMigrator, MigratorContext } from "../migrator";

import { NOTHING_TO_DO } from "../migrator";

export const STORAGE_PASSWORD_V1_VERSION = 1;

const STRETCHED_KDF_VERSION = 2;

export interface StoragePasswordV1Deps {
  v1_kek_id: () => string | null;
}

export function storage_rotation_settled(vault: EncryptedVault): boolean {
  return (
    (vault.kdf_version ?? 1) >= STRETCHED_KDF_VERSION &&
    vault.data_kek_random === true &&
    !!vault.data_kek &&
    (!vault.storage_rekey || vault.storage_rekey.state === "done") &&
    (vault.pending_retire_kek_ids ?? []).length === 0
  );
}

function v1_retired(
  vault: EncryptedVault,
  deps: StoragePasswordV1Deps,
): boolean | null {
  if (!storage_rotation_settled(vault)) return false;

  const id = deps.v1_kek_id();

  if (!id) return null;

  return (vault.retired_storage_kek_ids ?? []).includes(id);
}

export function create_storage_password_v1_migrator(
  deps: StoragePasswordV1Deps,
): FormatMigrator {
  return {
    id: "storage_password_v1",
    version: STORAGE_PASSWORD_V1_VERSION,
    detect: async () => false,
    rewrap_batch: async () => NOTHING_TO_DO,
    async count(ctx: MigratorContext) {
      const retired = v1_retired(ctx.vault, deps);

      return retired === null ? null : retired ? 0 : 1;
    },
    async verify(ctx: MigratorContext) {
      return v1_retired(ctx.vault, deps) === true;
    },
  };
}
