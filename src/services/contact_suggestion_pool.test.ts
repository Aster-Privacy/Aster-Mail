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

const list_contacts = vi.fn();
const decrypt_contacts = vi.fn();
const get_contacts_encryption_key = vi.fn();
const vault_cleared_callbacks: Array<() => void> = [];
const keys_ready_callbacks: Array<() => void> = [];

vi.mock("@/services/api/contacts", () => ({
  list_contacts: (...args: unknown[]) => list_contacts(...args),
  decrypt_contacts: (...args: unknown[]) => decrypt_contacts(...args),
  get_contacts_encryption_key: () => get_contacts_encryption_key(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_keys_ready: (callback: () => void) => {
    keys_ready_callbacks.push(callback);

    return () => undefined;
  },
  on_vault_cleared: (callback: () => void) => {
    vault_cleared_callbacks.push(callback);

    return () => undefined;
  },
}));

type PoolModule = typeof import("./contact_suggestion_pool");

function contact(id: string, extra: Record<string, unknown> = {}) {
  return { id, emails: [`${id}@example.com`], ...extra };
}

function page(items: unknown[], next_cursor?: string) {
  return {
    data: {
      items,
      has_more: !!next_cursor,
      next_cursor: next_cursor ?? null,
    },
  };
}

async function load(): Promise<PoolModule> {
  vi.resetModules();

  return import("./contact_suggestion_pool");
}

beforeEach(() => {
  list_contacts.mockReset();
  decrypt_contacts.mockReset();
  get_contacts_encryption_key.mockReset();
  get_contacts_encryption_key.mockResolvedValue({});
  decrypt_contacts.mockImplementation(async (items: unknown[]) => items);
  vault_cleared_callbacks.length = 0;
  keys_ready_callbacks.length = 0;
  vi.useRealTimers();
});

describe("load_suggestion_pool", () => {
  it("pages past the first hundred contacts and skips trashed ones", async () => {
    const first = Array.from({ length: 200 }, (_, i) => contact(`a${i}`));
    const second = [
      contact("late"),
      contact("binned", { deleted_at: "2026-09-01T00:00:00Z" }),
    ];

    list_contacts
      .mockResolvedValueOnce(page(first, "next"))
      .mockResolvedValueOnce(page(second));

    const mod = await load();
    const pool = await mod.load_suggestion_pool();

    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(list_contacts.mock.calls[1][0]).toMatchObject({ cursor: "next" });
    expect(pool).toHaveLength(201);
    expect(pool.some((item) => item.id === "late")).toBe(true);
    expect(pool.some((item) => item.id === "binned")).toBe(false);
  });

  it("serves the cache until contacts change", async () => {
    list_contacts.mockResolvedValue(page([contact("one")]));

    const mod = await load();

    await mod.load_suggestion_pool();
    await mod.load_suggestion_pool();
    expect(list_contacts).toHaveBeenCalledTimes(1);

    const listener = vi.fn();

    mod.subscribe_suggestion_pool(listener);
    list_contacts.mockResolvedValue(page([contact("one"), contact("two")]));

    const { emit_contacts_changed } = await import("@/hooks/mail_events");

    vi.useFakeTimers();
    emit_contacts_changed();
    emit_contacts_changed();
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(mod.SUGGESTION_POOL_STALE_DEBOUNCE_MS);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    const refreshed = await mod.load_suggestion_pool();

    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(refreshed.map((item) => item.id)).toEqual(["one", "two"]);
  });

  it("drops the cached pool when the vault is cleared", async () => {
    list_contacts.mockResolvedValue(page([contact("one")]));

    const mod = await load();

    await mod.load_suggestion_pool();
    expect(mod.get_cached_suggestion_pool()).toHaveLength(1);

    vault_cleared_callbacks.forEach((callback) => callback());
    expect(mod.get_cached_suggestion_pool()).toBeNull();
  });

  it("keeps the previous pool when a refresh fails", async () => {
    list_contacts.mockResolvedValueOnce(page([contact("one")]));

    const mod = await load();

    await mod.load_suggestion_pool();
    mod.mark_suggestion_pool_stale();
    list_contacts.mockResolvedValueOnce({ error: "offline" });

    const pool = await mod.load_suggestion_pool();

    expect(pool.map((item) => item.id)).toEqual(["one"]);
  });

  it("stops paging a fetch that contacts changes made stale", async () => {
    const gate: { release?: () => void } = {};

    list_contacts
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            gate.release = () => resolve(page([contact("old")], "next"));
          }),
      )
      .mockResolvedValue(page([contact("fresh")]));

    const mod = await load();
    const first = mod.load_suggestion_pool();

    await vi.waitFor(() => expect(gate.release).toBeDefined());
    mod.mark_suggestion_pool_stale();

    const second = mod.load_suggestion_pool();

    gate.release?.();
    await first;

    expect((await second).map((item) => item.id)).toEqual(["fresh"]);
    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(mod.get_cached_suggestion_pool()?.map((item) => item.id)).toEqual([
      "fresh",
    ]);
  });

  it("reloads once keys are ready after a locked start", async () => {
    get_contacts_encryption_key.mockRejectedValueOnce(new Error("locked"));
    list_contacts.mockResolvedValue(page([contact("one")]));

    const mod = await load();
    const listener = vi.fn();

    mod.subscribe_suggestion_pool(listener);
    expect(await mod.load_suggestion_pool()).toEqual([]);

    keys_ready_callbacks.forEach((callback) => callback());
    expect(listener).toHaveBeenCalledTimes(1);

    const pool = await mod.load_suggestion_pool();

    expect(pool.map((item) => item.id)).toEqual(["one"]);
  });

  it("asks the server for pages it will actually return", async () => {
    list_contacts.mockResolvedValue(page([contact("one")]));

    const mod = await load();

    await mod.load_suggestion_pool();
    expect(list_contacts.mock.calls[0][0]).toMatchObject({ limit: 100 });
  });
});
