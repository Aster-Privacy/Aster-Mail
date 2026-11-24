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
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ keys: [] as CryptoKey[] }));

vi.mock("./storage_key_names", async (original) => ({
  ...(await original<object>()),
  scoped_get: vi.fn(async () => null),
  scoped_delete: vi.fn(async () => undefined),
  delete_scoped_entries: vi.fn(async () => undefined),
  scoped_set: vi.fn(
    async (
      _prefix: string,
      _uid: string | null,
      _rest: string,
      _value: unknown,
      key: CryptoKey,
    ) => {
      h.keys.push(key);
    },
  ),
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(async () => null),
  encrypted_set: vi.fn(async () => undefined),
  encrypted_delete: vi.fn(async () => undefined),
  encrypted_delete_where: vi.fn(async () => undefined),
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

import { save_ratchet_state } from "./ratchet_state_store";
import { set_cached_ratchet_plaintext } from "./ratchet_plaintext_cache";
import type { DoubleRatchet } from "./double_ratchet";

describe("ratchet storage keys", () => {
  it("imports the ratchet state key as non-extractable", async () => {
    h.keys.length = 0;

    const ratchet = {
      serialize: async () => ({ conversation_id: "conv-1" }),
    } as unknown as DoubleRatchet;

    await save_ratchet_state(ratchet);

    expect(h.keys.length).toBeGreaterThan(0);
    expect(h.keys.map((key) => key.extractable)).toEqual(
      h.keys.map(() => false),
    );
  });

  it("imports the plaintext cache key as non-extractable", async () => {
    h.keys.length = 0;

    await set_cached_ratchet_plaintext("msg-1", "hello");

    expect(h.keys.length).toBeGreaterThan(0);
    expect(h.keys.map((key) => key.extractable)).toEqual(
      h.keys.map(() => false),
    );
  });
});
