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

import {
  ENVELOPE_V3_NONCE,
  encrypt_envelope_v2,
} from "./envelope_v2";
import { has_bound_envelope_floor } from "./stored_envelope_floor";
import { open_stored_envelope } from "./stored_envelope_read";
import {
  encrypt_envelope_for_storage,
  stored_envelope_write_binding,
} from "./stored_envelope_write";

import type { EncryptedVault } from "./key_manager_core";

const h = vi.hoisted(() => ({
  bound_writes: false,
  owner: "owner-a" as string | null,
}));

vi.mock("./vault_level2", () => ({ is_level2_admitted: () => true }));

vi.mock("./memory_key_store", () => ({
  get_vault_owner_id: () => h.owner,
}));

vi.mock("@/services/api/account_key", () => ({
  peek_account_key_capabilities: () => ({
    bound_envelope_writes: h.bound_writes,
  }),
}));

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

const data_kek = to_base64(new Uint8Array(32).fill(7));
const vault = { identity_key: "id", data_kek } as EncryptedVault;
const v3_sentinel = Uint8Array.of(3);

describe("bound envelope floor", () => {
  beforeEach(() => {
    localStorage.clear();
    h.bound_writes = false;
    h.owner = "owner-a";
  });

  it("writes unbound while the server has never enabled binding", () => {
    expect(stored_envelope_write_binding("item-1")).toBeUndefined();
    expect(has_bound_envelope_floor("owner-a")).toBe(false);
  });

  it("keeps binding writes after the server turns the flag off", async () => {
    h.bound_writes = true;
    expect(stored_envelope_write_binding("item-1")).toEqual({
      owner_id: "owner-a",
      item_id: "item-1",
    });

    h.bound_writes = false;
    const sealed = await encrypt_envelope_for_storage({ a: 1 }, vault, "item-1");

    expect(sealed.nonce).toBe(ENVELOPE_V3_NONCE);
    expect(
      await open_stored_envelope(sealed.encrypted, v3_sentinel, vault, "item-2"),
    ).toBeNull();
    expect(
      await open_stored_envelope(sealed.encrypted, v3_sentinel, vault, "item-1"),
    ).toEqual({ a: 1 });
  });

  it("raises the floor when a bound envelope opens", async () => {
    const binding = { owner_id: "owner-a", item_id: "item-9" };
    const key = Uint8Array.from(atob(data_kek), (c) => c.charCodeAt(0));
    const { encrypted } = await encrypt_envelope_v2({ b: 2 }, key, binding);

    expect(
      await open_stored_envelope(encrypted, v3_sentinel, vault, "item-9"),
    ).toEqual({ b: 2 });
    expect(has_bound_envelope_floor("owner-a")).toBe(true);
    expect(stored_envelope_write_binding("item-3")).toEqual({
      owner_id: "owner-a",
      item_id: "item-3",
    });
  });

  it("does not raise the floor when a bound envelope fails to open", async () => {
    expect(
      await open_stored_envelope("AAAA", v3_sentinel, vault, "item-9"),
    ).toBeNull();
    expect(has_bound_envelope_floor("owner-a")).toBe(false);
  });

  it("keeps the floor per account", () => {
    h.bound_writes = true;
    stored_envelope_write_binding("item-1");
    h.bound_writes = false;
    h.owner = "owner-b";

    expect(stored_envelope_write_binding("item-1")).toBeUndefined();
  });
});
