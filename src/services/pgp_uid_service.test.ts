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

import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";

import {
  add_address_to_identity_key,
  add_addresses_to_identity_key,
} from "./pgp_uid_service";

const PASSPHRASE = "correct horse battery staple";

async function make_vault(legacy?: string[]): Promise<EncryptedVault> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: "Old", email: "old@example.test" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return {
    identity_key: privateKey,
    legacy_identity_keys: legacy,
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

describe("add_address_to_identity_key", () => {
  it("keeps the previous armor so data sealed to it stays readable", async () => {
    const vault = await make_vault(["older-armor"]);
    const next = await add_address_to_identity_key(
      vault,
      PASSPHRASE,
      "new@example.test",
      "New",
    );

    expect(next).not.toBeNull();
    expect(next!.identity_key).not.toBe(vault.identity_key);
    expect(next!.legacy_identity_keys).toEqual([
      vault.identity_key,
      "older-armor",
    ]);

    const before = await openpgp.readKey({ armoredKey: vault.identity_key });
    const after = await openpgp.readKey({ armoredKey: next!.identity_key });

    expect(after.getFingerprint()).toBe(before.getFingerprint());
    expect(after.users.map((user) => user.userID?.email)).toEqual([
      "new@example.test",
      "old@example.test",
    ]);
  });

  it("does not duplicate an armor that is already retained", async () => {
    const vault = await make_vault();

    vault.legacy_identity_keys = [vault.identity_key];

    const next = await add_address_to_identity_key(
      vault,
      PASSPHRASE,
      "new@example.test",
      "New",
    );

    expect(next!.legacy_identity_keys).toEqual([vault.identity_key]);
  });

  it("returns null when the address is already on the key", async () => {
    const vault = await make_vault();

    expect(
      await add_address_to_identity_key(
        vault,
        PASSPHRASE,
        "old@example.test",
        "Old",
      ),
    ).toBeNull();
  });
});

describe("add_addresses_to_identity_key", () => {
  it("appends every missing address after the existing user IDs", async () => {
    const vault = await make_vault();
    const next = await add_addresses_to_identity_key(
      vault,
      PASSPHRASE,
      [
        { email: "old@example.test" },
        { email: "alias@example.test", name: "Alias" },
        { email: "me@custom.test" },
        { email: "ALIAS@example.test" },
      ],
      "last",
    );

    const before = await openpgp.readKey({ armoredKey: vault.identity_key });
    const after = await openpgp.readKey({ armoredKey: next!.identity_key });

    expect(after.getFingerprint()).toBe(before.getFingerprint());
    expect(after.users.map((user) => user.userID?.email)).toEqual([
      "old@example.test",
      "alias@example.test",
      "me@custom.test",
    ]);
    expect(next!.legacy_identity_keys).toEqual([vault.identity_key]);
  });

  it("returns null when every address is already on the key", async () => {
    const vault = await make_vault();

    expect(
      await add_addresses_to_identity_key(
        vault,
        PASSPHRASE,
        [{ email: " OLD@example.test " }],
        "last",
      ),
    ).toBeNull();
  });

  it("rejects an address that is not a valid email", async () => {
    const vault = await make_vault();

    await expect(
      add_addresses_to_identity_key(
        vault,
        PASSPHRASE,
        [{ email: "not an address" }],
        "last",
      ),
    ).rejects.toThrow();
  });
});
