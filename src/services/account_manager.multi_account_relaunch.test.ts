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
let failing_calls: Set<string> = new Set();
let failures_left = 0;
let device_key_bound = true;
let release_plan_limit: (() => void) | null = null;
let hold_plan_limit = false;

const invoke = vi.fn(
  async (command: string, args?: Record<string, unknown>) => {
    if (failing_calls.has(command) && failures_left > 0) {
      failures_left -= 1;
      throw new Error("keychain busy");
    }
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

vi.mock("@/services/plan_limits", () => ({
  resolve_known_max_accounts: () =>
    hold_plan_limit
      ? new Promise<number>((resolve) => {
          release_plan_limit = () => resolve(-1);
        })
      : Promise.resolve(-1),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  clear_session_passphrase: vi.fn(async () => undefined),
  clear_stored_encrypted_vault: vi.fn(() => undefined),
}));

vi.mock("@/services/crypto/storage_key_names", () => ({
  delete_account_storage: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/guard_key_store", () => ({
  delete_guard_record: vi.fn(async () => undefined),
  delete_guard_hints_for: vi.fn(async () => undefined),
}));

vi.mock("@/services/offline_email_cache", () => ({
  clear_email_cache: vi.fn(async () => undefined),
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  clear_calendar_sync_state: vi.fn(async () => undefined),
}));

vi.mock("@/services/search_index_store", () => ({
  clear_search_snapshots: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/preferences", () => ({
  clear_preferences_cache: vi.fn(() => undefined),
}));

vi.mock("@/services/contact_email_index", () => ({
  invalidate_contact_email_index: vi.fn(() => undefined),
}));

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";
const THIRD = "8f0e6a52-4b3e-4d0f-9a41-6c2f1b7d3e55";

type StoredRow = {
  id: string;
  refresh_token?: string;
  refresh_in_device_store?: boolean;
  device_id?: string;
};

function roster(): { accounts: StoredRow[] } {
  return store.get(ACCOUNTS_KEY) as { accounts: StoredRow[] };
}

function roster_row(id: string): StoredRow | undefined {
  return roster().accounts.find((a) => a.id === id);
}

async function relaunch() {
  vi.resetModules();

  return import("./account_manager");
}

function seed(accounts: StoredRow[]) {
  store.set(ACCOUNTS_KEY, {
    accounts: accounts.map((a, i) => ({
      ...a,
      user: { id: a.id, email: `${i}@example.test` },
      added_at: i,
    })),
    current_account_id: accounts[0].id,
  });
}

function set_tauri(on: boolean) {
  const target = window as unknown as Record<string, unknown>;

  if (on) target.__TAURI_INTERNALS__ = {};
  else delete target.__TAURI_INTERNALS__;
}

function fail_next(command: string, times: number) {
  failing_calls = new Set([command]);
  failures_left = times;
}

describe("accounts stay signed in across a relaunch", () => {
  beforeEach(() => {
    store.clear();
    desktop_store.clear();
    failing_calls = new Set();
    failures_left = 0;
    device_key_bound = true;
    hold_plan_limit = false;
    release_plan_limit = null;
    invoke.mockClear();
    set_tauri(true);
  });

  afterEach(() => {
    set_tauri(false);
  });

  it("keeps every account after one keychain write fails", async () => {
    device_key_bound = false;
    seed([{ id: FIRST }, { id: SECOND }]);
    let manager = await relaunch();

    await manager.update_account_tokens(FIRST, "a1", "refresh_first");
    fail_next("device_refresh_token_set", 1);
    await manager.update_account_tokens(SECOND, "a2", "refresh_second");
    await manager.update_account_tokens(FIRST, "a1b", "refresh_first_b");

    manager = await relaunch();

    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe(
      "refresh_first_b",
    );
    expect((await manager.get_account_tokens(SECOND)).refresh_token).toBe(
      "refresh_second",
    );
  });

  it("never deletes a saved token when a later write fails", async () => {
    seed([{ id: FIRST }, { id: SECOND }]);
    const manager = await relaunch();

    await manager.update_account_tokens(FIRST, "a1", "refresh_first");
    fail_next("device_refresh_token_set", 5);
    await manager.update_account_tokens(FIRST, "a1b", "refresh_first_b");

    expect(desktop_store.get(FIRST)).toBe("refresh_first");
    expect(roster_row(FIRST)?.refresh_in_device_store).toBe(true);
    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe(
      "refresh_first_b",
    );
  });

  it("reports an unreadable keychain instead of a missing token", async () => {
    seed([{ id: FIRST }, { id: SECOND }]);
    let manager = await relaunch();

    await manager.update_account_tokens(SECOND, "a2", "refresh_second");
    manager = await relaunch();
    fail_next("device_refresh_token_get", 1);

    await expect(manager.get_account_tokens(SECOND)).rejects.toSatisfy(
      (caught: unknown) => manager.is_desktop_refresh_store_unavailable(caught),
    );
    expect((await manager.get_account_tokens(SECOND)).refresh_token).toBe(
      "refresh_second",
    );
  });

  it("keeps three accounts and removes only the one asked for", async () => {
    seed([{ id: FIRST }, { id: SECOND }, { id: THIRD }]);
    let manager = await relaunch();

    await manager.update_account_tokens(FIRST, "a1", "r1");
    await manager.update_account_tokens(SECOND, "a2", "r2");
    await manager.update_account_tokens(THIRD, "a3", "r3");
    await manager.remove_account(SECOND);

    manager = await relaunch();

    expect(desktop_store.has(SECOND)).toBe(false);
    expect(roster_row(SECOND)).toBeUndefined();
    expect((await manager.get_account_tokens(FIRST)).refresh_token).toBe("r1");
    expect((await manager.get_account_tokens(THIRD)).refresh_token).toBe("r3");
  });

  it("does not lose a rotated token while an account is being added", async () => {
    set_tauri(false);
    seed([{ id: FIRST, refresh_token: "r1" }]);
    const manager = await relaunch();

    await manager.get_all_accounts();
    hold_plan_limit = true;
    const adding = manager.add_account({
      id: SECOND,
      email: "second@example.test",
    } as never);

    await vi.waitFor(() => expect(release_plan_limit).not.toBeNull());
    const rotation = (async () => {
      await manager.read_stored_refresh_token(FIRST);
      await manager.update_account_tokens(FIRST, "a1", "r1_rotated");
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));
    release_plan_limit?.();
    await Promise.all([adding, rotation]);

    expect(roster_row(SECOND)).toBeDefined();
    expect(roster_row(FIRST)?.refresh_token).toBe("r1_rotated");
  });

  it("shows a paired desktop account as signed in", async () => {
    const manager = await relaunch();

    expect(
      manager.account_session_resumable({
        id: FIRST,
        device_id: "11111111-2222-3333-4444-555555555555",
      } as never),
    ).toBe(true);
    expect(manager.account_session_resumable({ id: FIRST } as never)).toBe(
      false,
    );
    set_tauri(false);
    expect(
      manager.account_session_resumable({
        id: FIRST,
        device_id: "11111111-2222-3333-4444-555555555555",
      } as never),
    ).toBe(false);
  });

  it("never lends one account's device id to another", async () => {
    seed([
      { id: FIRST, device_id: "dev-first" },
      { id: SECOND, device_id: "dev-second" },
    ]);
    const manager = await relaunch();

    expect(
      await manager.device_id_claimed_by_other_account(FIRST, "dev-second"),
    ).toBe(true);
    expect(
      await manager.device_id_claimed_by_other_account(FIRST, "dev-first"),
    ).toBe(false);
    expect(
      await manager.device_id_claimed_by_other_account(THIRD, "dev-new"),
    ).toBe(false);
  });
});

describe("device ids belong to one account", () => {
  beforeEach(() => {
    store.clear();
    set_tauri(true);
  });

  afterEach(() => {
    set_tauri(false);
  });

  it("refuses to give an account a device id another account holds", async () => {
    seed([{ id: FIRST, device_id: "dev-first" }, { id: SECOND }]);
    const manager = await relaunch();

    expect(await manager.update_account_device_id(SECOND, "dev-first")).toBe(
      false,
    );
    expect(roster_row(SECOND)?.device_id).toBeUndefined();
    expect(await manager.update_account_device_id(SECOND, "dev-second")).toBe(
      true,
    );
    expect(roster_row(SECOND)?.device_id).toBe("dev-second");
  });
});
