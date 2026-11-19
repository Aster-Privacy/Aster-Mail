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

import { afterEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: vi.fn(),
  fetch_inactive_key_set: vi.fn(),
  unlock_inactive_key_sets_with_code: vi.fn(),
  consume_inactive_key_set: vi.fn(),
  save_recovery_backup: vi.fn(),
}));

const ACCOUNT_ADDRESS = "recovered@astermail.org";

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => null,
  get_all_accounts: async () => [
    {
      id: "user-recovered",
      user: { id: "user-recovered", email: ACCOUNT_ADDRESS },
    },
  ],
}));

import { reseal_recovery_vault } from "./recovery_vault_reseal";
import {
  is_rolled_back_vault,
  pin_vault_generation,
  vault_generation,
} from "./vault_generation";

const USER_ID = "user-recovered";
const OLD_PASSPHRASE = "Old-Passw0rd-before-reset";
const NEW_PASSPHRASE = "New-Passw0rd-after-reset";
const PINNED = 10;
const LONG_TEST = 120000;

async function identity(): Promise<{ locked: string; unlocked: string }> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "identity", email: "identity@example.test" }],
    format: "armored",
  });
  const locked = await openpgp.encryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
    passphrase: OLD_PASSPHRASE,
  });

  return { locked: locked.armor(), unlocked: privateKey };
}

function vault_at(generation: number, identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    previous_keys: [],
    vault_generation: generation,
    vault_generation_ready: true,
  } as EncryptedVault;
}

async function recover_from_backup(
  server_write_count?: number | null,
  account_address: string | null = null,
) {
  const key = await identity();

  pin_vault_generation(USER_ID, vault_at(PINNED, key.locked));

  const backup = vault_at(PINNED - 3, key.locked);
  const { vault } = await reseal_recovery_vault(
    backup,
    new Map([[key.locked, key.unlocked]]),
    NEW_PASSPHRASE,
    null,
    server_write_count,
    account_address,
  );

  return vault;
}

describe("vault recovered from an older backup", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it(
    "is accepted by a device pinned to a newer generation",
    async () => {
      const vault = await recover_from_backup(PINNED);

      expect(vault_generation(vault)).toBe(PINNED + 1);
      expect(is_rolled_back_vault(USER_ID, vault)).toBe(false);
    },
    LONG_TEST,
  );

  it(
    "still moves past the backup when the server reports no write count",
    async () => {
      const vault = await recover_from_backup(null);

      expect(vault_generation(vault)).toBe(PINNED - 2);
    },
    LONG_TEST,
  );

  it(
    "ignores a write count outside the trusted range",
    async () => {
      const vault = await recover_from_backup(2 ** 50);

      expect(vault_generation(vault)).toBe(PINNED - 2);
    },
    LONG_TEST,
  );
  it(
    "moves past this device's pin when the server count lags behind it",
    async () => {
      const vault = await recover_from_backup(PINNED - 5, ACCOUNT_ADDRESS);

      expect(vault_generation(vault)).toBe(PINNED + 1);
      expect(is_rolled_back_vault(USER_ID, vault)).toBe(false);
    },
    LONG_TEST,
  );

  it(
    "moves past this device's pin when the server reports no write count",
    async () => {
      const vault = await recover_from_backup(null, ACCOUNT_ADDRESS);

      expect(vault_generation(vault)).toBe(PINNED + 1);
      expect(is_rolled_back_vault(USER_ID, vault)).toBe(false);
    },
    LONG_TEST,
  );

  it(
    "accepts a second recovery after the pin moved past the server count",
    async () => {
      const first = await recover_from_backup(PINNED + 2, ACCOUNT_ADDRESS);

      pin_vault_generation(USER_ID, first);

      const { vault: second } = await reseal_recovery_vault(
        vault_at(PINNED, first.identity_key),
        new Map(),
        NEW_PASSPHRASE,
        null,
        PINNED,
        ACCOUNT_ADDRESS,
      );

      expect(vault_generation(second)).toBe(PINNED + 4);
      expect(is_rolled_back_vault(USER_ID, second)).toBe(false);
    },
    LONG_TEST,
  );

  it(
    "refuses an older vault served back after the pin with the ready flag on",
    async () => {
      const key = await identity();

      pin_vault_generation(USER_ID, vault_at(PINNED, key.locked));

      expect(
        is_rolled_back_vault(USER_ID, vault_at(PINNED - 3, key.locked)),
      ).toBe(true);
    },
    LONG_TEST,
  );
});
