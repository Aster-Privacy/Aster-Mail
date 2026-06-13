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
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { EncryptedVault } from "./key_manager";
import {
  store_vault_in_memory,
  clear_vault_from_memory,
  verify_passphrase_for_export,
} from "./memory_key_store";
import { subtle_crypto_mock } from "@/tests/setup";

function build_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: ["code_one", "code_two"],
  };
}

describe("validate_passphrase constant-time comparison", () => {
  beforeEach(() => {
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
  });

  afterEach(() => {
    clear_vault_from_memory();
  });

  it("validates the correct passphrase as true", async () => {
    await store_vault_in_memory(build_vault(), "correct horse battery staple");

    expect(
      verify_passphrase_for_export("correct horse battery staple"),
    ).toBe(true);
  });

  it("rejects a wrong passphrase as false", async () => {
    await store_vault_in_memory(build_vault(), "correct horse battery staple");

    expect(verify_passphrase_for_export("wrong passphrase")).toBe(false);
  });

  it("rejects a wrong passphrase of equal length as false", async () => {
    await store_vault_in_memory(build_vault(), "abcdef");

    expect(verify_passphrase_for_export("abcdeg")).toBe(false);
  });

  it("rejects a passphrase that is a prefix of the stored one", async () => {
    await store_vault_in_memory(build_vault(), "longpassphrase");

    expect(verify_passphrase_for_export("long")).toBe(false);
  });

  it("rejects an empty passphrase when a real one is stored", async () => {
    await store_vault_in_memory(build_vault(), "nonempty");

    expect(verify_passphrase_for_export("")).toBe(false);
  });

  it("returns false when no vault is in memory", () => {
    expect(verify_passphrase_for_export("anything")).toBe(false);
  });
});
