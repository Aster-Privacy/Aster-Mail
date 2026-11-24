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

import { beforeEach, describe, expect, it, vi } from "vitest";

const saved_backups: {
  encrypted_data: string;
  nonce: string;
  salt: string;
}[] = [];
const issued_keys: Uint8Array[] = [];

vi.mock("../api/sync_format_readiness", () => ({
  get_sync_format_readiness: async () => ({
    ratchet_sync_bound: true,
    recovery_backup_bound: true,
  }),
}));

vi.mock("./vault_cas_write", () => ({
  write_vault_merged: async () => ({ status: "written" }),
}));

vi.mock("../api/recovery", () => ({
  get_codes_status: async () => ({ data: {} }),
  save_recovery_backup: async (
    encrypted_data: string,
    nonce: string,
    salt: string,
  ) => {
    saved_backups.push({ encrypted_data, nonce, salt });

    return { data: { success: true } };
  },
}));

vi.mock("./backup_unlocked_keys", () => ({
  build_backup_vault: async (vault: unknown) => vault,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({ user: { id: "user-1" } }),
  get_all_accounts: async () => [],
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: vi.fn() }));

vi.mock("./recovery_key", async (import_original) => {
  const actual = await import_original<typeof import("./recovery_key")>();

  return {
    ...actual,
    generate_recovery_key: () => {
      const key = crypto.getRandomValues(new Uint8Array(32));

      issued_keys.push(key.slice());

      return key;
    },
    generate_all_recovery_shares: async () => [],
    clear_recovery_key: () => undefined,
  };
});

import * as recovery_key_module from "./recovery_key";
import { refresh_recovery_backup } from "./recovery_backup_refresh";

type OpenBackup = (
  backup: { encrypted_data: string; nonce: string; salt: string },
  key: Uint8Array,
  expected_user_id: string | null,
) => Promise<{ vault: EncryptedVault } | EncryptedVault>;

const module_exports = recovery_key_module as unknown as Record<
  string,
  unknown
>;

const open_for_recovery: OpenBackup =
  Object.keys(module_exports).includes("open_recovery_backup")
    ? (module_exports.open_recovery_backup as OpenBackup)
    : (backup, key) => recovery_key_module.decrypt_vault_backup(backup, key);

const CODES = ["ASTER-AAAA-BBBB-CCCC-DDDD"];

function vault_with_identity(identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: CODES,
  } as unknown as EncryptedVault;
}

function identity_of(opened: { vault: EncryptedVault } | EncryptedVault) {
  return "vault" in opened ? opened.vault.identity_key : opened.identity_key;
}

async function seal_v1_backup(
  vault: EncryptedVault,
  recovery_key: Uint8Array,
): Promise<{ encrypted_data: string; nonce: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const hkdf = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v1"),
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(vault)),
  );
  const to_b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

  return {
    encrypted_data: to_b64(new Uint8Array(sealed)),
    nonce: to_b64(nonce),
    salt: to_b64(salt),
  };
}

describe("recovery backup generation", () => {
  beforeEach(() => {
    saved_backups.length = 0;
    issued_keys.length = 0;
    localStorage.clear();
  });

  it("refuses an older backup the server hands back after a newer one was saved", async () => {
    await expect(
      refresh_recovery_backup(vault_with_identity("identity-a"), "pass"),
    ).resolves.toBe(true);
    await expect(
      refresh_recovery_backup(vault_with_identity("identity-b"), "pass"),
    ).resolves.toBe(true);

    expect(saved_backups).toHaveLength(2);

    const newest = await open_for_recovery(
      saved_backups[1],
      issued_keys[1],
      "user-1",
    );

    expect(identity_of(newest)).toBe("identity-b");

    await expect(
      open_for_recovery(saved_backups[0], issued_keys[0], "user-1"),
    ).rejects.toThrow();
  });

  it("still opens a backup written before generations existed", async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const legacy = await seal_v1_backup(vault_with_identity("legacy"), key);
    const opened = await recovery_key_module.open_recovery_backup(
      legacy,
      key,
      "user-1",
    );

    expect(opened.vault.identity_key).toBe("legacy");
    expect(opened.generation).toBe(0);
    expect(opened.user_id).toBe("user-1");
    await expect(
      recovery_key_module.decrypt_vault_backup(legacy, key),
    ).resolves.toMatchObject({ identity_key: "legacy" });
  });

  it("applies the floor to a legacy backup once the user has a newer one", async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const legacy = await seal_v1_backup(vault_with_identity("legacy"), key);

    await refresh_recovery_backup(vault_with_identity("fresh"), "pass");

    await expect(
      recovery_key_module.open_recovery_backup(legacy, key, "user-1"),
    ).rejects.toThrow(/older than one this device has seen/);
    await expect(
      recovery_key_module.open_recovery_backup(legacy, key, null),
    ).resolves.toMatchObject({ generation: 0 });
  });

  it("binds the user and generation into the sealed backup", async () => {
    await refresh_recovery_backup(vault_with_identity("bound"), "pass");

    const [backup] = saved_backups;
    const [key] = issued_keys;
    const opened = await recovery_key_module.read_vault_backup(backup, key);

    expect(opened.user_id).toBe("user-1");
    expect(opened.generation).toBeGreaterThan(0);
    expect(opened.vault).not.toHaveProperty("backup_generation");
    expect(opened.vault).not.toHaveProperty("backup_user_id");

    const bytes = Uint8Array.from(atob(backup.encrypted_data), (char) =>
      char.charCodeAt(0),
    );

    bytes[11] ^= 0x01;

    const tampered = {
      ...backup,
      encrypted_data: btoa(String.fromCharCode(...bytes)),
    };

    await expect(
      recovery_key_module.read_vault_backup(tampered, key),
    ).rejects.toThrow();
    await expect(
      recovery_key_module.open_recovery_backup(backup, key, "user-2"),
    ).rejects.toThrow(/older than one this device has seen/);
  });

  it("keeps opening older backups for archived key restore", async () => {
    await refresh_recovery_backup(vault_with_identity("first"), "pass");
    await refresh_recovery_backup(vault_with_identity("second"), "pass");

    await expect(
      recovery_key_module.decrypt_vault_backup(saved_backups[0], issued_keys[0]),
    ).resolves.toMatchObject({ identity_key: "first" });
  });
});
