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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "33333333-4444-4555-8666-777777777777";
const PASSWORD = "Ios-Reader-Passw0rd-42";
const LOGIN_SALT = new Uint8Array(16).fill(11);
const LONG_TEST = { timeout: 120000 };

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<typeof import("@/services/account_manager")>()),
  get_current_account: async () => ({
    user: {
      id: "33333333-4444-4555-8666-777777777777",
      email: "reader@example.test",
      username: "reader",
    },
  }),
}));

vi.mock("@/services/api/auth", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/auth")>()),
  get_user_salt: async () => ({
    data: { salt: btoa(String.fromCharCode(...new Uint8Array(16).fill(11))) },
  }),
  get_retired_login_salts: async () => [],
}));

import { array_to_base64 } from "./base64";
import {
  clear_legacy_ios_envelope_key,
  decrypt_legacy_ios_envelope,
} from "./legacy_ios_envelope";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  store_vault_in_memory,
} from "./memory_key_store";
import { derive_storage_hmac_key } from "./storage_write_key";

import { decrypt_account_data } from "@/services/api/external_accounts/crypto";

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

function random_key_vault(
  data_kek: Uint8Array,
  overrides: Partial<EncryptedVault> = {},
): EncryptedVault {
  return make_vault({
    data_kek: array_to_base64(data_kek),
    data_kek_random: true,
    vault_format: MASTER_KEY_VAULT_FORMAT,
    ...overrides,
  });
}

function legacy_kek_vault(retired: Uint8Array): EncryptedVault {
  return random_key_vault(random_key(), {
    legacy_keks: [
      { k: array_to_base64(retired), added_at: "2026-11-01T00:00:00Z" },
    ],
  });
}

async function password_key(version: number): Promise<Uint8Array> {
  return derive_encryption_key_from_passphrase(
    new TextEncoder().encode(PASSWORD),
    version,
  );
}

async function ios_key_material(): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PASSWORD),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: LOGIN_SALT, iterations: 310000, hash: "SHA-256" },
    material,
    256,
  );

  return new Uint8Array(bits);
}

async function seal(
  raw: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext),
  );
}

async function opens_attachment_meta(raw: Uint8Array): Promise<boolean> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await seal(
    raw,
    new TextEncoder().encode(JSON.stringify({ filename: "scan.pdf" })),
    nonce,
  );
  const plaintext = await decrypt_legacy_ios_envelope(ciphertext, nonce);

  if (!plaintext) return false;

  return (
    JSON.parse(new TextDecoder().decode(plaintext)).filename === "scan.pdf"
  );
}

async function reads_external_account(raw: Uint8Array): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(
    JSON.stringify({
      email: "imap@example.test",
      display_name: "Imap",
      created_at: "2026-11-06T00:00:00Z",
    }),
  );
  const sealed = await seal(raw, payload, nonce);
  const combined = new Uint8Array(nonce.length + sealed.length);

  combined.set(nonce, 0);
  combined.set(sealed, nonce.length);

  const encrypted = array_to_base64(combined);
  const nonce_b64 = array_to_base64(nonce);
  const hmac_key = await derive_storage_hmac_key(
    raw,
    "external-accounts-hmac-v1",
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    hmac_key,
    new TextEncoder().encode(`${encrypted}:${nonce_b64}:external-accounts-v1`),
  );
  const account = await decrypt_account_data(
    encrypted,
    nonce_b64,
    array_to_base64(new Uint8Array(mac)),
  );

  return account.email;
}

beforeEach(() => {
  clear_legacy_ios_envelope_key();
});

afterEach(() => {
  clear_vault_from_memory();
  clear_legacy_ios_envelope_key();
});

describe("iOS attachment meta readers", () => {
  it("opens meta sealed with the vault data_kek", LONG_TEST, async () => {
    const data_kek = random_key();

    await store_vault_in_memory(random_key_vault(data_kek), PASSWORD, USER_ID);

    expect(await opens_attachment_meta(data_kek)).toBe(true);
  });

  it(
    "opens meta sealed with the HKDF v1 key on a vault without data_kek",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(make_vault(), PASSWORD, USER_ID);

      expect(
        await opens_attachment_meta(
          await password_key(STORAGE_KDF_VERSION_LEGACY),
        ),
      ).toBe(true);
    },
  );

  it(
    "opens meta sealed with the HKDF v1 key after a random key was installed",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(
        random_key_vault(random_key()),
        PASSWORD,
        USER_ID,
      );

      expect(
        await opens_attachment_meta(
          await password_key(STORAGE_KDF_VERSION_LEGACY),
        ),
      ).toBe(true);
    },
  );

  it("opens meta sealed with the stretched v2 key", LONG_TEST, async () => {
    await store_vault_in_memory(
      random_key_vault(random_key(), {
        kdf_version: STORAGE_KDF_VERSION_STRETCHED,
      }),
      PASSWORD,
      USER_ID,
    );

    expect(
      await opens_attachment_meta(
        await password_key(STORAGE_KDF_VERSION_STRETCHED),
      ),
    ).toBe(true);
  });

  it(
    "opens meta sealed with a key kept in legacy_keks",
    LONG_TEST,
    async () => {
      const retired = random_key();

      await store_vault_in_memory(legacy_kek_vault(retired), PASSWORD, USER_ID);

      expect(await opens_attachment_meta(retired)).toBe(true);
    },
  );

  it(
    "still opens old meta sealed with the login key material",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(
        random_key_vault(random_key()),
        PASSWORD,
        USER_ID,
      );

      expect(await opens_attachment_meta(await ios_key_material())).toBe(true);
    },
  );

  it("rejects meta sealed with an unknown key", LONG_TEST, async () => {
    await store_vault_in_memory(
      random_key_vault(random_key()),
      PASSWORD,
      USER_ID,
    );

    expect(await opens_attachment_meta(random_key())).toBe(false);
  });
});

describe("iOS external account readers", () => {
  it(
    "reads the combined format sealed with the login key material",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(
        random_key_vault(random_key()),
        PASSWORD,
        USER_ID,
      );

      expect(await reads_external_account(await ios_key_material())).toBe(
        "imap@example.test",
      );
    },
  );

  it(
    "reads the combined format sealed with the vault data_kek",
    LONG_TEST,
    async () => {
      const data_kek = random_key();

      await store_vault_in_memory(
        random_key_vault(data_kek),
        PASSWORD,
        USER_ID,
      );

      expect(await reads_external_account(data_kek)).toBe("imap@example.test");
    },
  );

  it(
    "reads the combined format sealed with the HKDF v1 key",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(make_vault(), PASSWORD, USER_ID);

      expect(
        await reads_external_account(
          await password_key(STORAGE_KDF_VERSION_LEGACY),
        ),
      ).toBe("imap@example.test");
    },
  );

  it(
    "reads the combined format sealed with a key kept in legacy_keks",
    LONG_TEST,
    async () => {
      const retired = random_key();

      await store_vault_in_memory(legacy_kek_vault(retired), PASSWORD, USER_ID);

      expect(await reads_external_account(retired)).toBe("imap@example.test");
    },
  );

  it(
    "rejects a combined row sealed with an unknown key",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(
        random_key_vault(random_key()),
        PASSWORD,
        USER_ID,
      );

      await expect(reads_external_account(random_key())).rejects.toThrow();
    },
  );
});
