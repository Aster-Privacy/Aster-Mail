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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  keys: [] as CryptoKey[],
}));

vi.mock("./encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? h.store.get(key) : null,
  ),
  encrypted_set: vi.fn(
    async (key: string, value: unknown, storage_key: CryptoKey) => {
      h.keys.push(storage_key);
      h.store.set(key, value);
    },
  ),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: vi.fn(async () => new Uint8Array(32).fill(2)),
}));

vi.mock("@/services/account_manager", () => ({
  accounts_storage_unreadable: vi.fn(() => false),
  get_current_account_id: vi.fn(async () => "acct-a"),
}));

import { set_cached_ratchet_plaintext } from "./ratchet_plaintext_cache";
import { save_ratchet_state } from "./ratchet_state_store";
import type { DoubleRatchet } from "./double_ratchet";

describe("local ratchet storage keys", () => {
  beforeEach(() => {
    h.store.clear();
    h.keys = [];
  });

  it("keeps the plaintext cache key inside the browser", async () => {
    await set_cached_ratchet_plaintext("message-1", "hello");

    expect(h.keys.length).toBeGreaterThan(0);
    expect(h.keys.every((key) => key.extractable === false)).toBe(true);
  });

  it("keeps the ratchet state key inside the browser", async () => {
    const ratchet = {
      serialize: async () => ({ conversation_id: "conv-1", state: {} }),
    } as unknown as DoubleRatchet;

    await save_ratchet_state(ratchet);

    expect(h.keys.length).toBeGreaterThan(0);
    expect(h.keys.every((key) => key.extractable === false)).toBe(true);
  });
});
