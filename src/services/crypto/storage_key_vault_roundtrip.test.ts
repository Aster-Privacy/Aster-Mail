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
import type { EncryptedVault, StorageRekeyState } from "./key_manager_core";

import { beforeEach, describe, expect, it, vi } from "vitest";

const push_vault_to_server = vi.fn();
const save_recovery_backup = vi.fn();

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: vi.fn(),
  fetch_inactive_key_set: vi.fn(),
  unlock_inactive_key_sets_with_code: vi.fn(),
  consume_inactive_key_set: vi.fn(),
  save_recovery_backup: (...args: unknown[]) => save_recovery_backup(...args),
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => null,
}));

vi.mock("./account_key_loader", () => ({
  load_account_keys_for_session: vi.fn().mockResolvedValue(0),
}));

vi.mock("./ensure_ratchet_keys", async (import_original) => {
  const original =
    await import_original<typeof import("./ensure_ratchet_keys")>();

  return {
    verify_vault_roundtrip: original.verify_vault_roundtrip,
    push_vault_to_server: (...args: unknown[]) => push_vault_to_server(...args),
    server_vault_matches_stored: async () => true,
    sync_vault_with_server: async () => ({ status: "current" }),
  };
});

import { array_to_base64 } from "./base64";
import { carry_vault_through_reset } from "./carry_vault_through_reset";
import { decrypt_vault, encrypt_vault } from "./key_manager";
import { normalize_vault_fields } from "./key_manager_pgp_vault";
import { generate_identity_keypair } from "./key_manager_pgp_keygen";
import {
  MASTER_KEY_VAULT_FORMAT,
  clear_vault_from_memory,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import {
  decrypt_vault_backup,
  encrypt_vault_backup,
  generate_recovery_key,
} from "./recovery_key";
import { commit_recovered_keys } from "./restore_inactive_keys";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const PASSWORD = "Roundtrip-Passw0rd-71";
const NEW_PASSWORD = "Roundtrip-Passw0rd-after-reset";
const LONG_TEST = { timeout: 120000 };

function random_key(): string {
  return array_to_base64(crypto.getRandomValues(new Uint8Array(32)));
}

const REKEY: StorageRekeyState = {
  state: "pending",
  started_at: "2026-11-06T00:00:00.000Z",
  prior_keys: [random_key()],
};

async function build_vault(password: string): Promise<EncryptedVault> {
  const keypair = await generate_identity_keypair(
    "roundtrip",
    "roundtrip@example.test",
    password,
  );

  return {
    identity_key: keypair.secret_key,
    previous_keys: [],
    signed_prekey: "spk",
    signed_prekey_private: "spk-private",
    recovery_codes: [],
    data_kek: random_key(),
    data_kek_random: true,
    storage_rekey: { ...REKEY, prior_keys: [...(REKEY.prior_keys ?? [])] },
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: "2026-11-01T00:00:00.000Z",
  };
}

function expect_storage_fields(
  actual: EncryptedVault,
  expected: EncryptedVault,
): void {
  expect(actual.data_kek).toBe(expected.data_kek);
  expect(actual.data_kek_random).toBe(true);
  expect(actual.storage_rekey).toEqual(expected.storage_rekey);
}

describe("storage key fields survive every vault rewrite", () => {
  beforeEach(() => {
    push_vault_to_server.mockReset();
    push_vault_to_server.mockResolvedValue(true);
    save_recovery_backup.mockReset();
    save_recovery_backup.mockResolvedValue({ data: { success: true } });
    clear_vault_from_memory();
  });

  it("survives password sealing and reopening", LONG_TEST, async () => {
    const vault = await build_vault(PASSWORD);
    const sealed = await encrypt_vault(vault, NEW_PASSWORD);
    const reopened = await decrypt_vault(
      sealed.encrypted_vault,
      sealed.vault_nonce,
      NEW_PASSWORD,
    );

    expect_storage_fields(reopened, vault);
  });

  it("survives normalize_vault_fields", LONG_TEST, async () => {
    const vault = await build_vault(PASSWORD);
    const normalized = normalize_vault_fields(
      JSON.parse(JSON.stringify(vault)) as EncryptedVault,
    );

    expect_storage_fields(normalized, vault);
  });

  it("survives the recovery backup", LONG_TEST, async () => {
    const vault = await build_vault(PASSWORD);
    const recovery_key = generate_recovery_key();
    const backup = await encrypt_vault_backup(vault, recovery_key);
    const restored = await decrypt_vault_backup(backup, recovery_key);

    expect_storage_fields(restored, vault);
  });

  it("survives a reset that carries a random key", LONG_TEST, async () => {
    const old_vault = await build_vault(PASSWORD);
    const fresh = await build_vault(NEW_PASSWORD);

    delete fresh.storage_rekey;

    const carried = await carry_vault_through_reset(
      old_vault,
      PASSWORD,
      fresh,
      NEW_PASSWORD,
    );

    expect_storage_fields(carried, old_vault);
  });

  it("survives storing the vault in memory", LONG_TEST, async () => {
    const vault = await build_vault(PASSWORD);

    await store_vault_in_memory(vault, PASSWORD, USER_ID);

    const in_memory = get_vault_from_memory();

    expect(in_memory).not.toBeNull();
    expect_storage_fields(in_memory!, vault);
  });

  it("survives committing recovered keys", LONG_TEST, async () => {
    const vault = await build_vault(PASSWORD);

    const result = await commit_recovered_keys({
      user_id: USER_ID,
      vault,
      passphrase: PASSWORD,
      identity_keys: {
        previous_keys: [],
        legacy_identity_keys: [],
        absorbed: [],
      },
      ratchet_groups: [],
      storage_keys: [crypto.getRandomValues(new Uint8Array(32))],
    });

    expect(result.written).toBe(true);

    const pushed = push_vault_to_server.mock.calls[0];
    const reopened = await decrypt_vault(
      pushed[0] as string,
      pushed[1] as string,
      PASSWORD,
    );

    expect_storage_fields(reopened, vault);
    expect_storage_fields(get_vault_from_memory()!, vault);
  });
});
