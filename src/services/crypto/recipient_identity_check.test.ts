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
  identity: null as { kem_identity_key: string } | null,
  fetch_calls: [] as Array<[string, string | undefined]>,
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

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  get_identity_change: vi.fn(async () => h.change),
  get_pinned_identity_fingerprint: vi.fn(async () => h.pinned),
}));

import { has_recipient_identity_changed } from "@/services/crypto/recipient_identity_check";

describe("has_recipient_identity_changed", () => {
  beforeEach(() => {
    h.change = null;
    h.pinned = null;
    h.identity = null;
    h.fetch_calls = [];
  });

  it("reports a recorded key change without a network request", async () => {
    h.change = { previous_fingerprint: "a", fingerprint: "b", changed_at: 1 };

    expect(await has_recipient_identity_changed("Alice@astermail.org")).toBe(
      true,
    );
    expect(h.fetch_calls).toHaveLength(0);
  });

  it("skips recipients you have never exchanged keys with", async () => {
    expect(await has_recipient_identity_changed("bob@astermail.org")).toBe(
      false,
    );
    expect(h.fetch_calls).toHaveLength(0);
  });

  it("reports a change when the published key differs from the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-two" };

    expect(await has_recipient_identity_changed("Alice@astermail.org")).toBe(
      true,
    );
    expect(h.fetch_calls).toEqual([["alice", "alice@astermail.org"]]);
  });

  it("stays quiet when the published key matches the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-one" };

    expect(await has_recipient_identity_changed("alice@astermail.org")).toBe(
      false,
    );
  });

  it("stays quiet when the published key cannot be fetched", async () => {
    h.pinned = "key-one";

    expect(await has_recipient_identity_changed("alice@astermail.org")).toBe(
      false,
    );
  });
});
