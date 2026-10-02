//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
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

import { array_to_base64, base64_to_array } from "./base64";
import { carry_vault_through_reset } from "./carry_vault_through_reset";
import { decrypt_vault, encrypt_vault } from "./key_manager";
import { generate_identity_keypair } from "./key_manager_pgp_keygen";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  derive_encryption_key_from_passphrase,
} from "./memory_key_store";
import { generate_ratchet_keys } from "./ratchet_keys";

const OLD_PASSWORD = "Old-Passw0rd-for-carry";
const NEW_PASSWORD = "New-Passw0rd-after-reset";
const LONG_TEST = { timeout: 120000 };

async function identity_for(password: string): Promise<string> {
  const keypair = await generate_identity_keypair(
    "carry",
    "carry@example.test",
    password,
  );

  return keypair.secret_key;
}

async function ratchet_fields(): Promise<Partial<EncryptedVault>> {
  const generated = await generate_ratchet_keys();

  if (!generated) throw new Error("ratchet key generation failed");

  return {
    ratchet_identity_key: generated.identity_jwk,
    ratchet_identity_public: generated.identity_public,
    ratchet_signed_prekey: generated.signed_prekey_jwk,
    ratchet_signed_prekey_public: generated.signed_prekey_public,
  };
}

async function fresh_vault_for(password: string): Promise<EncryptedVault> {
  return {
    identity_key: await identity_for(password),
    previous_keys: [],
    signed_prekey: "new-spk-public",
    signed_prekey_private: "new-spk-private",
    recovery_codes: ["NEWCODE-1"],
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: "2026-10-02T00:00:00.000Z",
  };
}

async function opens_with(
  armored: string,
  passphrase: string,
): Promise<boolean> {
  const key = await openpgp.readPrivateKey({ armoredKey: armored });

  try {
    await openpgp.decryptKey({ privateKey: key, passphrase });

    return true;
  } catch {
    return false;
  }
}

function keks_of(vault: EncryptedVault): string[] {
  return (vault.legacy_keks ?? []).map((entry) => entry.k);
}

describe("carry_vault_through_reset", () => {
  it(
    "keeps the master key and relocks the identity key under the new password",
    LONG_TEST,
    async () => {
      const old_identity = await identity_for(OLD_PASSWORD);
      const old_kek = array_to_base64(
        crypto.getRandomValues(new Uint8Array(32)),
      );
      const old_legacy = array_to_base64(
        crypto.getRandomValues(new Uint8Array(32)),
      );
      const old_vault: EncryptedVault = {
        identity_key: old_identity,
        previous_keys: [],
        signed_prekey: "old-spk",
        signed_prekey_private: "old-spk-private",
        recovery_codes: ["OLDCODE-1"],
        data_kek: old_kek,
        legacy_keks: [{ k: old_legacy, added_at: "2026-01-01T00:00:00.000Z" }],
        vault_format: MASTER_KEY_VAULT_FORMAT,
        kdf_version: STORAGE_KDF_VERSION_STRETCHED,
        mk_created_at: "2026-01-01T00:00:00.000Z",
        ...(await ratchet_fields()),
      };
      const fresh = await fresh_vault_for(NEW_PASSWORD);

      const carried = await carry_vault_through_reset(
        old_vault,
        OLD_PASSWORD,
        fresh,
        NEW_PASSWORD,
      );

      expect(carried.data_kek).toBe(old_kek);
      expect(carried.mk_created_at).toBe(old_vault.mk_created_at);
      expect(carried.identity_key).toBe(fresh.identity_key);
      expect(carried.recovery_codes).toEqual(fresh.recovery_codes);
      expect(carried.previous_keys).toHaveLength(1);
      expect(await opens_with(carried.previous_keys![0], NEW_PASSWORD)).toBe(
        true,
      );
      expect(await opens_with(carried.previous_keys![0], OLD_PASSWORD)).toBe(
        false,
      );
      expect(carried.legacy_identity_keys).toContain(old_identity);

      const keks = keks_of(carried);
      const stretched = array_to_base64(
        await derive_encryption_key_from_passphrase(
          new TextEncoder().encode(OLD_PASSWORD),
          STORAGE_KDF_VERSION_STRETCHED,
        ),
      );
      const legacy = array_to_base64(
        await derive_encryption_key_from_passphrase(
          new TextEncoder().encode(OLD_PASSWORD),
          STORAGE_KDF_VERSION_LEGACY,
        ),
      );

      expect(keks).toContain(old_legacy);
      expect(keks).toContain(stretched);
      expect(keks).toContain(legacy);
      expect(keks).not.toContain(old_kek);
      expect(new Set(keks).size).toBe(keks.length);
      expect(carried.ratchet_previous_keys).toHaveLength(1);
      expect(carried.ratchet_previous_keys![0].ratchet_identity_public).toBe(
        old_vault.ratchet_identity_public,
      );

      const sealed = await encrypt_vault(carried, NEW_PASSWORD);
      const reopened = await decrypt_vault(
        sealed.encrypted_vault,
        sealed.vault_nonce,
        NEW_PASSWORD,
      );

      expect(reopened.data_kek).toBe(old_kek);
      expect(base64_to_array(reopened.data_kek!)).toHaveLength(32);
    },
  );

  it(
    "absorbs a format 1 vault's password keys without taking its data key",
    LONG_TEST,
    async () => {
      const old_vault: EncryptedVault = {
        identity_key: await identity_for(OLD_PASSWORD),
        signed_prekey: "old-spk",
        signed_prekey_private: "old-spk-private",
        recovery_codes: ["OLDCODE-1"],
        vault_format: 1,
      };
      const fresh = await fresh_vault_for(NEW_PASSWORD);

      const carried = await carry_vault_through_reset(
        old_vault,
        OLD_PASSWORD,
        fresh,
        NEW_PASSWORD,
      );

      expect(carried.data_kek).toBe(fresh.data_kek);
      expect(carried.mk_created_at).toBe(fresh.mk_created_at);
      expect(carried.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
      expect(keks_of(carried).length).toBeGreaterThan(0);
      expect(carried.previous_keys).toHaveLength(1);
    },
  );

  it(
    "leaves keys locked under an unknown password out of previous_keys",
    LONG_TEST,
    async () => {
      const stranger = await identity_for("some-other-password");
      const old_vault: EncryptedVault = {
        identity_key: await identity_for(OLD_PASSWORD),
        previous_keys: [stranger],
        signed_prekey: "old-spk",
        signed_prekey_private: "old-spk-private",
        recovery_codes: [],
        data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
        vault_format: MASTER_KEY_VAULT_FORMAT,
      };
      const fresh = await fresh_vault_for(NEW_PASSWORD);

      const carried = await carry_vault_through_reset(
        old_vault,
        OLD_PASSWORD,
        fresh,
        NEW_PASSWORD,
      );

      expect(carried.previous_keys).toHaveLength(1);
      expect(carried.legacy_identity_keys).toContain(stranger);
    },
  );
});
