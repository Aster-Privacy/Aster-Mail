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
  acknowledge_identity_change,
  check_and_pin_identity,
  get_identity_change,
  get_pinned_identity_fingerprint,
  reset_identity_pin,
} from "@/services/crypto/ratchet_identity_pin";
import {
  clear_ratchet_verification_status,
  get_peer_identity_event,
} from "@/services/crypto/ratchet_verification_status";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");

describe("ratchet identity pin", () => {
  beforeEach(() => {
    h.store.clear();
    h.key = new Uint8Array(32).fill(7);
    clear_ratchet_verification_status();
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

  it("reports unknown instead of ok when key material is unavailable", async () => {
    h.key = null;

    expect(await check_and_pin_identity("alice", KEY_A)).toBe("unknown");
    expect(await check_and_pin_identity("alice", KEY_B)).toBe("unknown");
  });

  it("records a lasting key change when a verified rotation re-pins", async () => {
    await check_and_pin_identity("alice", KEY_A, true);

    const previous = await get_pinned_identity_fingerprint("alice");

    expect(await get_identity_change("alice")).toBeNull();
    expect(await check_and_pin_identity("alice", KEY_B, true)).toBe("rotated");

    const change = await get_identity_change("alice");

    expect(change?.previous_fingerprint).toBe(previous);
    expect(change?.fingerprint).toBe(
      await get_pinned_identity_fingerprint("alice"),
    );
    expect(h.store.has("ratchet_identity_change_acct-1_alice")).toBe(true);
    expect(get_peer_identity_event("alice")?.event).toBe("rotated");

    expect(await check_and_pin_identity("alice", KEY_B, true)).toBe("ok");
    expect(await get_identity_change("alice")).not.toBeNull();
  });

  it("clears the key change once the sender acknowledges it", async () => {
    await check_and_pin_identity("alice", KEY_A, true);
    await check_and_pin_identity("alice", KEY_B, true);

    await acknowledge_identity_change("alice");

    expect(await get_identity_change("alice")).toBeNull();
    expect(get_peer_identity_event("alice")).toBeNull();
    expect(await get_pinned_identity_fingerprint("alice")).not.toBeNull();
  });

  it("does not record a change for drift or first contact", async () => {
    await check_and_pin_identity("alice", KEY_A);
    await check_and_pin_identity("alice", KEY_B);

    expect(await get_identity_change("alice")).toBeNull();
  });

  it("moves a legacy unscoped pin into the account and removes the old entry", async () => {
    await check_and_pin_identity("alice", KEY_A);

    const scoped = h.store.get("ratchet_identity_pin_acct-1_alice");

    h.store.delete("ratchet_identity_pin_acct-1_alice");
    h.store.set("ratchet_identity_pin_alice", scoped);

    expect(await check_and_pin_identity("alice", KEY_A)).toBe("ok");
    expect(h.store.has("ratchet_identity_pin_acct-1_alice")).toBe(true);
    expect(h.store.has("ratchet_identity_pin_alice")).toBe(false);
  });

  it("imports the pin storage key as non-extractable", async () => {
    const import_spy = vi.spyOn(crypto.subtle, "importKey");

    await check_and_pin_identity("alice", KEY_A);

    const call = import_spy.mock.calls.find((args) => args[0] === "raw");

    expect(call?.[3]).toBe(false);
    import_spy.mockRestore();
  });
});
