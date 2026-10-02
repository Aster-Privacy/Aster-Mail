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
import { beforeEach, describe, expect, it, vi } from "vitest";

const unlock_inactive_key_sets_with_code = vi.fn();
const consume_inactive_key_set = vi.fn();
const encrypt_vault = vi.fn();
const push_vault_to_server = vi.fn();
const verify_vault_roundtrip = vi.fn();
const store_vault_in_memory = vi.fn();
const get_vault_from_memory = vi.fn();
const get_passphrase_from_memory = vi.fn();
const get_current_account = vi.fn();
const merge_identity_keys_with = vi.fn();
const hash_recovery_code = vi.fn();
const decrypt_recovery_key_with_code = vi.fn();
const decrypt_vault_backup = vi.fn();

const refresh_recovery_backup = vi.fn(
  async (_vault: unknown, _passphrase: string) => true,
);

vi.mock("./recovery_backup_refresh", () => ({
  refresh_recovery_backup: (vault: unknown, passphrase: string) =>
    refresh_recovery_backup(vault, passphrase),
}));

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: vi.fn(),
  fetch_inactive_key_set: vi.fn(),
  consume_inactive_key_set: (id: string) => consume_inactive_key_set(id),
  unlock_inactive_key_sets_with_code: (code_hash: string) =>
    unlock_inactive_key_sets_with_code(code_hash),
}));

vi.mock("./key_manager", () => ({
  decrypt_vault: vi.fn(),
  encrypt_vault: (...args: unknown[]) => encrypt_vault(...args),
}));

vi.mock("./ensure_ratchet_keys", () => ({
  push_vault_to_server: (...args: unknown[]) => push_vault_to_server(...args),
  verify_vault_roundtrip: (...args: unknown[]) =>
    verify_vault_roundtrip(...args),
}));

vi.mock("./memory_key_store", () => ({
  store_vault_in_memory: (...args: unknown[]) => store_vault_in_memory(...args),
  get_vault_from_memory: () => get_vault_from_memory(),
  get_passphrase_from_memory: () => get_passphrase_from_memory(),
  get_storage_kdf_version: (vault: { kdf_version?: number }) =>
    vault?.kdf_version === 2 ? 2 : 1,
  derive_encryption_key_from_passphrase: vi.fn(),
  STORAGE_KDF_VERSION_LEGACY: 1,
  STORAGE_KDF_VERSION_STRETCHED: 2,
}));

vi.mock("../account_manager", () => ({
  get_current_account: () => get_current_account(),
}));

