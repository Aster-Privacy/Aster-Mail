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

import { afterEach, describe, expect, it } from "vitest";

import { array_to_base64, base64_to_array } from "./base64";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  store_vault_in_memory,
} from "./memory_key_store";
import {
  MAX_PRIOR_STORAGE_KEYS,
  StorageWriteKeyUnavailableError,
  collect_storage_lookup_keys,
  get_storage_write_crypto_key,
  get_storage_write_key_bytes,
  install_random_storage_key,
  is_weak_storage_vault,
  read_storage_write_key,
  sign_with_storage_lookup_keys,
  verify_with_storage_lookup_keys,
} from "./storage_write_key";
import { upgrade_vault_to_master_key } from "./vault_master_key_upgrade";

import {
  decrypt_alias_field,
  encrypt_alias_field,
} from "@/services/api/aliases/crypto";
import {
  decrypt_contact_data,
  encrypt_contact_data,
} from "@/services/api/contacts";
import {
  decrypt_address_field,
  encrypt_address_field,
} from "@/services/api/domains";
import {
  decrypt_account_data,
  encrypt_account_data,
} from "@/services/api/external_accounts/crypto";
import { decrypt_note, encrypt_note } from "@/services/api/profile_notes";
import { CONTACT_DATA_VERSION } from "@/types/contacts";

const PASSWORD = "Storage-Key-Passw0rd-19";

function account_fixture(name: string) {
  return {
    email: `${name}@example.test`,
    display_name: name,
    label_name: "label",
    label_color: "#4f46e5",
    created_at: "2026-11-06T00:00:00.000Z",
  };
}

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

function random_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function password_key(version: number): Promise<Uint8Array> {
  return derive_encryption_key_from_passphrase(
    new TextEncoder().encode(PASSWORD),
    version,
  );
}

async function opens_with(
  raw: Uint8Array,
  encrypted: string,
  nonce: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce) },
      key,
      base64_to_array(encrypted),
    );

    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  clear_vault_from_memory();
});

describe("read_storage_write_key", () => {
  it("throws a typed error when the vault has no data_kek", () => {
    expect(() => read_storage_write_key(make_vault())).toThrow(
      StorageWriteKeyUnavailableError,
    );
    expect(() => read_storage_write_key(null)).toThrow(
      StorageWriteKeyUnavailableError,
    );
  });

  it("throws a typed error for a malformed data_kek", () => {
    expect(() =>
      read_storage_write_key(
        make_vault({ data_kek: array_to_base64(new Uint8Array(5)) }),
      ),
    ).toThrow(StorageWriteKeyUnavailableError);
  });

  it("returns null while the session is locked", () => {
    expect(get_storage_write_key_bytes()).toBeNull();
  });
});

describe("is_weak_storage_vault", () => {
  it("treats a vault without data_kek as weak", async () => {
    expect(await is_weak_storage_vault(make_vault(), PASSWORD)).toBe(true);
  });

  it("treats a promoted v1 key as weak", async () => {
    const vault = make_vault({
      data_kek: array_to_base64(await password_key(STORAGE_KDF_VERSION_LEGACY)),
      vault_format: MASTER_KEY_VAULT_FORMAT,
    });

    expect(await is_weak_storage_vault(vault, PASSWORD)).toBe(true);
  });

  it("treats a promoted v2 key as weak", async () => {
    const vault = make_vault({
      data_kek: array_to_base64(
        await password_key(STORAGE_KDF_VERSION_STRETCHED),
      ),
      vault_format: MASTER_KEY_VAULT_FORMAT,
      kdf_version: STORAGE_KDF_VERSION_STRETCHED,
    });

    expect(await is_weak_storage_vault(vault, PASSWORD)).toBe(true);
  });

  it("accepts a random key with or without the flag", async () => {
    const encoded = array_to_base64(random_key());

    expect(
      await is_weak_storage_vault(
        make_vault({ data_kek: encoded, vault_format: 2 }),
        PASSWORD,
      ),
    ).toBe(false);
    expect(
      await is_weak_storage_vault(
        make_vault({ data_kek: encoded, data_kek_random: true }),
        PASSWORD,
      ),
    ).toBe(false);
  });

  it("trusts data_kek_random even if the key matches", async () => {
    const vault = make_vault({
      data_kek: array_to_base64(await password_key(STORAGE_KDF_VERSION_LEGACY)),
      data_kek_random: true,
    });

    expect(await is_weak_storage_vault(vault, PASSWORD)).toBe(false);
  });
});

