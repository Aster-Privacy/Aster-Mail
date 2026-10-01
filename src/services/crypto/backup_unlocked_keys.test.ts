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

import { describe, expect, it } from "vitest";
import * as openpgp from "openpgp";

import {
  build_backup_vault,
  read_unlocked_keys,
  relock_with_unlocked_keys,
  strip_backup_fields,
  type BackupVault,
} from "./backup_unlocked_keys";

async function make_key(email: string, passphrase: string): Promise<string> {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });

  return generated.privateKey;
}

function vault_with(
  identity_key: string,
  previous_keys?: string[],
): EncryptedVault {
  return {
    identity_key,
    previous_keys,
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
  };
}

async function fingerprint_of(armored: string): Promise<string> {
  return (
    await openpgp.readPrivateKey({ armoredKey: armored })
  ).getFingerprint();
}

describe("build_backup_vault", () => {
  it("adds an unlocked copy of every key the password opens", async () => {
    const current = await make_key("current@example.com", "old-password");
    const previous = await make_key("previous@example.com", "old-password");

    const backup = await build_backup_vault(
      vault_with(current, [previous]),
      "old-password",
    );

    expect(backup.unlocked_keys).toHaveLength(2);
    expect(backup.unlocked_keys?.map(([locked]) => locked)).toEqual([
      current,
      previous,
    ]);

    for (const [, open] of backup.unlocked_keys ?? []) {
      const key = await openpgp.readPrivateKey({ armoredKey: open });

      expect(key.isDecrypted()).toBe(true);
    }
  });

  it("skips a key the password does not open", async () => {
    const current = await make_key("current@example.com", "old-password");
    const foreign = await make_key("foreign@example.com", "another-password");

    const backup = await build_backup_vault(
      vault_with(current, [foreign]),
      "old-password",
    );

    expect(backup.unlocked_keys?.map(([locked]) => locked)).toEqual([current]);
  });

  it("returns the plain vault when no key opens", async () => {
    const current = await make_key("current@example.com", "old-password");

    const backup = await build_backup_vault(vault_with(current), "wrong");

    expect("unlocked_keys" in backup).toBe(false);
  });

  it("replaces unlocked copies carried over from an earlier backup", async () => {
    const current = await make_key("current@example.com", "old-password");
    const stale: BackupVault = {
      ...vault_with(current),
      unlocked_keys: [["stale-locked", "stale-open"]],
    };

    const backup = await build_backup_vault(stale, "old-password");

    expect(backup.unlocked_keys?.map(([locked]) => locked)).toEqual([current]);
  });
});

describe("strip_backup_fields", () => {
  it("removes the unlocked copies and keeps the vault fields", () => {
    const stripped = strip_backup_fields({
      ...vault_with("identity", ["previous"]),
      unlocked_keys: [["identity", "open"]],
    });

    expect("unlocked_keys" in stripped).toBe(false);
    expect(stripped.identity_key).toBe("identity");
    expect(stripped.previous_keys).toEqual(["previous"]);
  });

  it("returns the same vault when it has no unlocked copies", () => {
    const vault = vault_with("identity");

    expect(strip_backup_fields(vault)).toBe(vault);
  });
});

describe("read_unlocked_keys", () => {
  it("ignores malformed entries", () => {
    const vault = {
      ...vault_with("identity"),
      unlocked_keys: [
        ["locked", "open"],
        ["only-one"],
        ["", "open"],
        [1, 2],
        "text",
        null,
      ],
    } as unknown as BackupVault;

    expect([...read_unlocked_keys(vault)]).toEqual([["locked", "open"]]);
  });

  it("returns nothing when the field is not a list", () => {
    const vault = {
      ...vault_with("identity"),
      unlocked_keys: "text",
    } as unknown as BackupVault;

    expect(read_unlocked_keys(vault).size).toBe(0);
  });

  it("stops at the entry limit", () => {
    const vault: BackupVault = {
      ...vault_with("identity"),
      unlocked_keys: Array.from(
        { length: 40 },
        (_, index): [string, string] => [`locked-${index}`, `open-${index}`],
      ),
    };

    expect(read_unlocked_keys(vault).size).toBe(16);
  });
});

describe("relock_with_unlocked_keys", () => {
  it("locks an old key under the new password without the old password", async () => {
    const current = await make_key("current@example.com", "old-password");
    const backup = await build_backup_vault(
      vault_with(current),
      "old-password",
    );
    const relock = relock_with_unlocked_keys(
      read_unlocked_keys(backup),
      "new-password",
    );

    const relocked = await relock(current);
    const key = await openpgp.readPrivateKey({ armoredKey: relocked });

    expect(key.isDecrypted()).toBe(false);
    expect(key.getFingerprint()).toBe(await fingerprint_of(current));

    const opened = await openpgp.decryptKey({
      privateKey: key,
      passphrase: "new-password",
    });

    expect(opened.isDecrypted()).toBe(true);
    await expect(
      openpgp.decryptKey({ privateKey: key, passphrase: "old-password" }),
    ).rejects.toThrow();
  });

  it("rejects a key the backup has no unlocked copy of", async () => {
    const relock = relock_with_unlocked_keys(new Map(), "new-password");

    await expect(relock("unknown")).rejects.toThrow(
      "no unlocked copy for this key",
    );
  });
});
