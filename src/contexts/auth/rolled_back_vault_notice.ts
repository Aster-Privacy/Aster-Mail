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

import {
  accept_recovered_vault,
  rebaseline_recovery_seen,
  refuse_rolled_back_vault,
  VaultRolledBackError,
} from "@/services/crypto/vault_generation";

export function refuse_rolled_back_vault_with_notice(
  user_id: string | null | undefined,
  vault: EncryptedVault,
  notify: () => void,
  server_recovered_write_count?: unknown,
): void {
  rebaseline_recovery_seen(user_id, server_recovered_write_count);
  if (accept_recovered_vault(user_id, vault, server_recovered_write_count)) {
    return;
  }

  try {
    refuse_rolled_back_vault(user_id, vault);
  } catch (caught) {
    if (caught instanceof VaultRolledBackError) notify();

    throw caught;
  }
}
