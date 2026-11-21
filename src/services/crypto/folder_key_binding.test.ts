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

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOLDER_KEY_VERSION,
  FolderKdfDowngradeError,
  base64_to_array,
  decrypt_folder_key,
  derive_password_keys,
  encrypt_folder_key,
  folder_pin_level_after_unlock,
  generate_folder_key,
  prepare_change_password,
  prepare_set_password,
  required_folder_key_format,
  folder_pin_level_for_write,
} from "./folder_protection";
import {
  folder_key_pin_level,
  merge_folder_key_pins,
  pin_folder_kdf,
  with_folder_key_pin,
} from "./folder_kdf_pin";
import * as folder_protection from "./folder_protection";
import { merge_vault_for_write } from "./vault_cas_write";

const FOLDER_A = "0B1C2D3E-4F50-4612-8734-56789ABCDEF0";
const FOLDER_B = "11111111-2222-4333-8444-555555555555";
const LEGACY_SALT = new Uint8Array(16).fill(1);
const LEGACY_SALT_BASE64 = "AQEBAQEBAQEBAQEBAQEBAQ==";
const CURRENT_SALT = new Uint8Array(32).fill(2);

function vault_with_pins(pins?: Record<string, number>): EncryptedVault {
  return {
    identity_key: "identity",
    previous_keys: [],
    signed_prekey: "prekey",
    signed_prekey_private: "prekey-private",
    recovery_codes: [],
    folder_key_pins: pins,
  } as unknown as EncryptedVault;
}

async function open_new_folder(password: string, folder_id: string) {
  const { data, folder_key } = await prepare_set_password(
    password,
    folder_id,
    true,
  );
  const salt = base64_to_array(data.password_salt);
  const { encryption_key } = await derive_password_keys(password, salt);

  return { data, folder_key, salt, encryption_key };
}

describe("folder key wrap bound to its folder", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates new folder passwords in the bound format", async () => {
    const { data, folder_key, salt, encryption_key } = await open_new_folder(
      "hunter2",
      FOLDER_A,
    );

    expect(data.folder_key_version).toBe(FOLDER_KEY_VERSION);
    expect(salt).toHaveLength(32);

    const format = required_folder_key_format(0, data.folder_key_version, salt);

    expect(format).toEqual({ allow_legacy_salt: false, bound: true });

    const opened = await decrypt_folder_key(
      base64_to_array(data.encrypted_folder_key),
      base64_to_array(data.folder_key_nonce),
      encryption_key,
      FOLDER_A.toLowerCase(),
    );

    expect(opened).toEqual(folder_key);
  });

  it("refuses a wrapped key moved from another folder", async () => {
    const { data, encryption_key } = await open_new_folder("hunter2", FOLDER_B);

    await expect(
      decrypt_folder_key(
        base64_to_array(data.encrypted_folder_key),
        base64_to_array(data.folder_key_nonce),
        encryption_key,
        FOLDER_A,
      ),
    ).rejects.toThrow();
  });

  it("does not open a bound wrap without its folder", async () => {
    const { data, encryption_key } = await open_new_folder("hunter2", FOLDER_A);

    await expect(
      decrypt_folder_key(
        base64_to_array(data.encrypted_folder_key),
        base64_to_array(data.folder_key_nonce),
        encryption_key,
      ),
    ).rejects.toThrow();
  });

  it("still opens folders written by older apps", async () => {
    const folder_key = generate_folder_key();
    const { encryption_key } = await derive_password_keys(
      "hunter2",
      LEGACY_SALT,
      true,
    );
    const { encrypted, nonce } = await encrypt_folder_key(
      folder_key,
      encryption_key,
    );
    const format = required_folder_key_format(0, undefined, LEGACY_SALT);

    expect(format).toEqual({ allow_legacy_salt: true, bound: false });
    expect(await decrypt_folder_key(encrypted, nonce, encryption_key)).toEqual(
      folder_key,
    );
    expect(folder_pin_level_after_unlock(format, LEGACY_SALT)).toBe(0);
  });

  it("changes a password into the bound format", async () => {
    const folder_key = generate_folder_key();
    const change = await prepare_change_password(
      "hunter2",
      "hunter3",
      LEGACY_SALT_BASE64,
      folder_key,
      FOLDER_A,
      0,
      true,
    );

    expect(change.new_folder_key_version).toBe(FOLDER_KEY_VERSION);

    const { encryption_key } = await derive_password_keys(
      "hunter3",
      base64_to_array(change.new_password_salt),
    );

    expect(
      await decrypt_folder_key(
        base64_to_array(change.new_encrypted_folder_key),
        base64_to_array(change.new_folder_key_nonce),
        encryption_key,
        FOLDER_A,
      ),
    ).toEqual(folder_key);
  });

  it("refuses the old salt on change once the folder is pinned", async () => {
    await expect(
      prepare_change_password(
        "hunter2",
        "hunter3",
        LEGACY_SALT_BASE64,
        generate_folder_key(),
        FOLDER_A,
        1,
      ),
    ).rejects.toBeInstanceOf(FolderKdfDowngradeError);
  });
});

