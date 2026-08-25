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
const h = vi.hoisted(() => ({ retrieve_throws: true }));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  device_retrieve_strict: vi.fn(async (key: string) => {
    if (h.retrieve_throws) {
      throw new Error("keystore unavailable");
    }

    return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

const { add_account, accounts_storage_unreadable } = await import(
  "./account_manager"
);

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";
const THIRD = "9d1f0f56-2f6f-4a1b-9b0a-2f1c3d4e5f60";

function seed_roster(): void {
  store.set(ACCOUNTS_KEY, {
    accounts: [
      { id: FIRST, user: { id: FIRST }, added_at: 1 },
      { id: SECOND, user: { id: SECOND }, added_at: 2 },
    ],
    current_account_id: FIRST,
  });
}

describe("account roster writes while storage is unreadable", () => {
  beforeEach(() => {
    store.clear();
    seed_roster();
    localStorage.clear();
    localStorage.setItem(ACCOUNTS_KEY, "opaque");
    h.retrieve_throws = true;
  });

  it("does not overwrite the stored roster with a single account", async () => {
    const result = await add_account({ id: THIRD, email: "c@x.test" } as never);

    expect(result.success).toBe(true);

    const persisted = store.get(ACCOUNTS_KEY) as {
      accounts: { id: string }[];
    };

    expect(persisted.accounts.map((a) => a.id)).toEqual([FIRST, SECOND]);
    expect(accounts_storage_unreadable()).toBe(true);
  });
});
