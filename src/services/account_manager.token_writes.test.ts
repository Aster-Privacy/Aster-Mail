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

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  device_retrieve_strict: vi.fn(async (key: string) => {
    await new Promise((resolve) => setTimeout(resolve, 5));

    return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

const { update_account_tokens, get_account_tokens } = await import(
  "./account_manager"
);

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

describe("account token writes", () => {
  beforeEach(() => {
    store.clear();
    store.set(ACCOUNTS_KEY, {
      accounts: [
        { id: FIRST, user: { id: FIRST }, added_at: 1 },
        { id: SECOND, user: { id: SECOND }, added_at: 2 },
      ],
      current_account_id: FIRST,
    });
  });

  it("keeps concurrent writes for different accounts from overwriting each other", async () => {
    await Promise.all([
      update_account_tokens(FIRST, "access_first", "refresh_first"),
      update_account_tokens(SECOND, "access_second", "refresh_second"),
    ]);

    expect(await get_account_tokens(FIRST)).toEqual({
      access_token: "access_first",
      refresh_token: "refresh_first",
    });
    expect(await get_account_tokens(SECOND)).toEqual({
      access_token: "access_second",
      refresh_token: "refresh_second",
    });
  });

  it("applies concurrent rotations for one account in call order", async () => {
    await Promise.all([
      update_account_tokens(FIRST, "access_one", "refresh_one"),
      update_account_tokens(FIRST, "access_two", "refresh_two"),
    ]);

    expect(await get_account_tokens(FIRST)).toEqual({
      access_token: "access_two",
      refresh_token: "refresh_two",
    });
  });

  it("leaves the stored refresh token untouched when none is supplied", async () => {
    await update_account_tokens(FIRST, "access_one", "refresh_one");
    await update_account_tokens(FIRST, "access_two", undefined);

    expect(await get_account_tokens(FIRST)).toEqual({
      access_token: "access_two",
      refresh_token: "refresh_one",
    });
  });
});
