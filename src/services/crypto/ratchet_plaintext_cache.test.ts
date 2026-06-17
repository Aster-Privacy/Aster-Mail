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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  state: { uid: "acct-a" as string | null },
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
  encrypted_list_keys: vi.fn(async () => Array.from(h.store.keys())),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => h.state.uid),
}));

import {
  get_cached_ratchet_plaintext,
  set_cached_ratchet_plaintext,
} from "./ratchet_plaintext_cache";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function cache_id(message_id: string): string {
  return `ratchet_plaintext_${h.state.uid}_${message_id}`;
}

describe("ratchet plaintext cache durability", () => {
  beforeEach(() => {
    h.store.clear();
    h.state.uid = "acct-a";
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still returns a message decrypted well past the old 6h window", async () => {
    await set_cached_ratchet_plaintext("msg1", "hello overnight");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 10 * HOUR);

    expect(await get_cached_ratchet_plaintext("msg1")).toBe("hello overnight");
  });

  it("slides the stored_at forward when an aged entry is read", async () => {
    await set_cached_ratchet_plaintext("msg1", "keep me");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 2 * DAY);
    await get_cached_ratchet_plaintext("msg1");

    const refreshed = h.store.get(cache_id("msg1")) as { stored_at: number };

    expect(refreshed.stored_at).toBe(stored + 2 * DAY);
  });

  it("expires and removes an entry untouched beyond the retention window", async () => {
    await set_cached_ratchet_plaintext("msg1", "stale");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 91 * DAY);

    expect(await get_cached_ratchet_plaintext("msg1")).toBeNull();
    expect(h.store.has(cache_id("msg1"))).toBe(false);
  });
});
