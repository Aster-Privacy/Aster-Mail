// @vitest-environment happy-dom
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
import * as openpgp from "openpgp";
import { describe, it, expect, beforeEach } from "vitest";

import { encrypt_vault } from "@/services/crypto/key_manager";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import { store_encrypted_vault } from "@/contexts/auth/session_passphrase";
import { verify_vault_password } from "@/services/key_rotation_service";

const USER_ID = "user-A";
const REAL_PASSWORD = "real-password-of-account-A";

function base_vault(identity_key = "identity-A"): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: ["code-one", "code-two"],
  };
}

describe("verify_vault_password", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts the password that opens the stored encrypted vault", async () => {
    const stored = await encrypt_vault(base_vault(), REAL_PASSWORD);

    store_encrypted_vault(USER_ID, stored.encrypted_vault, stored.vault_nonce);

    await expect(
      verify_vault_password(USER_ID, base_vault(), REAL_PASSWORD),
    ).resolves.toBe(true);
  });

  it("rejects a wrong password instead of re-encrypting the vault with it", async () => {
    const stored = await encrypt_vault(base_vault(), REAL_PASSWORD);

    store_encrypted_vault(USER_ID, stored.encrypted_vault, stored.vault_nonce);

    await expect(
      verify_vault_password(USER_ID, base_vault(), "typo-password"),
    ).resolves.toBe(false);
  });

  it("falls back to the identity key passphrase when no vault copy is stored", async () => {
    const { privateKey } = await openpgp.generateKey({
      type: "ecc",
      userIDs: [{ name: "User A", email: "a@example.org" }],
      passphrase: REAL_PASSWORD,
      format: "armored",
    });

    const vault = base_vault(privateKey);

    await expect(
      verify_vault_password(USER_ID, vault, REAL_PASSWORD),
    ).resolves.toBe(true);
    await expect(
      verify_vault_password(USER_ID, vault, "typo-password"),
    ).resolves.toBe(false);
  });
});
