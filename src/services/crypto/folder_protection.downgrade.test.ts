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
import { describe, it, expect, beforeEach } from "vitest";

import {
  derive_password_keys,
  folder_salt_is_current,
  FolderKdfDowngradeError,
  prepare_change_password,
  prepare_set_password,
  array_to_base64,
  base64_to_array,
} from "@/services/crypto/folder_protection";
import {
  is_folder_kdf_pinned,
  pin_folder_kdf,
} from "@/services/crypto/folder_kdf_pin";

const LEGACY_SALT = "AAECAwQFBgcICQoLDA0ODw==";
const CURRENT_SALT = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

describe("locked folder password derivation", () => {
  it("refuses a legacy salt unless the caller allows it", async () => {
    await expect(
      derive_password_keys("hunter2", base64_to_array(LEGACY_SALT)),
    ).rejects.toBeInstanceOf(FolderKdfDowngradeError);
  });

  it("keeps the legacy vector when the caller allows it", async () => {
    const { auth_key } = await derive_password_keys(
      "hunter2",
      base64_to_array(LEGACY_SALT),
      true,
    );

    expect(array_to_base64(auth_key)).toBe(
      "geWlAsIItcYaDIqooSZKoFWSE+Ce2f8DzMva7yDKOnc=",
    );
  });

  it("matches the Android vector for the current format", async () => {
    const { auth_key } = await derive_password_keys(
      "pässwörd 日本",
      base64_to_array(CURRENT_SALT),
    );

    expect(array_to_base64(auth_key)).toBe(
      "qNl6TyjxX2IuEow3hNujGiQRO1OvkOm49XrdSz4O03A=",
    );
  });

  it("refuses salts of any other length", async () => {
    for (const length of [0, 1, 8, 15, 17, 31, 33, 64]) {
      const salt = new Uint8Array(length);

      expect(() => folder_salt_is_current(salt)).toThrow();
      await expect(
        derive_password_keys("hunter2", salt, true),
      ).rejects.toThrow();
    }
  });

  it("creates and changes passwords only in the current format", async () => {
    const { data, folder_key } = await prepare_set_password("hunter2");

    expect(base64_to_array(data.password_salt)).toHaveLength(32);

    const change = await prepare_change_password(
      "hunter2",
      "hunter3",
      LEGACY_SALT,
      folder_key,
    );

    expect(base64_to_array(change.new_password_salt)).toHaveLength(32);
    expect(change.old_password_hash).toBe(
      "geWlAsIItcYaDIqooSZKoFWSE+Ce2f8DzMva7yDKOnc=",
    );
  });
});

describe("locked folder format pin", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is off until the device has seen the current format", () => {
    expect(is_folder_kdf_pinned("folder-a")).toBe(false);
    pin_folder_kdf("folder-a");
    expect(is_folder_kdf_pinned("folder-a")).toBe(true);
    expect(is_folder_kdf_pinned("folder-b")).toBe(false);
  });

  it("makes a pinned folder refuse a legacy salt from the server", async () => {
    pin_folder_kdf("folder-a");

    await expect(
      derive_password_keys(
        "hunter2",
        base64_to_array(LEGACY_SALT),
        !is_folder_kdf_pinned("folder-a"),
      ),
    ).rejects.toBeInstanceOf(FolderKdfDowngradeError);
  });
});
