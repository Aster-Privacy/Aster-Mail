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
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
let account_id: string | null = "account_one";

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: async (key: string) => store.get(key) ?? null,
  encrypted_set: async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_delete: async (key: string) => {
    store.delete(key);
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32),
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => account_id,
}));

import {
  load_unsubscribe_facts,
  save_unsubscribe_facts,
  clear_unsubscribe_facts,
  type UnsubscribeFacts,
} from "@/services/unsubscribe_index";

function sample_facts(): UnsubscribeFacts {
  return new Map([
    [
      "mail_one",
      {
        email: "news@sender.example.com",
        name: "Sender News",
        unsub: {
          has_unsubscribe: true,
          method: "one-click" as const,
          unsubscribe_link: "https://sender.example.com/oc",
        },
      },
    ],
    [
      "mail_two",
      { email: "someone@example.com", name: "Someone", unsub: null },
    ],
  ]);
}

describe("unsubscribe fact index", () => {
  beforeEach(() => {
    store.clear();
    account_id = "account_one";
    vi.stubGlobal("crypto", {
      subtle: { importKey: async () => ({}) as CryptoKey },
    });
  });

  it("returns an empty index before anything is saved", async () => {
    await expect(load_unsubscribe_facts()).resolves.toEqual(new Map());
  });

  it("round-trips facts so a repeat scan needs no decryption", async () => {
    await save_unsubscribe_facts(sample_facts());

    const loaded = await load_unsubscribe_facts();

    expect(loaded.size).toBe(2);
    expect(loaded.get("mail_one")?.unsub?.method).toBe("one-click");
    expect(loaded.get("mail_two")?.unsub).toBeNull();
  });

  it("keeps each account's facts separate", async () => {
    await save_unsubscribe_facts(sample_facts());

    account_id = "account_two";

    await expect(load_unsubscribe_facts()).resolves.toEqual(new Map());
  });

  it("stores nothing when no account is signed in", async () => {
    account_id = null;

    await save_unsubscribe_facts(sample_facts());

    expect(store.size).toBe(0);
  });

  it("drops the index on request", async () => {
    await save_unsubscribe_facts(sample_facts());
    await clear_unsubscribe_facts();

    await expect(load_unsubscribe_facts()).resolves.toEqual(new Map());
  });

  it("ignores an index written by a newer version", async () => {
    store.set("unsubscribe_index_account_one", {
      version: 99,
      entries: [["mail_one", { email: "a@b.c", name: "a", unsub: null }]],
    });

    await expect(load_unsubscribe_facts()).resolves.toEqual(new Map());
  });
});