vi.mock("./identity_key_materials", () => ({
  merge_recovered_identity_keys: vi.fn(),
  merge_identity_keys_with: (...args: unknown[]) =>
    merge_identity_keys_with(...args),
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("./recovery_key", () => ({
  hash_recovery_code: (code: string) => hash_recovery_code(code),
  decrypt_recovery_key_with_code: (...args: unknown[]) =>
    decrypt_recovery_key_with_code(...args),
  decrypt_vault_backup: (...args: unknown[]) => decrypt_vault_backup(...args),
}));

import {
  RECOVERY_CODE_RATE_LIMITED,
  restore_inactive_key_sets_with_code,
} from "./restore_inactive_keys";

const CODE = "ASTER-AAAA-BBBB-CCCC-DDDD";
const ARCHIVED_DATA_KEK = "YXJjaGl2ZWQtZGF0YS1rZWs=";

function ratchet_set(public_key: string) {
  return {
    ratchet_identity_key: `private-${public_key}`,
    ratchet_identity_public: public_key,
    ratchet_signed_prekey: "spk",
    ratchet_signed_prekey_public: "spk-pub",
  };
}

function current_vault() {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
    vault_format: 2,
    data_kek: "Y3VycmVudC1kYXRhLWtlaw==",
    ...ratchet_set("current-public"),
  };
}

function archived_backup() {
  return {
    identity_key: "archived-identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
    vault_format: 2,
    data_kek: ARCHIVED_DATA_KEK,
    ...ratchet_set("archived-public"),
    unlocked_keys: [["archived-identity", "archived-identity-open"]],
  };
}

function code_unlock(id: string) {
  return {
    inactive_vault_id: id,
    encrypted_recovery_key: "erk",
    recovery_key_nonce: "rkn",
    code_salt: "cs",
    encrypted_vault_backup: "evb",
    vault_backup_nonce: "vbn",
    recovery_key_salt: "rks",
  };
}

describe("restore_inactive_key_sets_with_code", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hash_recovery_code.mockResolvedValue("code-hash");
    unlock_inactive_key_sets_with_code.mockResolvedValue({
      data: { key_sets: [code_unlock("archived-1")] },
    });
    decrypt_recovery_key_with_code.mockImplementation(async () =>
      new Uint8Array(32).fill(7),
    );
    decrypt_vault_backup.mockImplementation(async () => archived_backup());
    consume_inactive_key_set.mockResolvedValue({ data: { success: true } });
    encrypt_vault.mockResolvedValue({
      encrypted_vault: "new-blob",
      vault_nonce: "new-nonce",
    });
    verify_vault_roundtrip.mockResolvedValue(true);
    push_vault_to_server.mockResolvedValue(true);
    get_vault_from_memory.mockReturnValue(current_vault());
    get_passphrase_from_memory.mockReturnValue("passphrase");
    get_current_account.mockResolvedValue({ user: { id: "user-1" } });
    merge_identity_keys_with.mockImplementation(
      async (
        vault: { previous_keys?: string[]; legacy_identity_keys?: string[] },
        old_vaults: unknown[],
      ) => ({
        previous_keys: vault.previous_keys ?? [],
        legacy_identity_keys: vault.legacy_identity_keys ?? [],
        absorbed: old_vaults.map(() => true),
      }),
    );
  });

  it("sends the code hash and never the code", async () => {
    await restore_inactive_key_sets_with_code(CODE);

    expect(hash_recovery_code).toHaveBeenCalledWith(CODE);
    expect(unlock_inactive_key_sets_with_code).toHaveBeenCalledWith(
      "code-hash",
    );
  });

  it("restores the archived keys and consumes the archive", async () => {
    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 1,
      incomplete: 0,
    });

    const saved = encrypt_vault.mock.calls[0][0] as {
      identity_key: string;
      ratchet_previous_keys: Array<{ ratchet_identity_public: string }>;
      legacy_keks?: Array<{ k: string }>;
    };

    expect(saved.identity_key).toBe("identity");
    expect(
      saved.ratchet_previous_keys.map((set) => set.ratchet_identity_public),
    ).toContain("archived-public");
    expect(saved.legacy_keks?.map((entry) => entry.k)).toContain(
      ARCHIVED_DATA_KEK,
    );
    expect(push_vault_to_server).toHaveBeenCalled();
    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-1");
  });

  it("hands the merge a vault without the unlocked copies", async () => {
    let relock_known: unknown = null;
    let relock_unknown: unknown = null;

    merge_identity_keys_with.mockImplementation(
      async (
        _vault: unknown,
        old_vaults: unknown[],
        relock: (armored: string) => Promise<string>,
      ) => {
        relock_known = await relock("archived-identity").catch(
          (error: Error) => error.message,
        );
        relock_unknown = await relock("someone-else").catch(
          (error: Error) => error.message,
        );

        return {
          previous_keys: [],
          legacy_identity_keys: [],
          absorbed: old_vaults.map(() => true),
        };
      },
    );

    await restore_inactive_key_sets_with_code(CODE);

    const [, old_vaults] = merge_identity_keys_with.mock.calls[0] as [
      unknown,
      Array<Record<string, unknown>>,
    ];

    expect(old_vaults).toHaveLength(1);
    expect("unlocked_keys" in old_vaults[0]).toBe(false);
    expect(relock_unknown).toBe("no unlocked copy for this key");
    expect(relock_known).not.toBe("no unlocked copy for this key");
  });

  it("never stores the unlocked copies in the vault", async () => {
    await restore_inactive_key_sets_with_code(CODE);

    expect(JSON.stringify(encrypt_vault.mock.calls[0][0])).not.toContain(
      "archived-identity-open",
    );
  });

  it("keeps the archive when its identity keys could not be relocked", async () => {
    merge_identity_keys_with.mockResolvedValue({
      previous_keys: [],
      legacy_identity_keys: [],
      absorbed: [false],
    });

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 1,
      incomplete: 1,
    });
    expect(push_vault_to_server).toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("does nothing when the code matches no archive", async () => {
    unlock_inactive_key_sets_with_code.mockResolvedValue({
      data: { key_sets: [] },
    });

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 0,
      incomplete: 0,
    });
    expect(encrypt_vault).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("does nothing when the code does not open the archive", async () => {
    decrypt_recovery_key_with_code.mockRejectedValue(new Error("bad code"));

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 0,
      incomplete: 0,
    });
    expect(encrypt_vault).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("opens only the archives the code unlocks", async () => {
    unlock_inactive_key_sets_with_code.mockResolvedValue({
      data: {
        key_sets: [code_unlock("archived-1"), code_unlock("archived-2")],
      },
    });
    decrypt_vault_backup
      .mockImplementationOnce(async () => archived_backup())
      .mockImplementationOnce(async () => {
        throw new Error("damaged backup");
      });

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 1,
      incomplete: 0,
    });
    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-1");
    expect(consume_inactive_key_set).not.toHaveBeenCalledWith("archived-2");
  });

  it("keeps a password-bound archive for the password method", async () => {
    decrypt_vault_backup.mockImplementation(async () => ({
      ...archived_backup(),
      vault_format: 1,
      data_kek: undefined,
    }));

    const result = await restore_inactive_key_sets_with_code(CODE);

    expect(result).toEqual({ restored: 1, incomplete: 1 });
    expect(push_vault_to_server).toHaveBeenCalledTimes(1);
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("rewrites the recovery backup once the merged vault is stored", async () => {
    await restore_inactive_key_sets_with_code(CODE);

    expect(refresh_recovery_backup).toHaveBeenCalledTimes(1);
    expect(refresh_recovery_backup.mock.calls[0][1]).toBe("passphrase");
  });

  it("never consumes an archive it could not store", async () => {
    push_vault_to_server.mockResolvedValue(false);

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 0,
      incomplete: 1,
    });
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("reports a rate limit", async () => {
    unlock_inactive_key_sets_with_code.mockResolvedValue({
      error: "Too many requests",
      status: 429,
    });

    await expect(restore_inactive_key_sets_with_code(CODE)).rejects.toThrow(
      RECOVERY_CODE_RATE_LIMITED,
    );
    expect(encrypt_vault).not.toHaveBeenCalled();
  });

  it("stops when the vault is locked", async () => {
    get_passphrase_from_memory.mockReturnValue(null);

    expect(await restore_inactive_key_sets_with_code(CODE)).toEqual({
      restored: 0,
      incomplete: 0,
    });
    expect(encrypt_vault).not.toHaveBeenCalled();
  });
});
