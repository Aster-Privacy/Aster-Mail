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
    store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  device_retrieve_strict: vi.fn(async (key: string) =>
    store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null,
  ),
}));

vi.mock("@/services/plan_limits", () => ({
  resolve_known_max_accounts: () => Promise.resolve(-1),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

function seed() {
  store.set(ACCOUNTS_KEY, {
    accounts: [FIRST, SECOND].map((id, i) => ({
      id,
      user: { id, email: `${i}@example.test` },
      added_at: i,
    })),
    current_account_id: SECOND,
  });
}

async function open_fresh_tab(pathname: string) {
  vi.resetModules();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", pathname);
  const url = await import("@/lib/account_index_url");

  url.resolve_account_basename();

  return import("./account_manager");
}

describe("account for a fresh tab on an entry page", () => {
  beforeEach(() => {
    store.clear();
    seed();
  });

  it("signs a fresh invite tab in with the account for its index", async () => {
    const manager = await open_fresh_tab(
      `/join/family?token=${"a".repeat(64)}`,
    );

    expect((await manager.get_current_account())?.id).toBe(FIRST);
  });

  it("signs a fresh invite tab in with the account in its prefix", async () => {
    const manager = await open_fresh_tab(`/u/1/join/family?token=x`);

    expect((await manager.get_current_account())?.id).toBe(SECOND);
  });

  it("keeps a fresh sign-in tab signed out", async () => {
    const manager = await open_fresh_tab("/sign-in");

    expect(await manager.get_current_account()).toBeNull();
  });
});
