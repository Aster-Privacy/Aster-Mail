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
  has_peer_advertised_pq,
} from "@/services/crypto/ratchet_identity_pin";
import {
  clear_ratchet_verification_status,
  get_peer_identity_event,
} from "@/services/crypto/ratchet_verification_status";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");

describe("ratchet identity pin pq memory and failure modes", () => {
  beforeEach(() => {
    h.store.clear();
    h.key = new Uint8Array(32).fill(7);
    clear_ratchet_verification_status();
  });

  it("remembers that a peer advertised a post-quantum key", async () => {
    expect(await has_peer_advertised_pq("alice")).toBe(false);

    await check_and_pin_identity("alice", KEY_A, false, false);
    expect(await has_peer_advertised_pq("alice")).toBe(false);

    await check_and_pin_identity("alice", KEY_A, false, true);
    expect(await has_peer_advertised_pq("alice")).toBe(true);

    await check_and_pin_identity("alice", KEY_A, false, false);
    expect(await has_peer_advertised_pq("alice")).toBe(true);
  });

  it("persists the pq flag in the account scoped pin", async () => {
    await check_and_pin_identity("bob", KEY_A, true, true);

    const stored = h.store.get("ratchet_identity_pin_acct-1_bob") as {
      pq_seen?: boolean;
      verified: boolean;
    };

    expect(stored.pq_seen).toBe(true);
    expect(stored.verified).toBe(true);
  });

  it("keeps the pq flag across a verified rotation and records the event", async () => {
    await check_and_pin_identity("carol", KEY_A, true, true);

    expect(await check_and_pin_identity("carol", KEY_B, true, false)).toBe(
      "rotated",
    );
    expect(await has_peer_advertised_pq("carol")).toBe(true);
    expect(get_peer_identity_event("carol")?.event).toBe("rotated");
  });

  it("returns unknown instead of ok when the pin store is unavailable", async () => {
    h.key = null;

    expect(await check_and_pin_identity("dave", KEY_A)).toBe("unknown");
    expect(await has_peer_advertised_pq("dave")).toBe(false);
  });
});