describe("install_random_storage_key", () => {
  it("installs a random key and keeps prior keys for reads", () => {
    const prior = random_key();
    const prior_encoded = array_to_base64(prior);
    const vault = make_vault();

    install_random_storage_key(vault, [prior]);

    expect(vault.data_kek).not.toBe(prior_encoded);
    expect(base64_to_array(vault.data_kek!)).toHaveLength(32);
    expect(vault.data_kek_random).toBe(true);
    expect(vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
    expect(vault.legacy_keks?.[0]?.k).toBe(prior_encoded);
    expect(vault.storage_rekey?.state).toBe("pending");
    expect(vault.storage_rekey?.prior_keys).toEqual([prior_encoded]);
  });

  it("caps prior keys and keeps the legacy list deduped", () => {
    const priors = Array.from({ length: MAX_PRIOR_STORAGE_KEYS + 3 }, () =>
      random_key(),
    );
    const vault = make_vault();

    install_random_storage_key(vault, [...priors, priors[0]]);

    const keks = (vault.legacy_keks ?? []).map((entry) => entry.k);

    expect(vault.storage_rekey?.prior_keys).toHaveLength(
      MAX_PRIOR_STORAGE_KEYS,
    );
    expect(new Set(keks).size).toBe(keks.length);
    expect(keks).toHaveLength(priors.length);
  });
});

describe("storage lookup tokens", () => {
  it("puts the write token first and adds prior tokens while pending", async () => {
    const prior = random_key();
    const vault = make_vault();

    install_random_storage_key(vault, [prior]);

    expect(collect_storage_lookup_keys(vault)).toHaveLength(2);

    vault.storage_rekey = { state: "done" };

    expect(collect_storage_lookup_keys(vault)).toHaveLength(1);
    expect(collect_storage_lookup_keys(vault, "all")).toHaveLength(2);
  });

  it("verifies a token made under a legacy key", LONG_TEST, async () => {
    const legacy = await password_key(STORAGE_KDF_VERSION_LEGACY);
    const vault = make_vault();

    await upgrade_vault_to_master_key(vault, PASSWORD);
    vault.storage_rekey = { state: "done" };
    await store_vault_in_memory(vault, PASSWORD);

    const data = new TextEncoder().encode("probe");
    const info = "unit-test-hmac-v1";
    const info_bytes = new TextEncoder().encode(info);
    const combined = new Uint8Array(legacy.length + info_bytes.length);

    combined.set(legacy, 0);
    combined.set(info_bytes, legacy.length);

    const legacy_hmac = await crypto.subtle.importKey(
      "raw",
      await crypto.subtle.digest("SHA-256", combined),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const legacy_token = new Uint8Array(
      await crypto.subtle.sign("HMAC", legacy_hmac, data),
    );

    expect(
      await verify_with_storage_lookup_keys(info, legacy_token, data),
    ).toBe(true);

    const tokens = await sign_with_storage_lookup_keys(info, data);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).not.toBe(array_to_base64(legacy_token));
  });
});

describe("server data writers use data_kek", () => {
  it(
    "seals every writer's output under data_kek and never under v1",
    LONG_TEST,
    async () => {
      const data_kek = random_key();
      const v1 = await password_key(STORAGE_KDF_VERSION_LEGACY);

      await store_vault_in_memory(
        make_vault({
          data_kek: array_to_base64(data_kek),
          data_kek_random: true,
          vault_format: MASTER_KEY_VAULT_FORMAT,
        }),
        PASSWORD,
      );

      const write_key = await get_storage_write_crypto_key();

      expect(write_key).not.toBeNull();

      const sealed: Array<{ encrypted: string; nonce: string }> = [
        await encrypt_alias_field("alias"),
        await encrypt_address_field("domain-address"),
      ];
      const contact = await encrypt_contact_data({
        first_name: "Ada",
        last_name: "Lovelace",
        emails: ["ada@example.test"],
      });
      const account = await encrypt_account_data(account_fixture("ext"));
      const note = await encrypt_note("note");

      sealed.push(
        { encrypted: contact.encrypted_data, nonce: contact.data_nonce },
        {
          encrypted: account.encrypted_account_data,
          nonce: account.account_data_nonce,
        },
        { encrypted: note.encrypted_note, nonce: note.note_nonce },
      );

      for (const item of sealed) {
        expect(await opens_with(data_kek, item.encrypted, item.nonce)).toBe(
          true,
        );
        expect(await opens_with(v1, item.encrypted, item.nonce)).toBe(false);
      }
    },
  );
});

describe("old accounts keep reading their data", () => {
  async function seal_fixtures() {
    return {
      alias: await encrypt_alias_field("old-alias"),
      domain: await encrypt_address_field("old-domain"),
      contact: await encrypt_contact_data({
        first_name: "Grace",
        last_name: "Hopper",
        emails: ["grace@example.test"],
      }),
      note: await encrypt_note("old-note"),
      account: await encrypt_account_data(account_fixture("old")),
    };
  }

  async function expect_fixtures_readable(
    fixtures: Awaited<ReturnType<typeof seal_fixtures>>,
  ) {
    expect(
      await decrypt_alias_field(fixtures.alias.encrypted, fixtures.alias.nonce),
    ).toBe("old-alias");
    expect(
      await decrypt_address_field(
        fixtures.domain.encrypted,
        fixtures.domain.nonce,
      ),
    ).toBe("old-domain");

    const contact = await decrypt_contact_data(
      fixtures.contact.encrypted_data,
      fixtures.contact.data_nonce,
      fixtures.contact.integrity_hash,
      CONTACT_DATA_VERSION,
    );

    expect(contact.first_name).toBe("Grace");
    expect(
      await decrypt_note(
        fixtures.note.encrypted_note,
        fixtures.note.note_nonce,
        fixtures.note.integrity_hash,
      ),
    ).toBe("old-note");

    const account = await decrypt_account_data(
      fixtures.account.encrypted_account_data,
      fixtures.account.account_data_nonce,
      fixtures.account.integrity_hash,
    );

    expect(account.email).toBe("old@example.test");
  }

  it(
    "reads legacy vault data before and after the upgrade",
    LONG_TEST,
    async () => {
      const legacy_vault = make_vault();

      await store_vault_in_memory(legacy_vault, PASSWORD);

      const fixtures = await seal_fixtures();

      await expect_fixtures_readable(fixtures);

      const upgraded = { ...legacy_vault };

      await upgrade_vault_to_master_key(upgraded, PASSWORD);
      await store_vault_in_memory(upgraded, PASSWORD);

      await expect_fixtures_readable(fixtures);
    },
  );

  it(
    "reads a promoted-weak vault's data after a random key replaces it",
    LONG_TEST,
    async () => {
      const promoted = make_vault({
        data_kek: array_to_base64(
          await password_key(STORAGE_KDF_VERSION_LEGACY),
        ),
        vault_format: MASTER_KEY_VAULT_FORMAT,
      });

      await store_vault_in_memory(promoted, PASSWORD);

      const fixtures = await seal_fixtures();
      const rotated = { ...promoted };
      const prior = base64_to_array(promoted.data_kek!);

      install_random_storage_key(rotated, [prior]);
      await store_vault_in_memory(rotated, PASSWORD);

      await expect_fixtures_readable(fixtures);
    },
  );
});
