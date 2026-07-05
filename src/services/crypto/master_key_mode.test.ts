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

import { describe, it, expect, afterEach } from "vitest";

import {
  store_vault_in_memory,
  get_vault_from_memory,
  get_derived_encryption_key,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  is_master_key_vault,
  MASTER_KEY_VAULT_FORMAT,
} from "./memory_key_store";
import { array_to_base64 } from "./key_manager_core";

function base64_to_array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function make_vault(overrides: Partial<EncryptedVault> = {}): EncryptedVault {
  return {
    identity_key: "test-identity-key",
    signed_prekey: "test-signed-prekey",
    signed_prekey_private: "test-signed-prekey-private",
    recovery_codes: ["ASTER-TEST-TEST-TEST"],
    ...overrides,
  };
}

afterEach(() => {
  clear_vault_from_memory();
});

describe("is_master_key_vault", () => {
  it("is false for legacy vaults", () => {
    expect(is_master_key_vault(make_vault())).toBe(false);
    expect(is_master_key_vault(null)).toBe(false);
    expect(
      is_master_key_vault(make_vault({ vault_format: 1, data_kek: "abcd" })),
    ).toBe(false);
    expect(is_master_key_vault(make_vault({ vault_format: 2 }))).toBe(false);
  });

  it("is true only for format 2 with a data_kek", () => {
    expect(
      is_master_key_vault(
        make_vault({
          vault_format: MASTER_KEY_VAULT_FORMAT,
          data_kek: array_to_base64(new Uint8Array(32)),
        }),
      ),
    ).toBe(true);
  });
});

describe("store_vault_in_memory master key mode", () => {
  it("uses data_kek as the derived key for format 2 vaults", async () => {
    const master_key = crypto.getRandomValues(new Uint8Array(32));
    const vault = make_vault({
      vault_format: MASTER_KEY_VAULT_FORMAT,
      data_kek: array_to_base64(master_key),
      mk_created_at: new Date().toISOString(),
    });

    await store_vault_in_memory(vault, "some-login-password");

    const derived = get_derived_encryption_key();

    expect(derived).not.toBeNull();
    expect(Array.from(derived!)).toEqual(Array.from(master_key));

    const in_memory = get_vault_from_memory();

    expect(in_memory?.data_kek).toBe(array_to_base64(master_key));
    expect(in_memory?.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
  });

  it("does not overwrite data_kek with the password derived key in mk mode", async () => {
    const master_key = crypto.getRandomValues(new Uint8Array(32));
    const password = "correct horse battery staple";
    const vault = make_vault({
      vault_format: MASTER_KEY_VAULT_FORMAT,
      data_kek: array_to_base64(master_key),
    });

    await store_vault_in_memory(vault, password);

    const password_derived = await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(password),
    );
    const in_memory = get_vault_from_memory();

    expect(in_memory?.data_kek).not.toBe(array_to_base64(password_derived));
    expect(in_memory?.data_kek).toBe(array_to_base64(master_key));
  });

  it("keeps legacy behavior for format 1 vaults", async () => {
    const password = "legacy-user-password";
    const vault = make_vault();

    await store_vault_in_memory(vault, password);

    const derived = get_derived_encryption_key();
    const expected = await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(password),
    );

    expect(derived).not.toBeNull();
    expect(Array.from(derived!)).toEqual(Array.from(expected));

    const in_memory = get_vault_from_memory();

    expect(in_memory?.data_kek).toBe(array_to_base64(expected));
  });

  it("decrypts mk mode ciphertext written before a password change after the change", async () => {
    const master_key = crypto.getRandomValues(new Uint8Array(32));
    const vault = make_vault({
      vault_format: MASTER_KEY_VAULT_FORMAT,
      data_kek: array_to_base64(master_key),
    });

    await store_vault_in_memory(vault, "old-password");

    const key_before = get_derived_encryption_key()!;
    const aes_before = await crypto.subtle.importKey(
      "raw",
      key_before,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode("alias-label-secret");
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes_before,
      plaintext,
    );

    clear_vault_from_memory();

    await store_vault_in_memory(vault, "completely-new-password");

    const key_after = get_derived_encryption_key()!;

    expect(Array.from(key_after)).toEqual(
      Array.from(base64_to_array(vault.data_kek!)),
    );

    const aes_after = await crypto.subtle.importKey(
      "raw",
      key_after,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      aes_after,
      ciphertext,
    );

    expect(new TextDecoder().decode(decrypted)).toBe("alias-label-secret");
  });
});
