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
import type { MigratorContext } from "../migrator";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => null,
  get_vault_from_memory: () => null,
}));

import {
  mail_public_kek_migrator,
  recovery_escrow_legacy_migrator,
} from "./mirrors";
import { create_storage_password_v1_migrator } from "./storage_password_v1";

import { retired_storage_kek_id } from "@/services/crypto/retired_storage_keks";

function ctx(vault: Partial<EncryptedVault>): MigratorContext {
  return {
    user_id: "u1",
    vault: vault as EncryptedVault,
    state: {},
    is_active: () => true,
  };
}

const V1_RAW = new Uint8Array(32).fill(9);

const SETTLED: Partial<EncryptedVault> = {
  kdf_version: 2,
  data_kek_random: true,
  data_kek: "a2V5",
};

describe("mirror migrators", () => {
  it("marks mail public keys only after the existing marker", async () => {
    expect(await mail_public_kek_migrator.count(ctx({}))).toBeNull();
    expect(await mail_public_kek_migrator.verify(ctx({}))).toBe(false);

    const retired = ctx({
      mail_legacy_retired: { v: 1, at: "2026-11-24T00:00:00.000Z" },
    });

    expect(await mail_public_kek_migrator.count(retired)).toBe(0);
    expect(await mail_public_kek_migrator.verify(retired)).toBe(true);
  });

  it("marks legacy recovery escrow only at format 2", async () => {
    expect(
      await recovery_escrow_legacy_migrator.count(ctx({ escrow_format: 1 })),
    ).toBeNull();
    expect(
      await recovery_escrow_legacy_migrator.verify(ctx({ escrow_format: 2 })),
    ).toBe(true);
  });
});

describe("storage_password_v1 migrator", () => {
  const deps = {
    v1_kek_id: () => retired_storage_kek_id(V1_RAW),
  };
  const migrator = create_storage_password_v1_migrator(deps);

  it("waits while a storage rotation is still running", async () => {
    const vault = {
      ...SETTLED,
      pending_retire_kek_ids: ["x"],
      retired_storage_kek_ids: [retired_storage_kek_id(V1_RAW)],
    };

    expect(await migrator.count(ctx(vault))).toBe(1);
    expect(await migrator.verify(ctx(vault))).toBe(false);
  });

  it("marks once the v1 key id is retired", async () => {
    const vault = {
      ...SETTLED,
      retired_storage_kek_ids: [retired_storage_kek_id(V1_RAW)],
    };

    expect(await migrator.count(ctx(vault))).toBe(0);
    expect(await migrator.verify(ctx(vault))).toBe(true);
  });

  it("does not mark a vault that still uses the v1 key", async () => {
    expect(await migrator.count(ctx({ kdf_version: 1 }))).toBe(1);
    expect(await migrator.count(ctx(SETTLED))).toBe(1);
  });

  it("cannot count without the password in memory", async () => {
    const locked = create_storage_password_v1_migrator({
      v1_kek_id: () => null,
    });

    expect(await locked.count(ctx(SETTLED))).toBeNull();
  });
});
