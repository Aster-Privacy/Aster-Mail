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
import { describe, it, expect, vi, beforeEach } from "vitest";

const key_holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock("./session_key_db", () => ({
  get_or_create_session_key: async () => key_holder.key,
  clear_session_key: async () => {},
  get_session_key_from_db: async () => key_holder.key,
  get_session_encryption_key: () => key_holder.key,
  set_session_encryption_key: () => {},
  RequiresReauthError: class extends Error {},
}));

vi.mock("@/services/session_timeout_service", () => ({
  check_session_expired: () => false,
  clear_session_timeout_data: () => {},
}));

import {
  store_session_passphrase,
  get_session_passphrase,
  has_stored_session_passphrase,
  clear_session_passphrase,
  clear_all_session_passphrases,
} from "./session_passphrase";

const ACCOUNT = "acct-1";
const KEY_NAME = "astermail_session_passphrase_acct-1";
const IV_NAME = "astermail_session_passphrase_iv_acct-1";

describe("session passphrase storage", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    key_holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  });

  it("keeps the passphrase on the device when Keep me signed in is on", async () => {
    await store_session_passphrase(ACCOUNT, "hunter2-long-pass");

    expect(localStorage.getItem(KEY_NAME)).not.toBeNull();
    expect(localStorage.getItem(IV_NAME)).not.toBeNull();
    expect(sessionStorage.getItem(KEY_NAME)).toBeNull();
    expect(await get_session_passphrase(ACCOUNT)).toBe("hunter2-long-pass");
  });

  it("keeps the passphrase only for the tab when Keep me signed in is off", async () => {
    await store_session_passphrase(ACCOUNT, "hunter2-long-pass", false);

    expect(localStorage.getItem(KEY_NAME)).toBeNull();
    expect(localStorage.getItem(IV_NAME)).toBeNull();
    expect(sessionStorage.getItem(KEY_NAME)).not.toBeNull();
    expect(has_stored_session_passphrase(ACCOUNT)).toBe(true);
    expect(await get_session_passphrase(ACCOUNT)).toBe("hunter2-long-pass");
  });

  it("is gone once the tab storage is cleared", async () => {
    await store_session_passphrase(ACCOUNT, "hunter2-long-pass", false);
    sessionStorage.clear();

    expect(has_stored_session_passphrase(ACCOUNT)).toBe(false);
    expect(await get_session_passphrase(ACCOUNT)).toBeNull();
  });

  it("removes a device copy when the user signs in again without Keep me signed in", async () => {
    await store_session_passphrase(ACCOUNT, "old-device-pass");
    await store_session_passphrase(ACCOUNT, "new-tab-pass", false);

    expect(localStorage.getItem(KEY_NAME)).toBeNull();
    expect(await get_session_passphrase(ACCOUNT)).toBe("new-tab-pass");
  });

  it("clears both copies on sign-out", async () => {
    await store_session_passphrase(ACCOUNT, "pass-a", false);
    await store_session_passphrase("acct-2", "pass-b");

    await clear_session_passphrase(ACCOUNT);
    expect(sessionStorage.getItem(KEY_NAME)).toBeNull();

    await store_session_passphrase(ACCOUNT, "pass-a", false);
    await clear_all_session_passphrases();
    expect(sessionStorage.length).toBe(0);
    expect(
      localStorage.getItem("astermail_session_passphrase_acct-2"),
    ).toBeNull();
  });
});
