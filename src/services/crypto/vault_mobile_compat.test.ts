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
import { describe, it, expect } from "vitest";

import {
  normalize_vault_fields,
  type EncryptedVault,
} from "@/services/crypto/key_manager";

const ARMORED_KEY =
  "-----BEGIN PGP PRIVATE KEY BLOCK-----\nxVgEZ...\n-----END PGP PRIVATE KEY BLOCK-----";

describe("normalize_vault_fields (mobile vault compat)", () => {
  it("maps pgp_private_key to identity_key when identity_key is absent", () => {
    const vault = {
      pgp_private_key: ARMORED_KEY,
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBe(ARMORED_KEY);
  });

  it("keeps an existing identity_key untouched", () => {
    const vault = {
      identity_key: "existing",
      pgp_private_key: ARMORED_KEY,
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBe("existing");
  });

  it("ignores pgp_private_key values that are not armored PGP keys", () => {
    const vault = {
      pgp_private_key: "not-a-key",
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBeUndefined();
  });

  it("keeps a mobile identity_private_key as a legacy identity key", () => {
    const vault = {
      pgp_private_key: ARMORED_KEY,
      identity_private_key: "cmF3LWVkMjU1MTkta2V5",
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBe(ARMORED_KEY);
    expect(normalized.legacy_identity_keys).toEqual(["cmF3LWVkMjU1MTkta2V5"]);
  });

  it("appends the mobile key to existing legacy identity keys once", () => {
    const vault = {
      identity_key: ARMORED_KEY,
      identity_private_key: "cmF3LWVkMjU1MTkta2V5",
      legacy_identity_keys: ["older"],
    } as unknown as EncryptedVault;

    const once = normalize_vault_fields(vault);
    const twice = normalize_vault_fields(once);

    expect(twice.legacy_identity_keys).toEqual([
      "older",
      "cmF3LWVkMjU1MTkta2V5",
    ]);
  });

  it("adds nothing when the mobile key already is the identity key", () => {
    const vault = {
      identity_key: "same",
      identity_private_key: "same",
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.legacy_identity_keys).toBeUndefined();
  });
});

describe("folder names written by a mobile app with its own identity key", () => {
  it("decrypt on web once the vault is loaded into memory", async () => {
    const { store_vault_in_memory, clear_vault_from_memory } =
      await import("@/services/crypto/memory_key_store");
    const { encrypt_folder_field, decrypt_folder_field } =
      await import("@/hooks/use_folders/crypto");
    const mobile_identity = "cmF3LWVkMjU1MTkta2V5";
    const sealed = await encrypt_folder_field("Receipts", mobile_identity);
    const vault = normalize_vault_fields({
      pgp_private_key: ARMORED_KEY,
      identity_private_key: mobile_identity,
    } as unknown as EncryptedVault);

    await store_vault_in_memory(vault, "passphrase");

    try {
      expect(
        await decrypt_folder_field(
          sealed.encrypted,
          sealed.nonce,
          vault.identity_key,
        ),
      ).toBe("Receipts");
    } finally {
      clear_vault_from_memory();
    }
  });
});
