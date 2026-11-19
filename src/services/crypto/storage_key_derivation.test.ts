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

import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./base64";
import {
  decrypt_envelope_v2_with_vault,
  encrypt_envelope_v2,
  envelope_v2_write_key,
} from "./envelope_v2";
import { get_legacy_crypto_keys } from "./legacy_keks";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import {
  get_storage_write_crypto_key,
  install_random_storage_key,
} from "./storage_write_key";
import { upgrade_vault_to_master_key } from "./vault_master_key_upgrade";

const PASSWORD = "Derivation-Passw0rd-31";
const LONG_TEST = { timeout: 120000 };

function make_vault(overrides: Partial<EncryptedVault> = {}): EncryptedVault {
  return {
    identity_key: "test-identity-key",
    signed_prekey: "test-signed-prekey",
    signed_prekey_private: "test-signed-prekey-private",
    recovery_codes: [],
    ...overrides,
  };
}

async function password_key(version: number): Promise<Uint8Array> {
  return derive_encryption_key_from_passphrase(
    new TextEncoder().encode(PASSWORD),
    version,
  );
}

function kek_id(raw: Uint8Array): string {
  const domain = new TextEncoder().encode("aster-retired-storage-kek-v1");
  const input = new Uint8Array(domain.length + 1 + raw.length);

  input.set(domain, 0);
  input.set(raw, domain.length + 1);

  return array_to_base64(sha256(input));
}

function expect_envelope_writes_refused(): void {
  expect(envelope_v2_write_key(get_vault_from_memory())).toBeNull();
}

afterEach(() => {
  clear_vault_from_memory();
});

describe("password derived storage keys never seal mail envelopes", () => {
  it("refuses writes under the v1 key", LONG_TEST, async () => {
    await store_vault_in_memory(make_vault(), PASSWORD);

    expect_envelope_writes_refused();
  });

  it("refuses writes under the shared-salt v2 key", LONG_TEST, async () => {
    await store_vault_in_memory(
      make_vault({ kdf_version: STORAGE_KDF_VERSION_STRETCHED }),
      PASSWORD,
    );

    expect_envelope_writes_refused();
  });

  it("refuses writes under a promoted password key", LONG_TEST, async () => {
    await store_vault_in_memory(
      make_vault({
        data_kek: array_to_base64(
          await password_key(STORAGE_KDF_VERSION_STRETCHED),
        ),
        kdf_version: STORAGE_KDF_VERSION_STRETCHED,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      }),
      PASSWORD,
    );

    expect_envelope_writes_refused();
  });
});

describe("data written by older clients still opens", () => {
  it(
    "opens v1 and v2 sealed envelopes before and after the move",
    LONG_TEST,
    async () => {
      const v1 = await password_key(STORAGE_KDF_VERSION_LEGACY);
      const v2 = await password_key(STORAGE_KDF_VERSION_STRETCHED);
      const old_v1 = await encrypt_envelope_v2({ subject: "from v1" }, v1);
      const old_v2 = await encrypt_envelope_v2({ subject: "from v2" }, v2);
      const vault = make_vault({ kdf_version: STORAGE_KDF_VERSION_STRETCHED });

      await store_vault_in_memory(vault, PASSWORD);
      expect(
        await decrypt_envelope_v2_with_vault(
          old_v2.encrypted,
          get_vault_from_memory(),
        ),
      ).toEqual({ subject: "from v2" });

      const moved = { ...vault };

      await upgrade_vault_to_master_key(moved, PASSWORD);
      await store_vault_in_memory(moved, PASSWORD);

      const write_key = envelope_v2_write_key(get_vault_from_memory());

      expect(write_key).not.toBeNull();
      expect(Array.from(write_key!)).not.toEqual(Array.from(v1));
      expect(Array.from(write_key!)).not.toEqual(Array.from(v2));
      await expect(get_storage_write_crypto_key()).resolves.not.toBeNull();

      for (const [sealed, subject] of [
        [old_v1, "from v1"],
        [old_v2, "from v2"],
      ] as const) {
        expect(
          await decrypt_envelope_v2_with_vault(
            sealed.encrypted,
            get_vault_from_memory(),
          ),
        ).toEqual({ subject });
      }
    },
  );

  it(
    "opens promoted-key data after a random key replaces it",
    LONG_TEST,
    async () => {
      const v2 = await password_key(STORAGE_KDF_VERSION_STRETCHED);
      const old = await encrypt_envelope_v2({ subject: "promoted" }, v2);
      const vault = make_vault({
        data_kek: array_to_base64(v2),
        kdf_version: STORAGE_KDF_VERSION_STRETCHED,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      });

      install_random_storage_key(vault, [v2.slice()]);
      await store_vault_in_memory(vault, PASSWORD);

      await expect(get_storage_write_crypto_key()).resolves.not.toBeNull();
      expect(
        await decrypt_envelope_v2_with_vault(
          old.encrypted,
          get_vault_from_memory(),
        ),
      ).toEqual({ subject: "promoted" });
    },
  );
});

describe("retired password keys stay out of the read set", () => {
  function master_vault(retired: string[] | undefined): EncryptedVault {
    return {
      ...make_vault({
        data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
        data_kek_random: true,
        kdf_version: STORAGE_KDF_VERSION_STRETCHED,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      }),
      ...(retired ? { retired_storage_kek_ids: retired } : {}),
    } as EncryptedVault;
  }

  it("keeps both password keys before the sweep", LONG_TEST, async () => {
    await store_vault_in_memory(master_vault(undefined), PASSWORD);

    expect(get_legacy_crypto_keys()).toHaveLength(2);
  });

  it("drops both password keys after the sweep", LONG_TEST, async () => {
    const retired = [
      kek_id(await password_key(STORAGE_KDF_VERSION_LEGACY)),
      kek_id(await password_key(STORAGE_KDF_VERSION_STRETCHED)),
    ];

    await store_vault_in_memory(master_vault(retired), PASSWORD);

    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });

  it(
    "queues both password keys for retirement on upgrade",
    LONG_TEST,
    async () => {
      const vault = make_vault({ kdf_version: STORAGE_KDF_VERSION_STRETCHED });

      await upgrade_vault_to_master_key(vault, PASSWORD);

      const pending = (vault as { pending_retire_kek_ids?: string[] })
        .pending_retire_kek_ids;

      expect(pending).toEqual(
        expect.arrayContaining([
          kek_id(await password_key(STORAGE_KDF_VERSION_LEGACY)),
          kek_id(await password_key(STORAGE_KDF_VERSION_STRETCHED)),
        ]),
      );
    },
  );
});
