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

import { is_valid_retired_marker } from "@/services/crypto/mail_legacy_retirement";

export const MIRROR_VERSION = 1;

type MirrorSource = (vault: EncryptedVault) => boolean;

function create_mirror_migrator(
  id: FormatMigrator["id"],
  source_retired: MirrorSource,
): FormatMigrator {
  const remaining = (ctx: MigratorContext) =>
    source_retired(ctx.vault) ? 0 : null;

  return {
    id,
    version: MIRROR_VERSION,
    detect: async () => false,
    rewrap_batch: async () => NOTHING_TO_DO,
    count: async (ctx) => remaining(ctx),
    verify: async (ctx) => source_retired(ctx.vault),
  };
}

export const mail_public_kek_migrator = create_mirror_migrator(
  "mail_public_kek",
  (vault) => is_valid_retired_marker(vault.mail_legacy_retired),
);

export const RECOVERY_ESCROW_BOUND_FORMAT = 2;

export const recovery_escrow_legacy_migrator = create_mirror_migrator(
  "recovery_escrow_legacy",
  (vault) => vault.escrow_format === RECOVERY_ESCROW_BOUND_FORMAT,
);
