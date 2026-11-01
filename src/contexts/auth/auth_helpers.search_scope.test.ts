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

const hoisted = vi.hoisted(() => ({
  search_scopes: [] as unknown[],
  account_changes: [] as boolean[],
  search_cleared: false,
  unlocked_folders: false,
  protected_folders: false,
  locked_all: 0,
}));

vi.mock("@/hooks/use_protected_folder", () => ({
  has_unlocked_folders: () => hoisted.unlocked_folders,
  lock_all_folders: () => {
    hoisted.locked_all++;
    hoisted.unlocked_folders = false;
  },
}));

vi.mock("@/services/locked_folders", () => ({
  has_protected_folders: () => hoisted.protected_folders,
}));

vi.mock("@/hooks/use_search", () => ({
  clear_search_index: async (
    snapshots: unknown,
    options: { account_changed?: boolean } = {},
  ) => {
    hoisted.search_scopes.push(snapshots);
    hoisted.account_changes.push(!!options.account_changed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    hoisted.search_cleared = true;
  },
}));

vi.mock("@/hooks/use_email_list", () => ({
  clear_mail_cache: async () => undefined,
}));

vi.mock("@/services/crypto/ratchet_state_store", () => ({
  clear_all_ratchet_states: async () => undefined,
}));

import { clear_account_scoped_caches } from "./auth_helpers";

describe("clear_account_scoped_caches and the saved search index", () => {
  beforeEach(() => {
    hoisted.search_scopes.length = 0;
    hoisted.account_changes.length = 0;
    hoisted.search_cleared = false;
    hoisted.unlocked_folders = false;
    hoisted.protected_folders = false;
    hoisted.locked_all = 0;
  });

  it("keeps saved search indexes on an account switch", async () => {
    await clear_account_scoped_caches();

    expect(hoisted.search_scopes).toEqual(["none"]);
    expect(hoisted.account_changes).toEqual([true]);
    expect(hoisted.locked_all).toBe(0);
  });

  it("locks unlocked folders and deletes every saved index on a switch", async () => {
    hoisted.unlocked_folders = true;

    await clear_account_scoped_caches();

    expect(hoisted.locked_all).toBe(1);
    expect(hoisted.search_scopes).toEqual(["all"]);
  });

  it("deletes every saved index on a switch away from an account with protected folders", async () => {
    hoisted.protected_folders = true;

    await clear_account_scoped_caches();

    expect(hoisted.locked_all).toBe(0);
    expect(hoisted.search_scopes).toEqual(["all"]);
  });

  it("removes the signed-out account's saved search index before returning", async () => {
    await clear_account_scoped_caches({ account_id: "acct-2" });

    expect(hoisted.search_scopes).toEqual([{ account_id: "acct-2" }]);
    expect(hoisted.search_cleared).toBe(true);
  });
});
