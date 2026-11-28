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
import type { FormatMigrator } from "../migrator";

export const VAULT_UNBOUND_VERSION = 1;

export type VaultBlobState = "bound" | "unbound";

export interface VaultUnboundDeps {
  writes_bound: () => boolean;
  last_open_bound: () => boolean | null;
  server_state: () => Promise<VaultBlobState | null>;
  rewrite: (user_id: string) => Promise<boolean>;
}

export function create_vault_unbound_migrator(
  deps: VaultUnboundDeps,
): FormatMigrator {
  return {
    id: "vault_unbound",
    version: VAULT_UNBOUND_VERSION,
    detect: async () => deps.writes_bound() && deps.last_open_bound() === false,
    async rewrap_batch(ctx) {
      if (deps.last_open_bound() !== false) {
        return { examined: 1, migrated: 0, failed: 0, done: true };
      }

      const written = await deps.rewrite(ctx.user_id);

      return {
        examined: 1,
        migrated: written ? 1 : 0,
        failed: written ? 0 : 1,
        done: true,
      };
    },
    async count() {
      const bound = deps.last_open_bound();

      if (bound === null) return null;

      return bound ? 0 : 1;
    },
    async verify() {
      return (await deps.server_state()) === "bound";
    },
  };
}
