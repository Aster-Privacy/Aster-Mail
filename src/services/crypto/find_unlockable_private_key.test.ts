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
import { describe, it, expect, beforeAll } from "vitest";
import * as openpgp from "openpgp";

import { find_unlockable_private_key } from "./key_manager_pgp_keygen";

async function make_key(passphrase: string) {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Test", email: "test@example.com" }],
    passphrase,
    format: "armored",
  });
  const fingerprint = (await openpgp.readPrivateKey({ armoredKey: privateKey }))
    .getFingerprint()
    .toUpperCase();

  return { armored: privateKey, fingerprint };
}

describe("find_unlockable_private_key", () => {
  let current: { armored: string; fingerprint: string };
  let previous: { armored: string; fingerprint: string };

  beforeAll(async () => {
    current = await make_key("current-password");
    previous = await make_key("current-password");
  });

  it("returns the key whose fingerprint matches and that the passphrase unlocks", async () => {
    const found = await find_unlockable_private_key(
      [current.armored, previous.armored],
      previous.fingerprint.toLowerCase(),
      "current-password",
    );

    expect(found).toBe(previous.armored);
  });

  it("returns the armored key still locked, never a decrypted copy", async () => {
    const found = await find_unlockable_private_key(
      [current.armored],
      current.fingerprint,
      "current-password",
    );
    const key = await openpgp.readPrivateKey({ armoredKey: found! });

    expect(key.isDecrypted()).toBe(false);
  });

  it("returns null when the passphrase is wrong", async () => {
    const found = await find_unlockable_private_key(
      [current.armored],
      current.fingerprint,
      "wrong-password",
    );

    expect(found).toBeNull();
  });

  it("returns null when no key matches the fingerprint", async () => {
    const found = await find_unlockable_private_key(
      [current.armored, undefined, "not a key"],
      "0".repeat(40),
      "current-password",
    );

    expect(found).toBeNull();
  });

  it("returns null for an empty fingerprint", async () => {
    const found = await find_unlockable_private_key(
      [current.armored],
      "  ",
      "current-password",
    );

    expect(found).toBeNull();
  });
});
