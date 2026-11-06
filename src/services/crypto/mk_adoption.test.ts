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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api_put = vi.fn();
const api_get = vi.fn();

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "11111111-2222-4333-8444-555555555555" },
  }),
}));

vi.mock("../api/client", () => ({
  api_client: {
    put: (...args: unknown[]) => api_put(...args),
    get: (...args: unknown[]) => api_get(...args),
  },
}));

vi.mock("./ensure_ratchet_keys", () => ({
  sync_vault_with_server: async () => ({ status: "current" }),
}));

vi.mock("./vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async () => [],
}));

import { array_to_base64 } from "./base64";
import { decrypt_vault, encrypt_vault } from "./key_manager";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_LEGACY,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { adopt_master_key_if_needed } from "./mk_adoption";
import { is_weak_storage_vault } from "./storage_write_key";

const PASSWORD = "Adoption-Passw0rd-42";
const LONG_TEST = { timeout: 120000 };

function legacy_vault(): EncryptedVault {
  return {
    identity_key: "test-identity-key",
    signed_prekey: "test-signed-prekey",
    signed_prekey_private: "test-signed-prekey-private",
    recovery_codes: [],
  };
}

describe("master key adoption", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MK_ADOPTION_ENABLED", "true");
    api_put.mockReset();
    api_put.mockResolvedValue({ data: { success: true } });
    api_get.mockReset();
    clear_vault_from_memory();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clear_vault_from_memory();
  });

  it(
    "installs a random storage key and keeps the password key for reads",
    LONG_TEST,
    async () => {
      const vault = legacy_vault();

      await store_vault_in_memory(vault, PASSWORD);
      api_get.mockResolvedValue({
        data: { ...(await encrypt_vault(vault, PASSWORD)), vault_sha256: "sha" },
      });

      const password_key = array_to_base64(
        await derive_encryption_key_from_passphrase(
          new TextEncoder().encode(PASSWORD),
          STORAGE_KDF_VERSION_LEGACY,
        ),
      );

      expect(await adopt_master_key_if_needed(vault, PASSWORD)).toBe(true);

      const body = api_put.mock.calls[0][1] as {
        encrypted_vault: string;
        vault_nonce: string;
      };
      const sent = await decrypt_vault(
        body.encrypted_vault,
        body.vault_nonce,
        PASSWORD,
      );

      expect(sent.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
      expect(sent.data_kek_random).toBe(true);
      expect(sent.data_kek).not.toBe(password_key);
      expect(sent.legacy_keks?.map((entry) => entry.k)).toContain(password_key);
      expect(sent.storage_rekey?.state).toBe("pending");
      expect(sent.storage_rekey?.prior_keys).toContain(password_key);
      expect(await is_weak_storage_vault(sent, PASSWORD)).toBe(false);
      expect(get_vault_from_memory()?.data_kek).toBe(sent.data_kek);
    },
  );

  it("does nothing when adoption is turned off", LONG_TEST, async () => {
    vi.stubEnv("VITE_MK_ADOPTION_ENABLED", "false");

    const vault = legacy_vault();

    await store_vault_in_memory(vault, PASSWORD);

    expect(await adopt_master_key_if_needed(vault, PASSWORD)).toBe(false);
    expect(api_put).not.toHaveBeenCalled();
  });
});
