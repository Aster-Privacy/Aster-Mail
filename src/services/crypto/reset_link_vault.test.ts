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

import { array_to_base64 } from "./base64";
import { generate_identity_keypair } from "./key_manager_pgp_keygen";
import { MASTER_KEY_VAULT_FORMAT } from "./memory_key_store";
import { keep_vault_keys_through_reset } from "./reset_link_vault";

const OLD_PASSPHRASE = "Old-Passw0rd-for-link-reset";
const NEW_PASSPHRASE = "New-Passw0rd-for-link-reset";
const LONG_TEST = 120000;

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

async function make_old_vault(): Promise<EncryptedVault> {
  const identity = await generate_identity_keypair(
    "link",
    "link@example.test",
    OLD_PASSPHRASE,
  );
  const older = await generate_identity_keypair(
    "older",
    "older@example.test",
    OLD_PASSPHRASE,
  );
  const prekey = await generate_identity_keypair(
    "prekey",
    "prekey@example.test",
    OLD_PASSPHRASE,
  );

  return {
    identity_key: identity.secret_key,
    previous_keys: [older.secret_key],
    signed_prekey: prekey.public_key,
    signed_prekey_private: prekey.secret_key,
    recovery_codes: ["OLDCODE-1"],
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    data_kek_random: true,
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: "2026-10-02T00:00:00.000Z",
  };
}

describe("keep_vault_keys_through_reset", () => {
  it(
    "keeps the same identity, prekey, and previous keys under the new password",
    async () => {
      const old_vault = await make_old_vault();

      const next = await keep_vault_keys_through_reset(
        old_vault,
        OLD_PASSPHRASE,
        NEW_PASSPHRASE,
        ["NEWCODE-1"],
      );

      expect(await fingerprint_of(next.identity_key)).toBe(
        await fingerprint_of(old_vault.identity_key),
      );
      expect(await opens_with(next.identity_key, NEW_PASSPHRASE)).toBe(true);
      expect(next.signed_prekey).toBe(old_vault.signed_prekey);
      expect(await fingerprint_of(next.signed_prekey_private!)).toBe(
        await fingerprint_of(old_vault.signed_prekey_private!),
      );

      const kept = await Promise.all(
        (next.previous_keys ?? []).map(fingerprint_of),
      );

      expect(kept).toContain(await fingerprint_of(old_vault.previous_keys![0]));
      expect(next.recovery_codes).toEqual(["NEWCODE-1"]);
    },
    LONG_TEST,
  );

  it(
    "fails on a wrong current password instead of replacing keys",
    async () => {
      const old_vault = await make_old_vault();

      await expect(
        keep_vault_keys_through_reset(
          old_vault,
          "Wrong-Passw0rd-entirely",
          NEW_PASSPHRASE,
          ["NEWCODE-1"],
        ),
      ).rejects.toThrow();
    },
    LONG_TEST,
  );
});
