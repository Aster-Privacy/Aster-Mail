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
import * as openpgp from "openpgp";

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: vi.fn(),
  fetch_inactive_key_set: vi.fn(),
  unlock_inactive_key_sets_with_code: vi.fn(),
  consume_inactive_key_set: vi.fn(),
  save_recovery_backup: vi.fn(),
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => null,
}));

import {
  RecoveryPreviousPasswordIncorrect,
  recovery_needs_previous_password,
  reseal_recovery_vault,
} from "./recovery_vault_reseal";

const OLD_PASSPHRASE = "Old-Passw0rd-before-reset";
const NEW_PASSPHRASE = "New-Passw0rd-after-reset";
const LONG_TEST = 120000;

interface TestKey {
  unlocked: string;
  locked: string;
  fingerprint: string;
}

async function make_key(name: string): Promise<TestKey> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name, email: `${name}@example.test` }],
    format: "armored",
  });
  const read = await openpgp.readPrivateKey({ armoredKey: privateKey });
  const locked = await openpgp.encryptKey({
    privateKey: read,
    passphrase: OLD_PASSPHRASE,
  });

  return {
    unlocked: privateKey,
    locked: locked.armor(),
    fingerprint: read.getFingerprint(),
  };
}

async function fingerprint_of(armored: string): Promise<string> {
  const key = await openpgp.readPrivateKey({ armoredKey: armored });

  return key.getFingerprint();
}

async function opens_with(
  armored: string,
  passphrase: string,
): Promise<boolean> {
  try {
    await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: armored }),
      passphrase,
    });

    return true;
  } catch {
    return false;
  }
}

async function make_vault(): Promise<{
  vault: EncryptedVault;
  identity: TestKey;
  previous: TestKey;
  prekey: TestKey;
}> {
  const identity = await make_key("identity");
  const previous = await make_key("previous");
  const prekey = await make_key("prekey");

  return {
    identity,
    previous,
    prekey,
    vault: {
      identity_key: identity.locked,
      previous_keys: [previous.locked],
      signed_prekey: "spk-public",
      signed_prekey_private: prekey.locked,
      recovery_codes: ["CODE-1"],
    },
  };
}

describe("reseal_recovery_vault", () => {
  it(
    "asks for the previous password only when the backup lacks the identity",
    async () => {
      const { vault, identity } = await make_vault();

      expect(await recovery_needs_previous_password(vault, new Map())).toBe(
        true,
      );
      expect(
        await recovery_needs_previous_password(
          vault,
          new Map([[identity.locked, identity.unlocked]]),
        ),
      ).toBe(false);
    },
    LONG_TEST,
  );

  it(
    "relocks the same identity from the backup copy under the new password",
    async () => {
      const { vault, identity, previous } = await make_vault();
      const unlocked = new Map([
        [identity.locked, identity.unlocked],
        [previous.locked, previous.unlocked],
      ]);

      const result = await reseal_recovery_vault(
        vault,
        unlocked,
        NEW_PASSPHRASE,
        null,
      );

      expect(result.identity_locked).toBe(false);
      expect(await fingerprint_of(result.vault.identity_key)).toBe(
        identity.fingerprint,
      );
      expect(await opens_with(result.vault.identity_key, NEW_PASSPHRASE)).toBe(
        true,
      );
      expect(result.vault.previous_keys).toHaveLength(1);
      expect(await fingerprint_of(result.vault.previous_keys![0])).toBe(
        previous.fingerprint,
      );
      expect(
        await opens_with(result.vault.previous_keys![0], NEW_PASSPHRASE),
      ).toBe(true);
    },
    LONG_TEST,
  );

  it(
    "reprotects identity, previous keys, and prekey with the previous password",
    async () => {
      const { vault, identity, prekey } = await make_vault();

      const result = await reseal_recovery_vault(
        vault,
        new Map(),
        NEW_PASSPHRASE,
        OLD_PASSPHRASE,
      );

      expect(result.identity_locked).toBe(false);
      expect(await fingerprint_of(result.vault.identity_key)).toBe(
        identity.fingerprint,
      );
      expect(await opens_with(result.vault.identity_key, NEW_PASSPHRASE)).toBe(
        true,
      );
      expect(
        await opens_with(result.vault.previous_keys![0], NEW_PASSPHRASE),
      ).toBe(true);
      expect(
        await opens_with(result.vault.signed_prekey_private!, NEW_PASSPHRASE),
      ).toBe(true);
      expect(await fingerprint_of(result.vault.signed_prekey_private!)).toBe(
        prekey.fingerprint,
      );
      expect(result.vault.signed_prekey).toBe("spk-public");
    },
    LONG_TEST,
  );

  it(
    "rejects a wrong previous password without changing the vault",
    async () => {
      const { vault } = await make_vault();
      const snapshot = JSON.stringify(vault);

      await expect(
        reseal_recovery_vault(
          vault,
          new Map(),
          NEW_PASSPHRASE,
          "Wrong-Passw0rd-here",
        ),
      ).rejects.toBeInstanceOf(RecoveryPreviousPasswordIncorrect);
      expect(JSON.stringify(vault)).toBe(snapshot);
    },
    LONG_TEST,
  );

  it(
    "keeps every key under the old password when the user skips the prompt",
    async () => {
      const { vault, identity, previous, prekey } = await make_vault();

      const result = await reseal_recovery_vault(
        vault,
        new Map(),
        NEW_PASSPHRASE,
        null,
      );

      expect(result.identity_locked).toBe(true);
      expect(result.vault.identity_key).toBe(identity.locked);
      expect(result.vault.previous_keys).toEqual([previous.locked]);
      expect(result.vault.signed_prekey_private).toBe(prekey.locked);
      expect(await opens_with(result.vault.identity_key, OLD_PASSPHRASE)).toBe(
        true,
      );
    },
    LONG_TEST,
  );
});
