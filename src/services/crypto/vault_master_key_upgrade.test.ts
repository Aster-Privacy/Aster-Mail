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
import { describe, expect, it } from "vitest";
import { array_to_base64, base64_to_array } from "./base64";
import {
  STORAGE_KDF_VERSION_LEGACY,
  derive_encryption_key_from_passphrase,
  is_master_key_vault,
} from "./memory_key_store";
import { upgrade_vault_to_master_key } from "./vault_master_key_upgrade";
import type { EncryptedVault } from "./key_manager_core";

const OLD_PASSWORD = "correct horse battery staple";

function build_legacy_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
  };
}

async function import_aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal_under_password(value: string): Promise<{
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}> {
  const raw = await derive_encryption_key_from_passphrase(
    new TextEncoder().encode(OLD_PASSWORD),
    STORAGE_KDF_VERSION_LEGACY,
  );
  const key = await import_aes_key(raw);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(value),
  );

  return { ciphertext: new Uint8Array(ciphertext), nonce };
}

describe("upgrade_vault_to_master_key", () => {
  it("pins the current storage key into the vault so a password change cannot orphan data", async () => {
    const vault = build_legacy_vault();

    expect(is_master_key_vault(vault)).toBe(false);

    const upgraded = await upgrade_vault_to_master_key(vault, OLD_PASSWORD);

    expect(upgraded).toBe(true);
    expect(is_master_key_vault(vault)).toBe(true);

    const expected = await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(OLD_PASSWORD),
      STORAGE_KDF_VERSION_LEGACY,
    );

    expect(vault.data_kek).toBe(array_to_base64(expected));
    expect(vault.legacy_keks?.[0]?.k).toBe(array_to_base64(expected));
  });

  it("keeps an alias sealed under the old password readable after the change", async () => {
    const vault = build_legacy_vault();
    const sealed = await seal_under_password("spamme");

    await upgrade_vault_to_master_key(vault, OLD_PASSWORD);

    const key = await import_aes_key(base64_to_array(vault.data_kek ?? ""));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.nonce },
      key,
      sealed.ciphertext,
    );

    expect(new TextDecoder().decode(plaintext)).toBe("spamme");
  });

  it("leaves a vault that already carries a master key untouched", async () => {
    const existing = array_to_base64(new Uint8Array(32).fill(7));
    const vault: EncryptedVault = {
      ...build_legacy_vault(),
      data_kek: existing,
      vault_format: 2,
    };

    const upgraded = await upgrade_vault_to_master_key(vault, OLD_PASSWORD);

    expect(upgraded).toBe(true);
    expect(vault.data_kek).toBe(existing);
    expect(vault.legacy_keks).toBeUndefined();
  });
});
