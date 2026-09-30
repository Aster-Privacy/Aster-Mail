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
import { beforeEach, describe, expect, it, vi } from "vitest";

const decrypt_vault = vi.fn();
const encrypt_vault = vi.fn();
const get_vault_history = vi.fn();
const update_vault = vi.fn();
const store_vault_in_memory = vi.fn();
const get_vault_from_memory = vi.fn();
const get_passphrase_from_memory = vi.fn();
const get_current_account = vi.fn();

vi.mock("@/services/crypto/key_manager_pgp", () => ({
  decrypt_vault: (...args: unknown[]) => decrypt_vault(...args),
  derive_public_keys_from_private: () => Promise.resolve([]),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_vault: (...args: unknown[]) => encrypt_vault(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => get_vault_from_memory(),
  get_passphrase_from_memory: () => get_passphrase_from_memory(),
  store_vault_in_memory: (...args: unknown[]) => store_vault_in_memory(...args),
  MASTER_KEY_VAULT_FORMAT: 2,
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/services/api/key_rotation", () => ({
  get_vault_history: () => get_vault_history(),
  update_vault: (...args: unknown[]) => update_vault(...args),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: () => get_current_account(),
}));

import {
  recover_ratchet_keys_from_history,
  reset_ratchet_key_recovery_state,
} from "./vault_key_recovery";

function key_set(public_key: string) {
  return {
    ratchet_identity_key: `private-${public_key}`,
    ratchet_identity_public: public_key,
    ratchet_signed_prekey: "spk",
    ratchet_signed_prekey_public: "spk-pub",
  };
}

function vault_with(current: string, previous: string[]) {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
    vault_format: 2,
    data_kek: "a2Vr",
    ...key_set(current),
    ratchet_previous_keys: previous.map(key_set),
  };
}

type SavedVault = ReturnType<typeof vault_with>;

let memory_vault: SavedVault;
let archived_vault: SavedVault;

describe("recover_ratchet_keys_from_history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset_ratchet_key_recovery_state();

    memory_vault = vault_with("current", ["older"]);
    archived_vault = vault_with("lost-published", ["older"]);

    get_vault_from_memory.mockImplementation(() => memory_vault);
    get_passphrase_from_memory.mockReturnValue("passphrase");
    get_current_account.mockResolvedValue({ user: { id: "user-1" } });
    get_vault_history.mockResolvedValue({
      data: { entries: [{ encrypted_vault: "old", vault_nonce: "n" }] },
    });
    encrypt_vault.mockImplementation((vault: SavedVault) =>
      Promise.resolve({
        encrypted_vault: JSON.stringify(vault),
        vault_nonce: "nn",
      }),
    );
    decrypt_vault.mockImplementation((blob: string) =>
      Promise.resolve(blob === "old" ? archived_vault : JSON.parse(blob)),
    );
    update_vault.mockResolvedValue({ success: true });
  });

  it("restores a ratchet identity that only an archived vault holds", async () => {
    const recovered = await recover_ratchet_keys_from_history();
    const publics = recovered?.ratchet_previous_keys?.map(
      (set) => set.ratchet_identity_public,
    );

    expect(publics).toContain("lost-published");
    expect(publics).toContain("older");
    expect(recovered?.ratchet_identity_public).toBe("current");
    expect(update_vault).toHaveBeenCalledTimes(1);
    expect(update_vault.mock.calls[0][4]).toBe(true);
    expect(store_vault_in_memory).toHaveBeenCalledTimes(1);
  });

  it("keeps a recovered identity when the prior key list is full", async () => {
    memory_vault = vault_with(
      "current",
      Array.from({ length: 32 }, (_, i) => `full-${i}`),
    );

    const recovered = await recover_ratchet_keys_from_history();
    const publics = recovered?.ratchet_previous_keys?.map(
      (set) => set.ratchet_identity_public,
    );

    expect(publics?.[0]).toBe("lost-published");
    expect(publics).toHaveLength(32);
  });

  it("writes nothing when history holds no unknown identity", async () => {
    archived_vault = vault_with("older", []);

    expect(await recover_ratchet_keys_from_history()).toBeNull();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("does not keep the recovered vault when the server rejects it", async () => {
    update_vault.mockResolvedValue({ success: false });

    expect(await recover_ratchet_keys_from_history()).toBeNull();
    expect(store_vault_in_memory).not.toHaveBeenCalled();
  });

  it("runs at most once per account per session", async () => {
    await recover_ratchet_keys_from_history();
    await recover_ratchet_keys_from_history();

    expect(get_vault_history).toHaveBeenCalledTimes(1);
  });
});
