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
} from "@/services/crypto/ratchet_identity_pin";
import { clear_ratchet_verification_status } from "@/services/crypto/ratchet_verification_status";
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

const KEY_C = btoa("identity-key-cccccccccccccccccccccccc");
const HOUR_MS = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1);

describe("ratchet identity pin signing time", () => {
  beforeEach(() => {
    h.store.clear();
    reset_storage_name_state();
    reset_contact_entry_state();
    h.key = new Uint8Array(32).fill(7);
    clear_ratchet_verification_status();
  });

  async function stored_signed_at(peer: string): Promise<number | undefined> {
    const stored = h.store.get(
      await pin_name("ratchet_identity_pin_", peer),
    ) as { signed_at?: number };

    return stored.signed_at;
  }

  function pin(peer: string, key: string, signed_at: number | null) {
    return check_and_pin_identity(peer, key, true, true, false, null, true, signed_at);
  }

  it("refuses a verified rotation back to an identity signed before the pinned one", async () => {
    expect(await pin("dana", KEY_A, T0)).toBe("first");
    expect(await pin("dana", KEY_B, T0 + 24 * HOUR_MS)).toBe("rotated");
    expect(await pin("dana", KEY_A, T0)).toBe("drift");
    expect(await stored_signed_at("dana")).toBe(T0 + 24 * HOUR_MS);
  });

  it("accepts a newer rotation and a small clock skew", async () => {
    await pin("erin", KEY_A, T0);
    expect(await pin("erin", KEY_B, T0 - 30 * 60 * 1000)).toBe("rotated");
    expect(await pin("erin", KEY_C, T0 + HOUR_MS)).toBe("rotated");
    expect(await stored_signed_at("erin")).toBe(T0 + HOUR_MS);
  });

  it("keeps the latest signing time when the same identity is served with an older bundle", async () => {
    await pin("finn", KEY_A, T0 + HOUR_MS);
    expect(await pin("finn", KEY_A, T0)).toBe("ok");
    expect(await stored_signed_at("finn")).toBe(T0 + HOUR_MS);
  });

  it("keeps the old behavior when no signing time is known", async () => {
    await pin("gale", KEY_A, null);
    expect(await stored_signed_at("gale")).toBeUndefined();
    expect(await pin("gale", KEY_B, T0)).toBe("rotated");
    expect(await pin("gale", KEY_A, null)).toBe("rotated");
  });
});
