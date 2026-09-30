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
import type { EncryptedVault } from "./key_manager";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  store_vault_in_memory,
  clear_vault_from_memory,
  has_vault_in_memory,
  has_vault_in_memory_for,
  get_vault_owner_id,
  is_vault_owned_by,
} from "./memory_key_store";

import { subtle_crypto_mock } from "@/tests/setup";

const OWNER_A = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const OWNER_B = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

function build_vault(identity: string): EncryptedVault {
  return {
    identity_key: identity,
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: ["code_one", "code_two"],
  };
}

describe("in memory vault owner binding", () => {
  beforeEach(() => {
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
    clear_vault_from_memory();
  });

  afterEach(() => {
    clear_vault_from_memory();
  });

  it("records the owner supplied at store time", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);

    expect(get_vault_owner_id()).toBe(OWNER_A);
    expect(has_vault_in_memory()).toBe(true);
    expect(has_vault_in_memory_for(OWNER_A)).toBe(true);
  });

  it("refuses to hand another account the loaded vault", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);

    expect(has_vault_in_memory_for(OWNER_B)).toBe(false);
    expect(is_vault_owned_by(OWNER_B)).toBe(false);
  });

  it("treats a missing user id as not owning the vault", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);

    expect(has_vault_in_memory_for(null)).toBe(false);
    expect(has_vault_in_memory_for(undefined)).toBe(false);
    expect(has_vault_in_memory_for("")).toBe(false);
  });

  it("clears the owner when the vault is cleared", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);
    clear_vault_from_memory();

    expect(get_vault_owner_id()).toBeNull();
    expect(has_vault_in_memory_for(OWNER_A)).toBe(false);
  });

  it("rebinds the owner when a different account stores a vault", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);
    await store_vault_in_memory(build_vault("b"), "passphrase_b", OWNER_B);

    expect(get_vault_owner_id()).toBe(OWNER_B);
    expect(has_vault_in_memory_for(OWNER_B)).toBe(true);
    expect(has_vault_in_memory_for(OWNER_A)).toBe(false);
  });

  it("carries the owner forward when a rotation omits it", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a", OWNER_A);
    await store_vault_in_memory(build_vault("a_rotated"), "passphrase_new");

    expect(get_vault_owner_id()).toBe(OWNER_A);
    expect(has_vault_in_memory_for(OWNER_A)).toBe(true);
    expect(has_vault_in_memory_for(OWNER_B)).toBe(false);
  });

  it("stays permissive when no owner was ever recorded", async () => {
    await store_vault_in_memory(build_vault("a"), "passphrase_a");

    expect(get_vault_owner_id()).toBeNull();
    expect(has_vault_in_memory_for(OWNER_A)).toBe(true);
    expect(has_vault_in_memory_for(OWNER_B)).toBe(true);
  });
});
