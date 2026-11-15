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
const get_vault_from_memory = vi.fn();
const get_passphrase_from_memory = vi.fn();
const get_current_account = vi.fn();
const private_key_unlocks = vi.fn();
const get_cached_preferences = vi.fn();

const KEY_HEADER = "-----BEGIN PGP PRIVATE KEY BLOCK-----\n";

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

vi.mock("@/services/crypto/identity_key_materials", () => ({
  private_key_unlocks: (...args: unknown[]) => private_key_unlocks(...args),
}));

vi.mock("@/services/api/preferences", () => ({
  get_cached_preferences: () => get_cached_preferences(),
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => ({
    readPrivateKey: async ({ armoredKey }: { armoredKey: string }) => {
      if (!armoredKey.startsWith(KEY_HEADER)) throw new Error("not a key");

      const fingerprint = armoredKey.slice(KEY_HEADER.length).split("|")[0];

      return { getFingerprint: () => fingerprint.toUpperCase() };
    },
  }),
}));

import {
  keys_added_by_recovery,
  recover_pgp_keys_from_history,
  reset_pgp_key_recovery_state,
} from "./vault_key_recovery";

function pgp_key(fingerprint: string, variant = "a"): string {
  return `${KEY_HEADER}${fingerprint}|${variant}`;
}

interface TestVault {
  identity_key: string;
  previous_keys?: string[];
  legacy_identity_keys?: string[];
  signed_prekey: string;
  signed_prekey_private: string;
  recovery_codes: string[];
  vault_format: number;
  data_kek: string;
}

function vault_with(
  identity: string,
  previous: string[],
  legacy: string[] = [],
): TestVault {
  return {
    identity_key: identity,
    previous_keys: previous,
    legacy_identity_keys: legacy,
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
    vault_format: 2,
    data_kek: "a2Vr",
  };
}

let memory_vault: TestVault;
let archived: Record<string, TestVault>;

describe("recover_pgp_keys_from_history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset_pgp_key_recovery_state();

    memory_vault = vault_with(pgp_key("new"), [pgp_key("old-identity")]);
    archived = {
      h1: vault_with(pgp_key("old-identity"), [
        pgp_key("published"),
        pgp_key("older"),
      ]),
      h2: vault_with(pgp_key("old-identity"), [pgp_key("older")]),
    };

    get_vault_from_memory.mockImplementation(() => memory_vault);
    get_passphrase_from_memory.mockReturnValue("passphrase");
    get_current_account.mockResolvedValue({ user: { id: "user-1" } });
    get_vault_history.mockResolvedValue({
      data: {
        entries: [
          { encrypted_vault: "h1", vault_nonce: "n" },
          { encrypted_vault: "h2", vault_nonce: "n" },
        ],
      },
    });
    encrypt_vault.mockImplementation((vault: TestVault) =>
      Promise.resolve({
        encrypted_vault: JSON.stringify(vault),
        vault_nonce: "nn",
      }),
    );
    decrypt_vault.mockImplementation((blob: string) =>
      archived[blob]
        ? Promise.resolve(archived[blob])
        : Promise.resolve(JSON.parse(blob)),
    );
    private_key_unlocks.mockResolvedValue(true);
    get_cached_preferences.mockReturnValue(null);
    update_vault.mockResolvedValue({ success: true });
  });

  it("restores a replaced key that only an archived vault still holds", async () => {
    const recovered = await recover_pgp_keys_from_history();

    expect(recovered?.identity_key).toBe(pgp_key("new"));
    expect(recovered?.previous_keys).toEqual([
      pgp_key("old-identity"),
      pgp_key("published"),
      pgp_key("older"),
    ]);
    expect(update_vault).toHaveBeenCalledTimes(1);
    expect(update_vault.mock.calls[0][5]).toBe(recovered);
    expect(update_vault.mock.calls[0][6]).toBe(memory_vault);
  });

  it("leaves the vault alone when the user limits key history", async () => {
    get_cached_preferences.mockReturnValue({ key_history_limit: 3 });

    expect(await recover_pgp_keys_from_history()).toBeNull();
    expect(get_vault_history).not.toHaveBeenCalled();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("matches keys by fingerprint so a re-protected copy is not added twice", async () => {
    archived.h1 = vault_with(pgp_key("old-identity", "b"), [
      pgp_key("new", "b"),
    ]);
    archived.h2 = vault_with(pgp_key("old-identity", "c"), []);

    expect(await recover_pgp_keys_from_history()).toBeNull();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("restores keys kept in the legacy list of the current vault", async () => {
    memory_vault = vault_with(pgp_key("new"), [], [pgp_key("trimmed")]);
    get_vault_history.mockResolvedValue({ data: { entries: [] } });

    const recovered = await recover_pgp_keys_from_history();

    expect(recovered?.previous_keys).toEqual([pgp_key("trimmed")]);
  });

  it("skips keys the current password cannot unlock", async () => {
    private_key_unlocks.mockImplementation(
      async (armored: string) => armored !== pgp_key("published"),
    );

    const recovered = await recover_pgp_keys_from_history();

    expect(recovered?.previous_keys).toEqual([
      pgp_key("old-identity"),
      pgp_key("older"),
    ]);
  });

  it("ignores archived vaults the current password cannot open", async () => {
    decrypt_vault.mockImplementation((blob: string) =>
      blob === "h1"
        ? Promise.reject(new Error("wrong password"))
        : archived[blob]
          ? Promise.resolve(archived[blob])
          : Promise.resolve(JSON.parse(blob)),
    );

    const recovered = await recover_pgp_keys_from_history();

    expect(recovered?.previous_keys).toEqual([
      pgp_key("old-identity"),
      pgp_key("older"),
    ]);
  });

  it("runs once per account per session", async () => {
    await recover_pgp_keys_from_history();
    await recover_pgp_keys_from_history();

    expect(get_vault_history).toHaveBeenCalledTimes(1);
  });

  it("does not report keys when the vault write fails", async () => {
    update_vault.mockResolvedValue({ success: false });

    expect(await recover_pgp_keys_from_history()).toBeNull();
  });
});

describe("keys_added_by_recovery", () => {
  it("returns only keys that were not already tried", () => {
    const recovered = vault_with("identity", ["a", "b", "c"]);

    expect(
      keys_added_by_recovery(
        recovered as unknown as Parameters<typeof keys_added_by_recovery>[0],
        ["identity", "a"],
      ),
    ).toEqual(["b", "c"]);
    expect(keys_added_by_recovery(null, ["identity"])).toEqual([]);
  });
});
