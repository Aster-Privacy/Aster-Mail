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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as EncryptedVault | null,
  writes: [] as EncryptedVault[],
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
}));

vi.mock("@/services/crypto/vault_cas_write", () => ({
  write_vault_merged: vi.fn(async ({ next }: { next: EncryptedVault }) => {
    h.writes.push(next);
    h.vault = next;

    return { status: "written", vault: next };
  }),
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

import {
  folder_key_belongs_elsewhere,
  folder_key_digest,
  folder_requires_current_kdf,
  remember_folder_pin,
  vault_folder_pin,
} from "@/services/crypto/folder_kdf_pin";
import {
  array_to_base64,
  base64_to_array,
  decrypt_folder_key,
  derive_password_keys,
  FolderKdfDowngradeError,
  prepare_set_password,
} from "@/services/crypto/folder_protection";

const LEGACY_SALT = "AAECAwQFBgcICQoLDA0ODw==";

function empty_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey-private",
    recovery_codes: [],
  };
}

async function unlock_with(
  folder_id: string,
  password: string,
  record: { password_salt: string; encrypted_folder_key: string; folder_key_nonce: string },
): Promise<Uint8Array> {
  const { encryption_key } = await derive_password_keys(
    password,
    base64_to_array(record.password_salt),
    !folder_requires_current_kdf(folder_id),
  );

  return decrypt_folder_key(
    base64_to_array(record.encrypted_folder_key),
    base64_to_array(record.folder_key_nonce),
    encryption_key,
  );
}

describe("folder pins kept in the vault", () => {
  beforeEach(() => {
    localStorage.clear();
    h.vault = empty_vault();
    h.writes = [];
  });

  it("refuses a legacy salt on a new device once the vault pins the folder", async () => {
    const { folder_key } = await prepare_set_password("hunter2", "folder-a");

    await remember_folder_pin("folder-a", folder_key, true);
    localStorage.clear();

    expect(folder_requires_current_kdf("folder-a")).toBe(true);
    await expect(
      derive_password_keys(
        "hunter2",
        base64_to_array(LEGACY_SALT),
        !folder_requires_current_kdf("folder-a"),
      ),
    ).rejects.toBeInstanceOf(FolderKdfDowngradeError);
  });

  it("still opens folders that were never moved to the current format", async () => {
    const { folder_key } = await prepare_set_password("hunter2", "folder-old");

    await remember_folder_pin("folder-old", folder_key, false);

    expect(folder_requires_current_kdf("folder-old")).toBe(false);
    await expect(
      derive_password_keys(
        "hunter2",
        base64_to_array(LEGACY_SALT),
        !folder_requires_current_kdf("folder-old"),
      ),
    ).resolves.toBeTruthy();
  });

  it("keeps the current pin when an older format is served later", async () => {
    const { folder_key } = await prepare_set_password("hunter2", "folder-a");

    await remember_folder_pin("folder-a", folder_key, true);
    await remember_folder_pin("folder-a", folder_key, false);

    expect(vault_folder_pin("folder-a")?.current).toBe(true);
    expect(h.writes).toHaveLength(1);
  });

  it("stores a digest of the folder key, never the key", async () => {
    const { folder_key } = await prepare_set_password("hunter2", "folder-a");

    await remember_folder_pin("folder-a", folder_key, true);

    const stored = JSON.stringify(h.vault?.folder_pins);

    expect(stored).not.toContain(array_to_base64(folder_key));
    expect(vault_folder_pin("folder-a")?.key).toBe(
      await folder_key_digest(folder_key),
    );
  });

  it("refuses another folder's key that the server served for this folder", async () => {
    const a = await prepare_set_password("same password", "folder-a");
    const b = await prepare_set_password("same password", "folder-b");

    await remember_folder_pin("folder-a", a.folder_key, true);
    await remember_folder_pin("folder-b", b.folder_key, true);
    localStorage.clear();

    const opened = await unlock_with("folder-b", "same password", a.data);

    expect(array_to_base64(opened)).toBe(array_to_base64(a.folder_key));
    expect(await folder_key_belongs_elsewhere("folder-b", opened)).toBe(true);
    expect(await folder_key_belongs_elsewhere("folder-a", opened)).toBe(false);
  });

  it("accepts a folder whose key was replaced on another device", async () => {
    const first = await prepare_set_password("hunter2", "folder-a");
    const second = await prepare_set_password("hunter2", "folder-a");

    await remember_folder_pin("folder-a", first.folder_key, true);

    expect(
      await folder_key_belongs_elsewhere("folder-a", second.folder_key),
    ).toBe(false);
    await remember_folder_pin("folder-a", second.folder_key, true);
    expect(vault_folder_pin("folder-a")?.key).toBe(
      await folder_key_digest(second.folder_key),
    );
  });

  it("does nothing when no vault is open", async () => {
    h.vault = null;

    const { folder_key } = await prepare_set_password("hunter2", "folder-a");

    expect(await remember_folder_pin("folder-a", folder_key, true)).toBe(false);
    expect(folder_requires_current_kdf("folder-a")).toBe(false);
    expect(await folder_key_belongs_elsewhere("folder-a", folder_key)).toBe(
      false,
    );
  });
});
