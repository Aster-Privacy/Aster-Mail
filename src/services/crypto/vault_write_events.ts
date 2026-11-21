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

import { ignore_error } from "@/lib/ignore_error";

export interface VaultWrittenEvent {
  user_id: string;
  previous: EncryptedVault | null;
  vault: EncryptedVault;
}

type VaultWrittenListener = (event: VaultWrittenEvent) => void;

const vault_written_listeners = new Set<VaultWrittenListener>();

export function on_vault_written(listener: VaultWrittenListener): () => void {
  vault_written_listeners.add(listener);

  return () => {
    vault_written_listeners.delete(listener);
  };
}

export function notify_vault_written(event: VaultWrittenEvent): void {
  for (const listener of vault_written_listeners) {
    try {
      listener(event);
    } catch (caught) {
      ignore_error("services/crypto/vault_write_events:listener", caught);
    }
  }
}
