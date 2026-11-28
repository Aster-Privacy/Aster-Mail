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
import type { MigratorContext } from "../migrator";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { describe, expect, it, vi } from "vitest";

import {
  create_vault_unbound_migrator,
  type VaultBlobState,
  type VaultUnboundDeps,
} from "./vault_unbound";

function context(): MigratorContext {
  return {
    user_id: "user-1",
    vault: {} as EncryptedVault,
    state: {},
    is_active: () => true,
  };
}

function deps(overrides: Partial<VaultUnboundDeps> = {}): VaultUnboundDeps {
  return {
    writes_bound: () => true,
    last_open_bound: () => false,
    server_state: async (): Promise<VaultBlobState | null> => "bound",
    rewrite: vi.fn(async () => true),
    ...overrides,
  };
}

describe("vault_unbound migrator", () => {
  it("finds nothing to do while vault writes stay unbound", async () => {
    const migrator = create_vault_unbound_migrator(
      deps({ writes_bound: () => false }),
    );

    expect(await migrator.detect(context())).toBe(false);
  });

  it("finds nothing to do when the vault already opened bound", async () => {
    const migrator = create_vault_unbound_migrator(
      deps({ last_open_bound: () => true }),
    );

    expect(await migrator.detect(context())).toBe(false);
    expect(await migrator.count(context())).toBe(0);
  });

  it("rewrites an unbound vault once bound writes are on", async () => {
    const rewrite = vi.fn(async () => true);
    const migrator = create_vault_unbound_migrator(deps({ rewrite }));

    expect(await migrator.detect(context())).toBe(true);
    expect(await migrator.count(context())).toBe(1);
    expect(await migrator.rewrap_batch(context(), 1)).toEqual({
      examined: 1,
      migrated: 1,
      failed: 0,
      done: true,
    });
    expect(rewrite).toHaveBeenCalledWith("user-1");
  });

  it("counts a failed rewrite as failed", async () => {
    const migrator = create_vault_unbound_migrator(
      deps({ rewrite: vi.fn(async () => false) }),
    );

    expect((await migrator.rewrap_batch(context(), 1)).failed).toBe(1);
  });

  it("reports an unknown count before the vault was opened", async () => {
    const migrator = create_vault_unbound_migrator(
      deps({ last_open_bound: () => null }),
    );

    expect(await migrator.count(context())).toBeNull();
  });

  it("verifies only a server copy that reads back bound", async () => {
    for (const [state, expected] of [
      ["bound", true],
      ["unbound", false],
      [null, false],
    ] as const) {
      const migrator = create_vault_unbound_migrator(
        deps({ server_state: async () => state }),
      );

      expect(await migrator.verify(context())).toBe(expected);
    }
  });
});
