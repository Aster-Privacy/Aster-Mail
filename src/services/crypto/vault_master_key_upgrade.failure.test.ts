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

import { describe, expect, it, vi } from "vitest";

import { upgrade_vault_to_master_key } from "./vault_master_key_upgrade";

vi.mock("./storage_write_key", async (load_original) => ({
  ...(await load_original<typeof import("./storage_write_key")>()),
  collect_prior_storage_keys: vi.fn(async () => {
    throw new Error("prior keys unavailable");
  }),
}));

describe("upgrade_vault_to_master_key", () => {
  it("throws when the prior keys cannot be collected", async () => {
    const vault: EncryptedVault = {
      identity_key: "test-identity-key",
      signed_prekey: "test-signed-prekey",
      signed_prekey_private: "test-signed-prekey-private",
      recovery_codes: [],
    };

    await expect(
      upgrade_vault_to_master_key(vault, "Upgrade-Passw0rd-7"),
    ).rejects.toThrow("prior keys unavailable");
    expect(vault.data_kek).toBeUndefined();
  });
});
