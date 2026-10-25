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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, unknown>();
const desktop_store = new Map<string, string>();
let desktop_fails = false;
let device_key_bound = true;

const invoke = vi.fn(
  async (command: string, args?: Record<string, unknown>) => {
    if (desktop_fails) throw new Error("unavailable");
    const account_id = args?.accountId as string;

    switch (command) {
      case "device_refresh_token_set":
        desktop_store.set(account_id, args?.value as string);

        return undefined;
      case "device_refresh_token_get":
        return desktop_store.get(account_id) ?? null;
      case "device_refresh_token_remove":
        desktop_store.delete(account_id);

        return undefined;
      case "device_refresh_token_clear":
        desktop_store.clear();

        return undefined;
      default:
        throw new Error(command);
    }
  },
);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(
    async (
      key: string,
      value: unknown,
      redact_without_device_key?: (value: unknown) => unknown,
    ) => {
      const persisted =
        !device_key_bound && redact_without_device_key
          ? redact_without_device_key(value)
          : value;

      store.set(key, JSON.parse(JSON.stringify(persisted)));
    },
  ),
  device_retrieve_strict: vi.fn(async (key: string) =>
    store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null,
  ),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

type StoredRow = {
  id: string;
  refresh_token?: string;
  refresh_in_device_store?: boolean;
};

function roster_row(id: string): StoredRow {
  const data = store.get(ACCOUNTS_KEY) as { accounts: StoredRow[] };

  return data.accounts.find((a) => a.id === id) as StoredRow;
}

async function load_manager() {
  vi.resetModules();

  return import("./account_manager");
}

function seed(accounts: StoredRow[]) {
  store.set(ACCOUNTS_KEY, {
    accounts: accounts.map((a, i) => ({
      ...a,
      user: { id: a.id },
      added_at: i,
    })),
    current_account_id: accounts[0].id,
  });
}

describe("refresh tokens on desktop", () => {
  beforeEach(() => {
    store.clear();
    desktop_store.clear();
    desktop_fails = false;
    device_key_bound = true;
    invoke.mockClear();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    seed([{ id: FIRST }, { id: SECOND }]);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("keeps the refresh token out of the roster and reads it back", async () => {
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");

    expect(roster_row(FIRST).refresh_token).toBeUndefined();
    expect(roster_row(FIRST).refresh_in_device_store).toBe(true);
    expect(desktop_store.get(FIRST)).toBe("refresh_first");
    expect(await manager.get_account_tokens(FIRST)).toEqual({
      access_token: "access",
      refresh_token: "refresh_first",
    });
  });

  it("reports a device-stored token as present", async () => {
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");
    const accounts = await manager.get_all_accounts();
    const first = accounts.find((a) => a.id === FIRST)!;
    const second = accounts.find((a) => a.id === SECOND)!;

    expect(manager.account_has_refresh_token(first)).toBe(true);
    expect(manager.account_has_refresh_token(second)).toBe(false);
  });

  it("moves an existing roster token into device storage on read", async () => {
    seed([{ id: FIRST, refresh_token: "legacy" }, { id: SECOND }]);
    const manager = await load_manager();

    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe(
      "legacy",
    );
    await manager.serialize_account_write(async () => undefined);

    expect(desktop_store.get(FIRST)).toBe("legacy");
    expect(roster_row(FIRST).refresh_token).toBeUndefined();
    expect(roster_row(FIRST).refresh_in_device_store).toBe(true);
    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe(
      "legacy",
    );
  });

  it("falls back to the roster when device storage is unavailable", async () => {
    desktop_fails = true;
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");

    expect(roster_row(FIRST).refresh_token).toBe("refresh_first");
    expect(roster_row(FIRST).refresh_in_device_store).toBeUndefined();
    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe(
      "refresh_first",
    );
  });

  it("removes the device copy when the token is cleared", async () => {
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");
    await manager.update_account_tokens(FIRST, null, null);

    expect(desktop_store.has(FIRST)).toBe(false);
    expect(roster_row(FIRST).refresh_in_device_store).toBeUndefined();
    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBeNull();
  });

  it("keeps rotations for different accounts apart", async () => {
    const manager = await load_manager();

    await Promise.all([
      manager.update_account_tokens(FIRST, "a1", "r1"),
      manager.update_account_tokens(SECOND, "a2", "r2"),
    ]);
    await manager.update_account_tokens(FIRST, "a3", "r3");

    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe("r3");
    expect((await manager.get_account_tokens(SECOND)).refresh_token).toBe("r2");
  });
});

describe("refresh tokens in a browser", () => {
  beforeEach(() => {
    store.clear();
    desktop_store.clear();
    desktop_fails = false;
    device_key_bound = true;
    invoke.mockClear();
    seed([{ id: FIRST }, { id: SECOND }]);
  });

  it("keeps the token in the roster and never calls the desktop store", async () => {
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");

    expect(roster_row(FIRST).refresh_token).toBe("refresh_first");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not persist the token without a device-bound key", async () => {
    device_key_bound = false;
    const manager = await load_manager();

    await manager.update_account_tokens(FIRST, "access", "refresh_first");

    expect(roster_row(FIRST).refresh_token).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});
