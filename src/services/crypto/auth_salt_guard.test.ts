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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
    localStorage.setItem(key, "wrapped");
  }),
  device_retrieve: vi.fn(async (key: string) => h.store.get(key) ?? null),
}));

import {
  AuthSaltCollisionError,
  assert_vault_salt_not_auth_salt,
  clear_auth_salt_session_state,
  collides_with_remembered_salts,
  collides_with_vault_salt,
  constant_time_equals,
  is_auth_salt_collision,
  remember_salt_entry,
  require_usable_auth_salt,
  vault_salt_prefix,
} from "@/services/crypto/auth_salt_guard";
import { array_to_base64 } from "@/services/crypto/base64";

function bytes(fill: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

function vault_with_salt(salt: Uint8Array): Uint8Array {
  const combined = new Uint8Array(salt.length + 40);

  combined.set(salt, 0);
  combined.fill(0xaa, salt.length);

  return combined;
}

describe("auth salt guard pure helpers", () => {
  it("compares byte arrays for equality", () => {
    expect(constant_time_equals(bytes(1, 16), bytes(1, 16))).toBe(true);
    expect(constant_time_equals(bytes(1, 16), bytes(2, 16))).toBe(false);
    expect(constant_time_equals(bytes(1, 16), bytes(1, 32))).toBe(false);
  });

  it("extracts the 16 byte vault salt prefix only from a real vault blob", () => {
    expect(vault_salt_prefix(null)).toBeNull();
    expect(vault_salt_prefix(bytes(1, 16))).toBeNull();
    expect(vault_salt_prefix(bytes(1, 10))).toBeNull();

    const prefix = vault_salt_prefix(vault_with_salt(bytes(5, 16)));

    expect(prefix).not.toBeNull();
    expect(Array.from(prefix ?? [])).toEqual(Array.from(bytes(5, 16)));
  });

  it("detects a server salt that equals the vault salt", () => {
    const vault = vault_with_salt(bytes(9, 16));

    expect(collides_with_vault_salt(bytes(9, 16), vault)).toBe(true);
    expect(collides_with_vault_salt(bytes(8, 16), vault)).toBe(false);
    expect(collides_with_vault_salt(bytes(9, 32), vault)).toBe(false);
    expect(collides_with_vault_salt(bytes(9, 16), null)).toBe(false);
  });

  it("checks remembered salts and skips malformed entries", () => {
    const remembered = ["not base64!!", array_to_base64(bytes(3, 16))];

    expect(collides_with_remembered_salts(bytes(3, 16), remembered)).toBe(true);
    expect(collides_with_remembered_salts(bytes(4, 16), remembered)).toBe(
      false,
    );
    expect(collides_with_remembered_salts(bytes(3, 16), [])).toBe(false);
  });

  it("remembers salts without duplicates and within the limit", () => {
    let list: string[] = [];

    list = remember_salt_entry(list, bytes(1, 16), 2);
    list = remember_salt_entry(list, bytes(1, 16), 2);
    expect(list).toHaveLength(1);

    list = remember_salt_entry(list, bytes(2, 16), 2);
    list = remember_salt_entry(list, bytes(3, 16), 2);
    expect(list).toEqual([
      array_to_base64(bytes(2, 16)),
      array_to_base64(bytes(3, 16)),
    ]);
  });

  it("recognizes the collision error and keeps decrypt out of its message", () => {
    const error = new AuthSaltCollisionError();

    expect(is_auth_salt_collision(error)).toBe(true);
    expect(is_auth_salt_collision(new Error("other"))).toBe(false);
    expect(error.message).not.toMatch(/decrypt/i);
    expect(error.translation_key).toBe("errors.auth_salt_collision");
  });
});

describe("auth salt guard flow", () => {
  beforeEach(() => {
    h.store.clear();
    localStorage.clear();
    clear_auth_salt_session_state();
  });

  it("allows any salt before a vault has been seen", async () => {
    await expect(
      require_usable_auth_salt(bytes(1, 16)),
    ).resolves.toBeUndefined();
    await expect(
      require_usable_auth_salt(bytes(1, 32)),
    ).resolves.toBeUndefined();
  });

  it("refuses to unlock a vault whose salt equals the auth salt used this session", async () => {
    await require_usable_auth_salt(bytes(7, 16));

    await expect(
      assert_vault_salt_not_auth_salt(vault_with_salt(bytes(7, 16))),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
    await expect(
      assert_vault_salt_not_auth_salt(vault_with_salt(bytes(8, 16))),
    ).resolves.toBeUndefined();
  });

  it("refuses a server salt that matches a remembered vault salt", async () => {
    await assert_vault_salt_not_auth_salt(vault_with_salt(bytes(4, 16)));
    await vi.waitFor(() => {
      expect(localStorage.getItem("aster:auth_salt_guard:vault_salts")).toBe(
        "wrapped",
      );
    });
    clear_auth_salt_session_state();

    await expect(
      require_usable_auth_salt(bytes(4, 16)),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
    await expect(
      require_usable_auth_salt(bytes(4, 32)),
    ).resolves.toBeUndefined();
    await expect(
      require_usable_auth_salt(bytes(5, 16)),
    ).resolves.toBeUndefined();
  });

  it("ignores blobs that are too short to carry a vault salt", async () => {
    await require_usable_auth_salt(bytes(7, 16));

    await expect(
      assert_vault_salt_not_auth_salt(bytes(7, 16)),
    ).resolves.toBeUndefined();
  });
});
