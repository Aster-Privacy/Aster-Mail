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
  change: null as unknown,
  pinned: null as string | null,
  pinned_owner: null as string | null,
  flagged: false,
  identity: null as { kem_identity_key: string } | null,
  owner_key: null as string | null,
  fetch_calls: [] as Array<[string, string | undefined]>,
  owner_calls: [] as Array<[string, string]>,
  trusted: [] as Array<[string, string | null, string | null]>,
}));

vi.mock("@/services/crypto/key_manager_core", () => ({
  base64_to_array: (value: string) => new TextEncoder().encode(value),
  compute_hash: async (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(async (username: string, email?: string) => {
    h.fetch_calls.push([username, email]);

    return h.identity;
  }),
}));

vi.mock("@/services/api/keys", () => ({
  get_recipient_public_key: vi.fn(async (username: string, email: string) => {
    h.owner_calls.push([username, email]);

    return h.owner_key ? { data: { public_key: h.owner_key } } : { error: "x" };
  }),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  get_identity_change: vi.fn(async () => h.change),
  get_pinned_identity_fingerprint: vi.fn(async () => h.pinned),
  get_pinned_owner_key_fingerprint: vi.fn(async () => h.pinned_owner),
  is_recipient_flagged_untrusted: vi.fn(async () => h.flagged),
  owner_key_fingerprint: vi.fn(async (armored: string) => `fp:${armored}`),
  trust_recipient_keys: vi.fn(
    async (pin_id: string, kem: string | null, owner: string | null) => {
      h.trusted.push([pin_id, kem, owner]);
    },
  ),
}));

import {
  get_recipient_identity_status,
  has_recipient_identity_changed,
  trust_recipient_identity,
} from "@/services/crypto/recipient_identity_check";

describe("get_recipient_identity_status", () => {
  beforeEach(() => {
    h.change = null;
    h.pinned = null;
    h.pinned_owner = null;
    h.flagged = false;
    h.identity = null;
    h.owner_key = null;
    h.fetch_calls = [];
    h.owner_calls = [];
    h.trusted = [];
  });

  it("reports a recorded key change as rotated without a network request", async () => {
    h.change = { previous_fingerprint: "a", fingerprint: "b", changed_at: 1 };

    expect(await get_recipient_identity_status("Alice@astermail.org")).toBe(
      "rotated",
    );
    expect(h.fetch_calls).toHaveLength(0);
    expect(h.owner_calls).toHaveLength(0);
  });

  it("skips recipients you have never exchanged keys with", async () => {
    expect(await get_recipient_identity_status("bob@astermail.org")).toBe(
      "unchanged",
    );
    expect(await has_recipient_identity_changed("bob@astermail.org")).toBe(
      false,
    );
    expect(h.fetch_calls).toHaveLength(0);
  });

  it("reports a rotation when the published key differs from the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-two" };

    expect(await get_recipient_identity_status("Alice@astermail.org")).toBe(
      "rotated",
    );
    expect(h.fetch_calls).toEqual([["alice", "alice@astermail.org"]]);
  });

  it("stays quiet when the published key matches the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-one" };

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("stays quiet when the published key cannot be fetched", async () => {
    h.pinned = "key-one";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("reports untrusted when the owner key differs from its pin", async () => {
    h.pinned_owner = "fp:old";
    h.owner_key = "new";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
    expect(h.owner_calls).toEqual([["alice", "alice@astermail.org"]]);
  });

  it("reports untrusted when a send refused the recipient's key", async () => {
    h.flagged = true;

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
  });

  it("re-pins the current keys only for an untrusted recipient", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-two" };
    h.pinned_owner = "fp:old";
    h.owner_key = "new";

    await trust_recipient_identity("Alice@astermail.org");

    expect(h.trusted).toEqual([["alice@astermail.org", "key-two", "new"]]);
  });

  it("does not re-pin a recipient whose keys are trusted", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-one" };

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toEqual([]);
  });
});
