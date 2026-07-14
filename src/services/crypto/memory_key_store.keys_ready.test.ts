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
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EncryptedVault } from "./key_manager";
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

async function fresh_store() {
  vi.resetModules();

  return import("./memory_key_store");
}

describe("wait_for_keys_ready", () => {
  beforeEach(() => {
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
  });

  it("resolves false after the timeout when keys never arrive", async () => {
    const store = await fresh_store();

    await expect(store.wait_for_keys_ready(50)).resolves.toBe(false);
  });

  it("resolves false immediately after a previous wait timed out", async () => {
    const store = await fresh_store();

    await store.wait_for_keys_ready(50);

    const started = Date.now();

    await expect(store.wait_for_keys_ready(5000)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("resolves true when keys are stored while waiting", async () => {
    const store = await fresh_store();
    const pending = store.wait_for_keys_ready(5000);

    await store.store_vault_in_memory(build_vault(), "passphrase");

    await expect(pending).resolves.toBe(true);
    store.clear_vault_from_memory();
  });

  it("resolves true immediately when keys are already in memory", async () => {
    const store = await fresh_store();

    await store.store_vault_in_memory(build_vault(), "passphrase");

    await expect(store.wait_for_keys_ready(5000)).resolves.toBe(true);
    store.clear_vault_from_memory();
  });

  it("waits again after keys were ready and then cleared", async () => {
    const store = await fresh_store();

    await store.store_vault_in_memory(build_vault(), "passphrase");
    store.clear_vault_from_memory();

    const started = Date.now();
    const result = await store.wait_for_keys_ready(300);

    expect(result).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it("resolves true when keys are re-stored after a clear", async () => {
    const store = await fresh_store();

    await store.store_vault_in_memory(build_vault(), "passphrase");
    store.clear_vault_from_memory();

    const pending = store.wait_for_keys_ready(5000);
    await store.store_vault_in_memory(build_vault(), "passphrase");

    await expect(pending).resolves.toBe(true);
    store.clear_vault_from_memory();
  });
});
