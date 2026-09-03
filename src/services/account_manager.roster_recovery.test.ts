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
const h = vi.hoisted(() => ({
  failure: null as null | "transient" | "undecryptable",
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  device_retrieve_strict: vi.fn(async (key: string) => {
    if (h.failure === "transient") throw new Error("keystore unavailable");
    if (h.failure === "undecryptable") {
      throw Object.assign(new Error("wrong_password"), {
        code: "wrong_password",
      });
    }

    return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { can_persist_session: () => true },
}));

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

type Roster = { accounts: { id: string }[]; current_account_id: string | null };

async function load_module() {
  vi.resetModules();

  return import("./account_manager");
}

beforeEach(() => {
  store.clear();
  localStorage.clear();
  localStorage.setItem(ACCOUNTS_KEY, "opaque");
  h.failure = null;
});

describe("account roster recovery", () => {
  it("keeps a signed-in account usable while the keystore is unavailable", async () => {
    h.failure = "transient";

    const module = await load_module();
    const result = await module.add_account({
      id: FIRST,
      email: "a@x.test",
    } as never);

    expect(result.success).toBe(true);

    const current = await module.get_current_account();

    expect(current?.id).toBe(FIRST);
    expect(store.has(ACCOUNTS_KEY)).toBe(false);
    expect(module.accounts_storage_unreadable()).toBe(true);
  });

  it("merges the session roster back once the keystore recovers", async () => {
    store.set(ACCOUNTS_KEY, {
      accounts: [{ id: SECOND, user: { id: SECOND }, added_at: 1 }],
      current_account_id: SECOND,
    });
    h.failure = "transient";

    const module = await load_module();

    await module.add_account({ id: FIRST, email: "a@x.test" } as never);

    h.failure = null;
    await module.reload_accounts_from_storage();

    const persisted = store.get(ACCOUNTS_KEY) as Roster;

    expect(persisted.accounts.map((a) => a.id).sort()).toEqual(
      [FIRST, SECOND].sort(),
    );
    expect(persisted.current_account_id).toBe(FIRST);
    expect(module.accounts_storage_unreadable()).toBe(false);
  });

  it("lets a fresh sign-in replace roster data that can never be decrypted", async () => {
    h.failure = "undecryptable";

    const module = await load_module();

    await module.add_account({ id: FIRST, email: "a@x.test" } as never);

    const persisted = store.get(ACCOUNTS_KEY) as Roster;

    expect(persisted.accounts.map((a) => a.id)).toEqual([FIRST]);
    expect(persisted.current_account_id).toBe(FIRST);
    expect(module.accounts_storage_unreadable()).toBe(false);
  });

  it("repairs a roster whose current account id points nowhere", async () => {
    store.set(ACCOUNTS_KEY, {
      accounts: [{ id: SECOND, user: { id: SECOND }, added_at: 1 }],
      current_account_id: "00000000-0000-4000-8000-000000000000",
    });

    const module = await load_module();
    const current = await module.get_current_account();

    expect(current?.id).toBe(SECOND);
    expect((store.get(ACCOUNTS_KEY) as Roster).current_account_id).toBe(SECOND);
  });
});
