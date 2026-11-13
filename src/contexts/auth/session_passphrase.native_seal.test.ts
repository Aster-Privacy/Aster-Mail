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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const key_holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

const native = vi.hoisted(() => ({
  sealed: new Map<string, string>(),
  next_id: 0,
  seal_fails: false,
  open_returns_null: false,
  calls: [] as string[],
}));

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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, string>) => {
    native.calls.push(cmd);
    if (cmd === "device_seal_local_secret") {
      if (native.seal_fails) throw new Error("keychain unavailable");
      native.next_id += 1;
      const id = `sealed${native.next_id}`;

      native.sealed.set(id, args.valueB64);

      return id;
    }
    if (cmd === "device_open_local_secret") {
      if (native.open_returns_null) return null;
      const value = native.sealed.get(args.sealedB64);

      if (value === undefined) throw new Error("aead open: bad header");

      return value;
    }
    throw new Error(`unexpected command ${cmd}`);
  },
}));

import {
  store_session_passphrase,
  get_session_passphrase,
  has_stored_session_passphrase,
} from "./session_passphrase";

const ACCOUNT = "acct-native";
const KEY_NAME = "astermail_session_passphrase_acct-native";
const PASSPHRASE = "correct horse battery staple";

function enter_desktop(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function leave_desktop(): void {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

describe("session passphrase sealed by the desktop keychain", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    native.sealed.clear();
    native.next_id = 0;
    native.seal_fails = false;
    native.open_returns_null = false;
    native.calls = [];
    key_holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  });

  afterEach(() => {
    leave_desktop();
  });

  it("stores only a keychain-sealed value on the desktop", async () => {
    enter_desktop();
    await store_session_passphrase(ACCOUNT, PASSPHRASE);

    const stored = localStorage.getItem(KEY_NAME);

    expect(stored).not.toBeNull();
    expect(stored!.startsWith("n1:")).toBe(true);
    expect(native.calls).toContain("device_seal_local_secret");
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);
    expect(native.calls).toContain("device_open_local_secret");
  });

  it("seals a tab-only passphrase on the desktop too", async () => {
    enter_desktop();
    await store_session_passphrase(ACCOUNT, PASSPHRASE, false);

    expect(sessionStorage.getItem(KEY_NAME)!.startsWith("n1:")).toBe(true);
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);
  });

  it("reads an older unsealed value and rewrites it sealed", async () => {
    await store_session_passphrase(ACCOUNT, PASSPHRASE);
    const legacy = localStorage.getItem(KEY_NAME)!;

    expect(legacy.startsWith("n1:")).toBe(false);

    enter_desktop();
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);

    const upgraded = localStorage.getItem(KEY_NAME)!;

    expect(upgraded.startsWith("n1:")).toBe(true);
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);
  });

  it("returns nothing and keeps the value when the keychain cannot open it", async () => {
    enter_desktop();
    await store_session_passphrase(ACCOUNT, PASSPHRASE);
    const stored = localStorage.getItem(KEY_NAME);

    native.open_returns_null = true;

    expect(await get_session_passphrase(ACCOUNT)).toBeNull();
    expect(localStorage.getItem(KEY_NAME)).toBe(stored);
    expect(has_stored_session_passphrase(ACCOUNT)).toBe(true);
  });

  it("returns nothing for a sealed value whose seal was tampered with", async () => {
    enter_desktop();
    await store_session_passphrase(ACCOUNT, PASSPHRASE);
    localStorage.setItem(KEY_NAME, "n1:forged");

    expect(await get_session_passphrase(ACCOUNT)).toBeNull();
  });

  it("keeps working in the current format when the keychain cannot seal", async () => {
    enter_desktop();
    native.seal_fails = true;
    await store_session_passphrase(ACCOUNT, PASSPHRASE);

    expect(localStorage.getItem(KEY_NAME)!.startsWith("n1:")).toBe(false);
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);
  });

  it("never calls the keychain in a browser", async () => {
    await store_session_passphrase(ACCOUNT, PASSPHRASE);

    expect(localStorage.getItem(KEY_NAME)!.startsWith("n1:")).toBe(false);
    expect(await get_session_passphrase(ACCOUNT)).toBe(PASSPHRASE);
    expect(native.calls).toEqual([]);
  });

  it("does not open a sealed value in a browser", async () => {
    localStorage.setItem(KEY_NAME, "n1:sealed1");
    localStorage.setItem(
      "astermail_session_passphrase_iv_acct-native",
      btoa("123456789012"),
    );

    expect(await get_session_passphrase(ACCOUNT)).toBeNull();
    expect(native.calls).toEqual([]);
  });
});
