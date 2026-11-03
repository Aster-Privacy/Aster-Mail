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
import type {
  CachedCalendarRow,
  CachedEventRow,
  SyncStoreAdapter,
} from "@/services/calendar/sync_store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-7",
}));

import {
  MemorySyncStore,
  clear_calendar_sync_cache,
  clear_sync_account,
  get_sync_store,
  read_cached_calendars,
  read_cached_events,
  read_queue,
  read_sync_meta,
  remove_queue_record,
  resolve_sync_account_id,
  set_sync_store_adapter,
  write_queue_record,
  write_sync_page,
} from "@/services/calendar/sync_store";

function event_row(id: string, calendar_id = "cal-1"): CachedEventRow {
  return {
    id,
    calendar_id,
    encrypted_blob: `blob-${id}`,
    blob_nonce: `nonce-${id}`,
    version: 1,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function calendar_row(id: string): CachedCalendarRow {
  return {
    id,
    encrypted_blob: `blob-${id}`,
    blob_nonce: `nonce-${id}`,
    is_visible: true,
    is_default: false,
    version: 1,
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function throwing_adapter(): SyncStoreAdapter {
  const fail = async () => {
    throw new Error("storage unavailable");
  };

  return {
    get_events: fail,
    get_calendars: fail,
    get_meta: fail,
    apply_page: fail,
    get_queue: fail,
    put_queue: fail,
    delete_queue: fail,
    clear_account: fail,
    clear_all: fail,
  };
}

let store: MemorySyncStore;

beforeEach(() => {
  store = new MemorySyncStore();
  set_sync_store_adapter(store);
});

afterEach(() => {
  set_sync_store_adapter(null);
});

describe("MemorySyncStore", () => {
  it("scopes rows per account", async () => {
    await store.apply_page("a", { events: [event_row("e1")] });
    await store.apply_page("b", { events: [event_row("e2")] });

    expect((await store.get_events("a")).map((row) => row.id)).toEqual(["e1"]);
    expect((await store.get_events("b")).map((row) => row.id)).toEqual(["e2"]);
  });

  it("applies deletes and merges meta across pages", async () => {
    await store.apply_page("a", {
      events: [event_row("e1"), event_row("e2")],
      calendars: [calendar_row("c1"), calendar_row("c2")],
      meta: { events_cursor: { server_time: "t1", cursor_id: null } },
    });
    await store.apply_page("a", {
      event_deletes: ["e1"],
      calendar_deletes: ["c2"],
      meta: { calendars_cursor: { server_time: "t2", cursor_id: "x" } },
    });

    expect((await store.get_events("a")).map((row) => row.id)).toEqual(["e2"]);
    expect((await store.get_calendars("a")).map((row) => row.id)).toEqual([
      "c1",
    ]);
    expect(await store.get_meta("a")).toEqual({
      events_cursor: { server_time: "t1", cursor_id: null },
      calendars_cursor: { server_time: "t2", cursor_id: "x" },
    });
    expect(await store.get_meta("missing")).toEqual({});
  });

  it("orders the queue by sequence and removes records", async () => {
    await store.put_queue("a", { id: "q2", seq: 2, payload: "second" });
    await store.put_queue("a", { id: "q1", seq: 1, payload: "first" });
    await store.put_queue("b", { id: "q3", seq: 0, payload: "other" });

    expect((await store.get_queue("a")).map((record) => record.id)).toEqual([
      "q1",
      "q2",
    ]);

    await store.delete_queue("a", "q1");

    expect((await store.get_queue("a")).map((record) => record.id)).toEqual([
      "q2",
    ]);
  });

  it("clears one account without touching the others", async () => {
    await store.apply_page("a", {
      events: [event_row("e1")],
      calendars: [calendar_row("c1")],
      meta: { events_cursor: { server_time: "t", cursor_id: null } },
    });
    await store.put_queue("a", { id: "q1", seq: 1, payload: null });
    await store.apply_page("b", { events: [event_row("e2")] });

    await store.clear_account("a");

    expect(await store.get_events("a")).toEqual([]);
    expect(await store.get_calendars("a")).toEqual([]);
    expect(await store.get_queue("a")).toEqual([]);
    expect(await store.get_meta("a")).toEqual({});
    expect(await store.get_events("b")).toHaveLength(1);

    await store.clear_all();

    expect(await store.get_events("b")).toEqual([]);
  });
});

describe("sync store wrappers", () => {
  it("round trips pages, meta, and queue records through the active adapter", async () => {
    expect(await write_sync_page("a", { events: [event_row("e1")] })).toBe(true);
    expect(
      await write_sync_page("a", {
        calendars: [calendar_row("c1")],
        meta: { events_cursor: { server_time: "t", cursor_id: null } },
      }),
    ).toBe(true);
    expect((await read_cached_events("a")).map((row) => row.id)).toEqual([
      "e1",
    ]);
    expect((await read_cached_calendars("a")).map((row) => row.id)).toEqual([
      "c1",
    ]);
    expect(await read_sync_meta("a")).toEqual({
      events_cursor: { server_time: "t", cursor_id: null },
    });

    expect(await write_queue_record("a", { id: "q1", seq: 1, payload: 1 })).toBe(
      true,
    );
    expect(await read_queue("a")).toHaveLength(1);
    expect(await remove_queue_record("a", "q1")).toBe(true);
    expect(await read_queue("a")).toEqual([]);

    expect(await clear_sync_account("a")).toBe(true);
    expect(await read_cached_events("a")).toEqual([]);
    expect(await clear_calendar_sync_cache()).toBe(true);
  });

  it("falls back to empty results when the adapter throws", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    set_sync_store_adapter(throwing_adapter());

    expect(await read_cached_events("a")).toEqual([]);
    expect(await read_cached_calendars("a")).toEqual([]);
    expect(await read_sync_meta("a")).toEqual({});
    expect(await read_queue("a")).toEqual([]);
    expect(await write_sync_page("a", {})).toBe(false);
    expect(await write_queue_record("a", { id: "q", seq: 0, payload: 0 })).toBe(
      false,
    );
    expect(await remove_queue_record("a", "q")).toBe(false);
    expect(await clear_sync_account("a")).toBe(false);
    expect(await clear_calendar_sync_cache()).toBe(false);

    warn.mockRestore();
  });

  it("creates an adapter on demand and keeps serving reads", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    set_sync_store_adapter(null);

    const adapter = get_sync_store();

    expect(adapter).not.toBe(store);
    expect(get_sync_store()).toBe(adapter);

    const written = await write_sync_page("a", { events: [event_row("e1")] });
    const rows = await read_cached_events("a");

    expect(typeof written).toBe("boolean");
    expect(Array.isArray(rows)).toBe(true);
    expect(Array.isArray(await read_queue("a"))).toBe(true);

    warn.mockRestore();
  });

  it("resolves the current account id and falls back to anonymous", async () => {
    expect(await resolve_sync_account_id()).toBe("acct-7");
  });
});
