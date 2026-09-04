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
  key: new Uint8Array(32).fill(7) as Uint8Array | null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => (h.key ? new Uint8Array(h.key) : null),
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

import {
  check_and_pin_identity,
  get_pinned_identity_fingerprint,
  reset_identity_pin,
} from "@/services/crypto/ratchet_identity_pin";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");

describe("ratchet identity pin", () => {
  beforeEach(() => {
    h.store.clear();
    h.key = new Uint8Array(32).fill(7);
  });

  it("pins on first contact and matches on the same key", async () => {
    expect(await check_and_pin_identity("alice", KEY_A)).toBe("first");
    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
  });

  it("reports drift for an unverified rotation of an unverified pin", async () => {
    await check_and_pin_identity("alice", KEY_A);

    expect(await check_and_pin_identity("alice", KEY_B)).toBe("drift");
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("drift");
    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
  });

  it("never adopts an unverified rotation into the stored pin", async () => {
    await check_and_pin_identity("alice", KEY_A);

    const pinned = await get_pinned_identity_fingerprint("alice");

    await check_and_pin_identity("alice", KEY_B);

    expect(await get_pinned_identity_fingerprint("alice")).toBe(pinned);
  });

  it("accepts a verified rotation of a verified pin and re-pins", async () => {
    await check_and_pin_identity("alice", KEY_A, true);

    expect(await check_and_pin_identity("alice", KEY_B, true)).toBe("rotated");
    expect(await check_and_pin_identity("alice", KEY_B, true)).toBe("ok");
  });

  it("accepts a verified rotation of an unverified pin", async () => {
    await check_and_pin_identity("alice", KEY_A);

    expect(await check_and_pin_identity("alice", KEY_B, true)).toBe("rotated");
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("ok");
  });

  it("reports drift when a verified pin is replaced by an unverified key", async () => {
    await check_and_pin_identity("alice", KEY_A, true);

    expect(await check_and_pin_identity("alice", KEY_B)).toBe("drift");
  });

  it("keeps the verified pin after a downgrade drift (does not adopt the new key)", async () => {
    await check_and_pin_identity("alice", KEY_A, true);
    await check_and_pin_identity("alice", KEY_B);

    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("drift");
  });

  it("isolates pins per recipient", async () => {
    expect(await check_and_pin_identity("alice", KEY_A)).toBe("first");
    expect(await check_and_pin_identity("bob", KEY_B)).toBe("first");
    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
    expect(await check_and_pin_identity("bob", KEY_B)).toBe("ok");
  });

  it("exposes and resets the pinned fingerprint", async () => {
    await check_and_pin_identity("alice", KEY_A);

    expect(await get_pinned_identity_fingerprint("alice")).not.toBeNull();

    await reset_identity_pin("alice");

    expect(await get_pinned_identity_fingerprint("alice")).toBeNull();
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("first");
  });

  it("fails open (never blocks a send) when key material is unavailable", async () => {
    h.key = null;

    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("ok");
  });
});