describe("folder key format while other devices lack support", () => {
  it("creates new folder passwords in the format phones read", async () => {
    const { data, folder_key } = await prepare_set_password(
      "hunter2",
      FOLDER_A,
    );

    expect(data.folder_key_version).toBe(1);
    expect(base64_to_array(data.password_salt)).toHaveLength(32);

    const { encryption_key } = await derive_password_keys(
      "hunter2",
      base64_to_array(data.password_salt),
    );

    expect(
      await decrypt_folder_key(
        base64_to_array(data.encrypted_folder_key),
        base64_to_array(data.folder_key_nonce),
        encryption_key,
      ),
    ).toEqual(folder_key);
  });

  it("changes a password into the format phones read", async () => {
    const folder_key = generate_folder_key();
    const change = await prepare_change_password(
      "hunter2",
      "hunter3",
      LEGACY_SALT_BASE64,
      folder_key,
      FOLDER_A,
    );

    expect(change.new_folder_key_version).toBe(1);

    const { encryption_key } = await derive_password_keys(
      "hunter3",
      base64_to_array(change.new_password_salt),
    );

    expect(
      await decrypt_folder_key(
        base64_to_array(change.new_encrypted_folder_key),
        base64_to_array(change.new_folder_key_nonce),
        encryption_key,
      ),
    ).toEqual(folder_key);
  });

  it("keeps a folder pinned to the bound format whatever readiness says", () => {
    const check = required_folder_key_format as (
      ...args: unknown[]
    ) => unknown;

    for (const ready of [false, true, undefined]) {
      expect(() => check(2, 1, CURRENT_SALT, ready)).toThrow(
        FolderKdfDowngradeError,
      );
    }
  });

  it("keeps writing the bound format once a folder is pinned to it", () => {
    const writes_bound = (
      folder_protection as {
        folder_writes_bound?: (a: number, b: boolean) => boolean;
      }
    ).folder_writes_bound;

    expect(writes_bound?.(2, false)).toBe(true);
    expect(writes_bound?.(1, false)).toBe(false);
    expect(writes_bound?.(0, true)).toBe(true);
  });

  it("pins only the format it wrote", () => {
    expect(folder_pin_level_for_write(false)).toBe(1);
    expect(folder_pin_level_for_write(true)).toBe(FOLDER_KEY_VERSION);
  });
});

