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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store_spy = vi.hoisted(() => vi.fn(async () => undefined));
const decrypt_spy = vi.hoisted(() => vi.fn());

vi.mock("@/services/crypto/key_manager", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager")
  >()),
  decrypt_vault: decrypt_spy,
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  store_vault_in_memory: store_spy,
  has_vault_in_memory: () => false,
  has_vault_in_memory_for: () => false,
}));

vi.mock("@/services/crypto/mk_adoption", () => ({
  adopt_master_key_if_needed: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/storage_rotation/background", () => ({
  prepare_storage_key_gate: vi.fn(),
  run_storage_key_maintenance: vi.fn(async () => "idle"),
}));

vi.mock("@/services/crypto/auto_rekey", () => ({
  auto_rekey_if_needed: vi.fn(async () => false),
  reset_rekey_flag: vi.fn(),
}));

vi.mock("@/services/crypto/recovery_reencrypt", () => ({
  check_and_run_recovery_reencryption: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/ensure_pgp_key_published", () => ({
  ensure_pgp_key_published: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {
    throw new Error("not in this test");
  }),
}));

vi.mock("@/services/crypto/encrypted_storage", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/encrypted_storage")
  >()),
  rewrap_legacy_entries: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/account", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/account")>()),
  backfill_password_strength_tier: vi.fn(async () => undefined),
}));

import { decrypt_vault_with_lock } from "./vault_decryption";

import { pin_vault_generation } from "@/services/crypto/vault_generation";

const USER_ID = "user-unlock-rollback";

function vault_at(generation?: number): EncryptedVault {
  return {
    vault_generation: generation,
    identity_key: "identity-unlock",
    previous_keys: [],
  } as unknown as EncryptedVault;
}

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(resolve(here, name), "utf8").replace(/\r\n/g, "\n");
}

function guarded_stores(source: string, owner: string): number {
  const pattern = new RegExp(
    String.raw`refuse_rolled_back_vault(?:_with_notice)?\(\s*${owner},\s*vault(?:,[^;]*)?\);\r?\n\s*await store_vault_in_memory\(`,
    "g",
  );

  return source.match(pattern)?.length ?? 0;
}

beforeEach(() => {
  store_spy.mockClear();
  decrypt_spy.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe("vault rollback check at unlock", () => {
  it("refuses an older vault when this device pinned a newer one", async () => {
    pin_vault_generation(USER_ID, vault_at(7));
    decrypt_spy.mockResolvedValue(vault_at(3));

    await expect(
      decrypt_vault_with_lock("sealed", "nonce", "passphrase", USER_ID),
    ).rejects.toThrow("vault_rolled_back");
    expect(store_spy).not.toHaveBeenCalled();
  });

  it("opens the vault on a device that has no pin yet", async () => {
    decrypt_spy.mockResolvedValue(vault_at(3));

    await expect(
      decrypt_vault_with_lock("sealed", "nonce", "passphrase", USER_ID),
    ).resolves.toEqual(vault_at(3));
    expect(store_spy).toHaveBeenCalledTimes(1);
  });

  it("opens the pinned generation and newer ones", async () => {
    pin_vault_generation(USER_ID, vault_at(7));
    decrypt_spy.mockResolvedValue(vault_at(8));

    await expect(
      decrypt_vault_with_lock("sealed", "nonce", "passphrase", USER_ID),
    ).resolves.toEqual(vault_at(8));
    expect(store_spy).toHaveBeenCalledTimes(1);
  });
});

describe("vault rollback check at sign-in", () => {
  it("checks the vault before password sign-in and add account store it", () => {
    expect(
      guarded_stores(read("use_auth_account_state.ts"), String.raw`user\.id`),
    ).toBe(2);
  });

  it("checks the vault before the provider stores it", () => {
    expect(guarded_stores(read("use_auth_provider_state.ts"), "owner_id")).toBe(
      1,
    );
  });
});
