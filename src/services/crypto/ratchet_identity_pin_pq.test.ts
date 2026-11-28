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

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
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
  note_account_bound_opening,
  read_peer_downgrade_floor,
  remembered_peer_x3dh_version,
} from "@/services/crypto/ratchet_identity_pin";
import {
  clear_ratchet_verification_status,
  get_peer_identity_event,
} from "@/services/crypto/ratchet_verification_status";
import {
  canonical_storage_name,
  reset_storage_name_state,
} from "@/services/crypto/storage_key_names";
import { reset_contact_entry_state } from "@/services/crypto/contact_entries";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");

function pin_name(prefix: string, peer: string): Promise<string> {
  return canonical_storage_name(prefix, "acct-1", peer);
}

describe("ratchet identity pin pq memory and failure modes", () => {
  beforeEach(() => {
    h.store.clear();
    reset_storage_name_state();
    reset_contact_entry_state();
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

    const stored = h.store.get(
      await pin_name("ratchet_identity_pin_", "bob"),
    ) as {
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

  it("remembers the highest handshake version a peer advertised", async () => {
    expect(await remembered_peer_x3dh_version("erin")).toBe(1);

    await check_and_pin_identity("erin", KEY_A, false, false, false, 2);
    expect(await remembered_peer_x3dh_version("erin")).toBe(2);

    await check_and_pin_identity("erin", KEY_A, false, false, false, 1);
    expect(await remembered_peer_x3dh_version("erin")).toBe(2);

    await check_and_pin_identity("erin", KEY_A, false, false, false, null);
    expect(await remembered_peer_x3dh_version("erin")).toBe(2);

    await check_and_pin_identity("erin", KEY_A, false, false, false, 3);
    expect(await remembered_peer_x3dh_version("erin")).toBe(3);
  });

  it("keeps the remembered handshake version across a verified rotation", async () => {
    await check_and_pin_identity("frank", KEY_A, true, false, false, 2);

    expect(await check_and_pin_identity("frank", KEY_B, true, false, false, 1)).toBe(
      "rotated",
    );
    expect(await remembered_peer_x3dh_version("frank")).toBe(2);
  });

  it("reports no remembered handshake version when the pin store is unavailable", async () => {
    await check_and_pin_identity("grace", KEY_A, false, false, false, 2);
    h.key = null;

    expect(await remembered_peer_x3dh_version("grace")).toBe(1);
  });

  it("returns unknown instead of ok when the pin store is unavailable", async () => {
    h.key = null;

    expect(await check_and_pin_identity("dave", KEY_A)).toBe("unknown");
    expect(await has_peer_advertised_pq("dave")).toBe(false);
  });

  it("reads the downgrade floor a peer has shown", async () => {
    expect(await read_peer_downgrade_floor("henry")).toEqual({
      x3dh_version: 1,
      bound_at: {},
      pq_seen: false,
      pq_signed_seen: false,
    });

    await check_and_pin_identity("henry", KEY_A, true, true, false, 2, true);

    expect(await read_peer_downgrade_floor("henry")).toEqual({
      x3dh_version: 2,
      bound_at: {},
      pq_seen: true,
      pq_signed_seen: true,
    });
  });

  it("records the earliest account-bound opening per receiving address", async () => {
    await check_and_pin_identity("kate", KEY_A, true, false, false, 4);

    expect(await note_account_bound_opening("kate", "me@x", KEY_A, 2000)).toBe(
      true,
    );
    expect(await note_account_bound_opening("kate", "me@x", KEY_A, 3000)).toBe(
      false,
    );
    expect(await note_account_bound_opening("kate", "me@x", KEY_A, 1000)).toBe(
      true,
    );
    expect(
      await note_account_bound_opening("kate", "alias@x", KEY_A, 5000),
    ).toBe(true);

    const floor = await read_peer_downgrade_floor("kate");

    expect(floor).not.toBe("unreadable");
    if (floor === "unreadable") return;
    expect(floor.bound_at).toEqual({ "me@x": 1000, "alias@x": 5000 });
    expect(floor.x3dh_version).toBe(4);
    expect(await remembered_peer_x3dh_version("kate")).toBe(4);
  });

  it("ignores an opening without a valid time or address", async () => {
    await check_and_pin_identity("liam", KEY_A, true, false, false, 4);

    expect(
      await note_account_bound_opening("liam", "me@x", KEY_A, undefined),
    ).toBe(false);
    expect(await note_account_bound_opening("liam", "me@x", KEY_A, 0)).toBe(
      false,
    );
    expect(await note_account_bound_opening("liam", "me@x", KEY_A, NaN)).toBe(
      false,
    );
    expect(await note_account_bound_opening("liam", " ", KEY_A, 1000)).toBe(
      false,
    );

    const floor = await read_peer_downgrade_floor("liam");

    expect(floor !== "unreadable" && floor.bound_at).toEqual({});
  });

  it("ignores an opening for a different identity key", async () => {
    await check_and_pin_identity("mona", KEY_A, true, false, false, 4);

    expect(await note_account_bound_opening("mona", "me@x", KEY_B, 1000)).toBe(
      false,
    );

    const floor = await read_peer_downgrade_floor("mona");

    expect(floor !== "unreadable" && floor.bound_at).toEqual({});
  });

  it("does not create a pin from an opening", async () => {
    expect(await note_account_bound_opening("nora", "me@x", KEY_A, 1000)).toBe(
      false,
    );

    expect(await read_peer_downgrade_floor("nora")).toEqual({
      x3dh_version: 1,
      bound_at: {},
      pq_seen: false,
      pq_signed_seen: false,
    });
  });

  it("keeps the floor when the pin is checked again with the same key", async () => {
    await check_and_pin_identity("owen", KEY_A, true, false, false, 4);
    await note_account_bound_opening("owen", "me@x", KEY_A, 1000);
    await check_and_pin_identity("owen", KEY_A, true, false, false, 4);

    const floor = await read_peer_downgrade_floor("owen");

    expect(floor !== "unreadable" && floor.bound_at).toEqual({ "me@x": 1000 });
    expect(floor !== "unreadable" && floor.x3dh_version).toBe(4);
  });

  it("keeps the floor across a verified rotation", async () => {
    await check_and_pin_identity("pia", KEY_A, true, false, false, 4);
    await note_account_bound_opening("pia", "me@x", KEY_A, 1000);

    expect(await check_and_pin_identity("pia", KEY_B, true, false, false, 4)).toBe(
      "rotated",
    );

    const floor = await read_peer_downgrade_floor("pia");

    expect(floor !== "unreadable" && floor.bound_at).toEqual({ "me@x": 1000 });
  });

  it("makes room for a new address by dropping the latest floor", async () => {
    await check_and_pin_identity("quinn", KEY_A, true, false, false, 4);

    for (let i = 1; i <= 64; i++) {
      expect(
        await note_account_bound_opening("quinn", `a${i}@x`, KEY_A, i * 10),
      ).toBe(true);
    }

    expect(await note_account_bound_opening("quinn", "new@x", KEY_A, 5)).toBe(
      true,
    );

    const floor = await read_peer_downgrade_floor("quinn");

    expect(floor).not.toBe("unreadable");
    if (floor === "unreadable") return;
    expect(Object.keys(floor.bound_at)).toHaveLength(64);
    expect(floor.bound_at["new@x"]).toBe(5);
    expect(floor.bound_at["a64@x"]).toBeUndefined();
    expect(floor.bound_at["a1@x"]).toBe(10);
  });

  it("reports the downgrade floor as unreadable when the pin store is unavailable", async () => {
    await check_and_pin_identity("iris", KEY_A, true, true, false, 2, true);
    h.key = null;

    expect(await read_peer_downgrade_floor("iris")).toBe("unreadable");
  });

  it("reports the downgrade floor as unreadable without a peer", async () => {
    expect(await read_peer_downgrade_floor("")).toBe("unreadable");
  });

  it("reports the downgrade floor as unreadable when the stored pin cannot be read", async () => {
    await check_and_pin_identity("jack", KEY_A, true, true, false, 2, true);

    const { encrypted_get } = await import(
      "@/services/crypto/encrypted_storage"
    );

    vi.mocked(encrypted_get).mockRejectedValue(new Error("decrypt failed"));

    try {
      expect(await read_peer_downgrade_floor("jack")).toBe("unreadable");
    } finally {
      vi.mocked(encrypted_get).mockReset();
      vi.mocked(encrypted_get).mockImplementation(async (key: string) =>
        h.store.has(key)
          ? JSON.parse(JSON.stringify(h.store.get(key)))
          : null,
      );
    }
  });
});