describe("server reported folder key format", () => {
  it("refuses an older format after the bound one was seen", () => {
    expect(() => required_folder_key_format(2, 1, CURRENT_SALT)).toThrow(
      FolderKdfDowngradeError,
    );
    expect(() =>
      required_folder_key_format(2, undefined, CURRENT_SALT),
    ).toThrow(FolderKdfDowngradeError);
  });

  it("refuses the short salt once the long one was seen", () => {
    expect(() => required_folder_key_format(1, 1, LEGACY_SALT)).toThrow(
      FolderKdfDowngradeError,
    );
    expect(() => required_folder_key_format(0, 2, LEGACY_SALT)).toThrow(
      FolderKdfDowngradeError,
    );
  });

  it("refuses versions it does not know", () => {
    expect(() => required_folder_key_format(0, 3, CURRENT_SALT)).toThrow();
    expect(() => required_folder_key_format(0, 0, CURRENT_SALT)).toThrow();
    expect(() => required_folder_key_format(0, "2", CURRENT_SALT)).toThrow();
  });

  it("raises the pin to the highest format it opened", () => {
    expect(
      folder_pin_level_after_unlock(
        required_folder_key_format(0, 1, CURRENT_SALT),
        CURRENT_SALT,
      ),
    ).toBe(1);
    expect(
      folder_pin_level_after_unlock(
        required_folder_key_format(1, 2, CURRENT_SALT),
        CURRENT_SALT,
      ),
    ).toBe(2);
  });
});

describe("folder key pins in the vault", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads the pin from the vault on a device that never saw the folder", () => {
    const vault = vault_with_pins({ [FOLDER_A.toLowerCase()]: 2 });

    expect(folder_key_pin_level(FOLDER_A, vault)).toBe(2);
    expect(folder_key_pin_level(FOLDER_B, vault)).toBe(0);
  });

  it("uses the higher of the device pin and the vault pin", () => {
    pin_folder_kdf(FOLDER_A);
    expect(folder_key_pin_level(FOLDER_A, vault_with_pins())).toBe(1);
    pin_folder_kdf(FOLDER_A, 2);
    expect(folder_key_pin_level(FOLDER_A, vault_with_pins())).toBe(2);
    pin_folder_kdf(FOLDER_A, 1);
    expect(folder_key_pin_level(FOLDER_A, null)).toBe(2);
  });

  it("ignores malformed pins", () => {
    const vault = vault_with_pins({
      [FOLDER_A.toLowerCase()]: 7,
      [FOLDER_B]: 1.5,
    });

    expect(folder_key_pin_level(FOLDER_A, vault)).toBe(0);
    expect(folder_key_pin_level(FOLDER_B, vault)).toBe(0);
    expect(merge_folder_key_pins({ a: "2" }, null, [1])).toBeUndefined();
  });

  it("only ever raises a pin", () => {
    expect(with_folder_key_pin({ a: 2 }, "A", 1)).toBeNull();
    expect(with_folder_key_pin({ a: 1 }, "A", 2)).toEqual({ a: 2 });
    expect(with_folder_key_pin(undefined, "A", 3)).toBeNull();
  });

  it("keeps the highest pin when another device writes the vault", () => {
    const server = vault_with_pins({ a: 2, b: 1 });
    const base = vault_with_pins({ a: 1 });
    const next = {
      ...vault_with_pins({ a: 1, c: 1 }),
      identity_key: "identity-2",
    };
    const merged = merge_vault_for_write(server, base, next, false);

    expect(merged.identity_key).toBe("identity-2");
    expect(merged.folder_key_pins).toEqual({ a: 2, b: 1, c: 1 });
  });

  it("is not removed by a writer that dropped the field", () => {
    const base = vault_with_pins({ a: 2 });
    const merged = merge_vault_for_write(
      base,
      base,
      { ...vault_with_pins(), identity_key: "identity-2" },
      false,
    );

    expect(merged.folder_key_pins).toEqual({ a: 2 });
  });
});

describe("folder pin storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("refuses to read a pin it cannot load instead of treating it as unpinned", () => {
    const get_item = vi
      .spyOn(localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    try {
      let level: number | undefined;
      let failed = false;

      try {
        level = folder_key_pin_level(FOLDER_A, vault_with_pins());
      } catch {
        failed = true;
      }

      expect(level).not.toBe(0);
      expect(failed).toBe(true);
    } finally {
      get_item.mockRestore();
    }
  });

  it("treats a damaged saved pin as the strictest level", () => {
    localStorage.setItem("aster:folder_kdf_v2:" + FOLDER_A, "garbage");

    expect(folder_key_pin_level(FOLDER_A, vault_with_pins())).toBe(
      FOLDER_KEY_VERSION,
    );
  });
});
