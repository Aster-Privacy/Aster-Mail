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

import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<typeof import("@/services/account_manager")>()),
  get_current_account: async () => ({
    user: {
      id: "44444444-5555-4666-8777-888888888888",
      email: "retire@example.test",
      username: "retire",
    },
  }),
}));

vi.mock("@/services/api/auth", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/auth")>()),
  get_user_salt: async () => ({
    data: { salt: btoa(String.fromCharCode(...new Uint8Array(16).fill(7))) },
  }),
  get_retired_login_salts: async () => [],
}));

vi.mock("./vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async () => [],
}));

import { array_to_base64, base64_to_array } from "./base64";
import {
  MASTER_KEY_VAULT_FORMAT,
  clear_vault_from_memory,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { merge_vault_for_write } from "./vault_cas_write";

const USER_ID = "44444444-5555-4666-8777-888888888888";
const PASSWORD = "Retire-Passw0rd-after-change";
const LONG_TEST = { timeout: 120000 };
const OLD_PASSWORD_KEK = "cGFzc3dvcmQtZGVyaXZlZC1rZWstZm9yLXRlc3RzMDA=";

type RetiringVault = EncryptedVault & {
  pending_retire_kek_ids?: string[];
  retired_storage_kek_ids?: string[];
};

function retired_id(encoded: string): string {
  const domain = new TextEncoder().encode("aster-retired-storage-kek-v1");
  const raw = base64_to_array(encoded);
  const input = new Uint8Array(domain.length + 1 + raw.length);

  input.set(domain, 0);
  input.set(raw, domain.length + 1);

  return array_to_base64(sha256(input));
}

function vault_with_old_password_key(
  overrides: Partial<RetiringVault> = {},
): RetiringVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    vault_format: MASTER_KEY_VAULT_FORMAT,
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    data_kek_random: true,
    legacy_keks: [
      { k: OLD_PASSWORD_KEK, added_at: "2026-11-01T00:00:00.000Z" },
    ],
    ...overrides,
  };
}

function holds_old_password_key(vault: EncryptedVault | null): boolean {
  return (vault?.legacy_keks ?? []).some(
    (entry) => entry.k === OLD_PASSWORD_KEK,
  );
}

describe("old password storage keys after the sweep", () => {
  afterEach(() => {
    clear_vault_from_memory();
  });

  it("drops an old password key from the merged vault once the server marks it retired", () => {
    const server_copy = vault_with_old_password_key({
      retired_storage_kek_ids: [retired_id(OLD_PASSWORD_KEK)],
      legacy_keks: [],
    });
    const local = vault_with_old_password_key();
    const merged = merge_vault_for_write(
      server_copy,
      local,
      { ...local, identity_key: "identity-2" },
      false,
    );

    expect(holds_old_password_key(merged)).toBe(false);
  });

  it("drops an old password key the server copy still holds once this device retired it", () => {
    const local = vault_with_old_password_key();
    const merged = merge_vault_for_write(
      vault_with_old_password_key(),
      local,
      {
        ...local,
        legacy_keks: [],
        retired_storage_kek_ids: [retired_id(OLD_PASSWORD_KEK)],
      } as RetiringVault,
      false,
    );

    expect(holds_old_password_key(merged)).toBe(false);
  });

  it(
    "does not load an old password key the vault lists as retired",
    LONG_TEST,
    async () => {
      await store_vault_in_memory(
        vault_with_old_password_key({
          retired_storage_kek_ids: [retired_id(OLD_PASSWORD_KEK)],
        }),
        PASSWORD,
        USER_ID,
      );

      expect(holds_old_password_key(get_vault_from_memory())).toBe(false);
    },
  );
});
