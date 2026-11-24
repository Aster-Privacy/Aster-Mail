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
import type { ServerVaultRestoreDeps } from "./stale_local_vault_restore";

import { describe, expect, it, vi } from "vitest";

import { restore_from_server_vault } from "./stale_local_vault_restore";

import { VaultRolledBackError } from "@/services/crypto/vault_generation";

const ACCOUNT_ID = "account-stale";
const USER_ID = "user-stale";

function deps(overrides: Partial<ServerVaultRestoreDeps> = {}) {
  return {
    get_passphrase: vi.fn(async () => "passphrase"),
    fetch_vault: vi.fn(async () => ({
      kind: "ok" as const,
      snapshot: {
        encrypted_vault: "server-vault",
        vault_nonce: "server-nonce",
        vault_sha256: "hash",
      },
    })),
    open_vault: vi.fn(
      async () => ({ identity_key: "identity" }) as unknown as EncryptedVault,
    ),
    save_local: vi.fn(),
    ...overrides,
  };
}

describe("restore_from_server_vault", () => {
  it("opens the server copy and replaces the stale local copy", async () => {
    const d = deps();

    await expect(restore_from_server_vault(ACCOUNT_ID, USER_ID, d)).resolves.toBe(true);
    expect(d.open_vault).toHaveBeenCalledWith(
      "server-vault",
      "server-nonce",
      "passphrase",
      USER_ID,
    );
    expect(d.save_local).toHaveBeenCalledWith(
      ACCOUNT_ID,
      "server-vault",
      "server-nonce",
    );
  });

  it("keeps refusing when the server copy is also older", async () => {
    const d = deps({
      open_vault: vi.fn(async () => {
        throw new VaultRolledBackError();
      }),
    });

    await expect(restore_from_server_vault(ACCOUNT_ID, USER_ID, d)).resolves.toBe(false);
    expect(d.save_local).not.toHaveBeenCalled();
  });

  it("does nothing without a saved passphrase", async () => {
    const d = deps({ get_passphrase: vi.fn(async () => null) });

    await expect(restore_from_server_vault(ACCOUNT_ID, USER_ID, d)).resolves.toBe(false);
    expect(d.fetch_vault).not.toHaveBeenCalled();
  });

  it("does nothing when the server copy cannot be fetched", async () => {
    const d = deps({ fetch_vault: vi.fn(async () => ({ kind: "error" as const })) });

    await expect(restore_from_server_vault(ACCOUNT_ID, USER_ID, d)).resolves.toBe(false);
    expect(d.open_vault).not.toHaveBeenCalled();
    expect(d.save_local).not.toHaveBeenCalled();
  });

  it("does nothing when the server copy does not open", async () => {
    const d = deps({ open_vault: vi.fn(async () => null) });

    await expect(restore_from_server_vault(ACCOUNT_ID, USER_ID, d)).resolves.toBe(false);
    expect(d.save_local).not.toHaveBeenCalled();
  });
});
