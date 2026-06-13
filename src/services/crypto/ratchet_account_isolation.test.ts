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
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => h.state.uid),
}));

import {
  save_ratchet_state,
  load_ratchet_state,
  delete_ratchet_state,
  list_ratchet_conversations,
  clear_all_ratchet_states,
  DoubleRatchet,
} from "./double_ratchet";

function fake_ratchet(conversation_id: string, marker: number): DoubleRatchet {
  return {
    serialize: async () => ({ conversation_id, state: { marker } }),
  } as unknown as DoubleRatchet;
}

describe("ratchet storage account isolation", () => {
  beforeEach(() => {
    h.store.clear();
    h.state.uid = "acct-a";
  });

  it("writes ratchet state under the account namespace, not the global key", async () => {
    await save_ratchet_state(fake_ratchet("cid1", 1));

    expect(h.store.has("ratchet_state_acct-a_cid1")).toBe(true);
    expect(h.store.has("ratchet_state_cid1")).toBe(false);
    expect(h.store.get("ratchet_conversation_index_acct-a")).toEqual(["cid1"]);
    expect(h.store.has("ratchet_conversation_index")).toBe(false);
  });

  it("keeps the same conversation id isolated across two accounts", async () => {
    await save_ratchet_state(fake_ratchet("shared", 1));

    h.state.uid = "acct-b";
    await save_ratchet_state(fake_ratchet("shared", 2));

    const a = h.store.get("ratchet_state_acct-a_shared") as {
      state: { marker: number };
    };
    const b = h.store.get("ratchet_state_acct-b_shared") as {
      state: { marker: number };
    };

    expect(a.state.marker).toBe(1);
    expect(b.state.marker).toBe(2);
  });

  it("migrates a pre-namespacing global row into the account namespace on read", async () => {
    h.store.set("ratchet_state_legacycid", {
      conversation_id: "legacycid",
      state: { marker: 7 },
    });

    await load_ratchet_state("legacycid").catch(() => null);

    expect(h.store.has("ratchet_state_acct-a_legacycid")).toBe(true);
    expect(h.store.has("ratchet_state_legacycid")).toBe(false);
    expect(h.store.get("ratchet_conversation_index_acct-a")).toContain(
      "legacycid",
    );
  });

  it("does not migrate another account's namespaced row", async () => {
    h.store.set("ratchet_state_acct-b_cid1", {
      conversation_id: "cid1",
      state: { marker: 9 },
    });

    const result = await load_ratchet_state("cid1").catch(() => null);

    expect(result).toBeNull();
    expect(h.store.has("ratchet_state_acct-a_cid1")).toBe(false);
    expect(h.store.has("ratchet_state_acct-b_cid1")).toBe(true);
  });

  it("deletes the namespaced row and the legacy row, and prunes the index", async () => {
    await save_ratchet_state(fake_ratchet("cid1", 1));
    h.store.set("ratchet_state_cid1", {
      conversation_id: "cid1",
      state: { marker: 1 },
    });

    await delete_ratchet_state("cid1");

    expect(h.store.has("ratchet_state_acct-a_cid1")).toBe(false);
    expect(h.store.has("ratchet_state_cid1")).toBe(false);
    expect(h.store.has("ratchet_conversation_index_acct-a")).toBe(false);
  });

  it("lists only the current account's conversations", async () => {
    await save_ratchet_state(fake_ratchet("a1", 1));

    h.state.uid = "acct-b";
    await save_ratchet_state(fake_ratchet("b1", 2));

    expect(await list_ratchet_conversations()).toEqual(["b1"]);

    h.state.uid = "acct-a";
    expect(await list_ratchet_conversations()).toEqual(["a1"]);
  });

  it("clears the current account namespace and any leftover global rows", async () => {
    await save_ratchet_state(fake_ratchet("a1", 1));
    h.store.set("ratchet_state_legacy", {
      conversation_id: "legacy",
      state: { marker: 1 },
    });
    h.store.set("ratchet_conversation_index", ["legacy"]);

    await clear_all_ratchet_states();

    expect(h.store.has("ratchet_state_acct-a_a1")).toBe(false);
    expect(h.store.has("ratchet_conversation_index_acct-a")).toBe(false);
    expect(h.store.has("ratchet_state_legacy")).toBe(false);
    expect(h.store.has("ratchet_conversation_index")).toBe(false);
  });
});
