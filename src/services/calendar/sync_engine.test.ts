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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();
const identity_ok = vi.fn(async (_account_id: string) => true);

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

vi.mock("@/services/calendar/identity_guard", () => ({
  confirm_calendar_identity: (account_id: string) => identity_ok(account_id),
  reset_calendar_identity: () => undefined,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: () => "acct-1",
}));

vi.mock("@/services/api/sessions", () => ({
  list_sessions: async () => ({ data: { current_session_id: "sess-own" } }),
}));

const key_store = vi.hoisted(() => ({
  vault_present: true,
  listeners: new Set<() => void>(),
  account_key_load: Promise.resolve(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () =>
    key_store.vault_present ? { identity_key: "test-identity" } : null,
  on_keys_ready: (callback: () => void) => {
    key_store.listeners.add(callback);

    return () => {
      key_store.listeners.delete(callback);
    };
  },
  wait_for_account_key_load: () => key_store.account_key_load,
}));

vi.mock("@/services/calendar/calendar_crypto", () => ({
  CALENDAR_BLOB_FORMAT_V1: 1,
  CALENDAR_BLOB_FORMAT_V2: 2,
  CALENDAR_BLOB_FORMAT_V3: 3,
  calendar_v3_floor: () => false,
  encrypt_calendar_payload: async (payload: unknown) => ({
    ciphertext: JSON.stringify(payload),
    nonce: "nonce",
    format: 2,
    bound: true,
  }),
  decrypt_calendar_payload: async (record: { ciphertext: string }) => {
    const payload = JSON.parse(record.ciphertext);

    return {
      payload,
      format: payload.test_format === 1 ? 1 : 2,
      bound: payload.test_format !== 1 && payload.test_unbound !== true,
    };
  },
}));

const { calendar_sync_engine, handle_calendar_mutation_frame } =
  await import("@/services/calendar/sync_engine");
const { MemorySyncStore, read_sync_meta, set_sync_store_adapter } =
  await import("@/services/calendar/sync_store");

const ACCOUNT = "acct-1";

function event_blob(title: string) {
  return JSON.stringify({
    title,
    description: "",
    location: "",
    starts_at: "2026-10-09T09:00:00.000Z",
    ends_at: "2026-10-09T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    reminder_minutes: null,
  });
}

function server_event(id: string, title: string, version = 1) {
  return {
    id,
    calendar_id: "cal-1",
    encrypted_blob: event_blob(title),
    blob_nonce: `nonce-${id}`,
    created_at: "2026-10-09T08:00:00.000Z",
    updated_at: "2026-10-09T08:00:00.000Z",
    version,
  };
}

function cached_event(id: string, title: string, version = 1) {
  return {
    id,
    calendar_id: "cal-1",
    encrypted_blob: event_blob(title),
    blob_nonce: `nonce-${id}`,
    created_at: "2026-10-09T08:00:00.000Z",
    updated_at: "2026-10-09T08:00:00.000Z",
    version,
  };
}

function ok<T>(data: T) {
  return { data, error: null, status: 200 };
}

function empty_calendars() {
  return ok({
    calendars: [],
    total: 0,
    server_time: "2026-10-09T12:00:00.000Z",
    has_more: false,
  });
}

function set_online(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let store: InstanceType<typeof MemorySyncStore>;

beforeEach(() => {
  store = new MemorySyncStore();
  set_sync_store_adapter(store);
  calendar_sync_engine.reset();
  get.mockReset();
  post.mockReset();
  put.mockReset();
  patch.mockReset();
  del.mockReset();
  set_online(true);
  key_store.vault_present = true;
  key_store.account_key_load = Promise.resolve();
});

afterEach(() => {
  set_sync_store_adapter(null);
  set_online(true);
});

describe("calendar sync engine", () => {
  it("renders cached rows before the delta pull finishes", async () => {
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Cached standup")],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    get.mockImplementation(async () => {
      await gate;

      return empty_calendars();
    });

    const listener = vi.fn();

    calendar_sync_engine.subscribe(listener);
    const load = calendar_sync_engine.initial_load();

    await wait(10);

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Cached standup"]);
    expect(listener).toHaveBeenCalled();

    release();
    await load;
  });

  it("decrypts rows that arrived before the vault once keys are ready", async () => {
    key_store.vault_present = false;
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Early standup")],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get.mockImplementation(async () => empty_calendars());

    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);

    key_store.vault_present = true;
    key_store.listeners.forEach((callback) => callback());
    await wait(10);

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Early standup"]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("waits for the account key load before retrying failed rows", async () => {
    key_store.vault_present = false;
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Late key standup")],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get.mockImplementation(async () => empty_calendars());

    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);

    let finish_load: () => void = () => {};

    key_store.account_key_load = new Promise<void>((resolve) => {
      finish_load = resolve;
    });
    key_store.listeners.forEach((callback) => callback());
    await wait(10);

    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);

    key_store.vault_present = true;
    finish_load();
    await wait(10);

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Late key standup"]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("advances the events cursor only after every page is applied", async () => {
    get
      .mockResolvedValueOnce(empty_calendars())
      .mockResolvedValueOnce(
        ok({
          events: [server_event("evt-1", "First")],
          total: 2,
          server_time: "2026-10-09T12:00:00.000Z",
          has_more: true,
          next_cursor: "evt-1",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          events: [server_event("evt-2", "Second")],
          total: 2,
          server_time: "2026-10-09T12:05:00.000Z",
          has_more: false,
        }),
      );

    await calendar_sync_engine.initial_load();

    const urls = get.mock.calls.map((call) => String(call[0]));

    expect(urls[1]).toBe("/calendar/v1/events?limit=500");
    expect(urls[2]).toBe("/calendar/v1/events?limit=500&cursor=evt-1");

    const meta = await read_sync_meta(ACCOUNT);

    expect(meta.events_cursor).toEqual({
      server_time: "2026-10-09T12:00:00.000Z",
      cursor_id: null,
    });
    expect(
      calendar_sync_engine
        .get_events()
        .map((event) => event.title)
        .sort(),
    ).toEqual(["First", "Second"]);
  });

  it("keeps the page cursor id while more pages remain", async () => {
    await store.apply_page(ACCOUNT, {
      meta: {
        events_cursor: {
          server_time: new Date(Date.now() - 60_000).toISOString(),
          cursor_id: null,
        },
      },
    });
    get
      .mockResolvedValueOnce(empty_calendars())
      .mockResolvedValueOnce(
        ok({
          events: [server_event("evt-1", "First")],
          total: 2,
          server_time: "2026-10-09T12:00:00.000Z",
          has_more: true,
          cursor_id: "evt-1",
        }),
      )
      .mockResolvedValueOnce({
        data: null,
        error: "offline",
        code: "NETWORK_ERROR",
      })
      .mockResolvedValue(empty_calendars());

    const load = calendar_sync_engine.initial_load();

    await wait(50);

    const meta = await read_sync_meta(ACCOUNT);

    expect(meta.events_cursor).toEqual({
      server_time: "2026-10-09T12:00:00.000Z",
      cursor_id: "evt-1",
    });
    expect((await store.get_events(ACCOUNT)).map((row) => row.id)).toEqual([
      "evt-1",
    ]);

    await load;
  });

  it("removes a cached event when a tombstone arrives", async () => {
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Doomed", 2)],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get.mockResolvedValueOnce(empty_calendars()).mockResolvedValueOnce(
      ok({
        events: [
          {
            id: "evt-1",
            deleted: true,
            version: 3,
            updated_at: "2026-10-09T12:00:00.000Z",
          },
        ],
        total: 1,
        server_time: "2026-10-09T12:00:00.000Z",
        has_more: false,
      }),
    );

    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(await store.get_events(ACCOUNT)).toEqual([]);
  });

  it("ignores a tombstone older than the cached version", async () => {
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Survivor", 5)],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get.mockResolvedValueOnce(empty_calendars()).mockResolvedValueOnce(
      ok({
        events: [
          {
            id: "evt-1",
            deleted: true,
            version: 2,
            updated_at: "2026-10-09T12:00:00.000Z",
          },
        ],
        total: 1,
        server_time: "2026-10-09T12:00:00.000Z",
        has_more: false,
      }),
    );

    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.get_events().map((event) => event.id)).toEqual([
      "evt-1",
    ]);
  });

  it("ignores an upsert older than the cached version", async () => {
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-1", "Newer", 5)],
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get.mockResolvedValueOnce(empty_calendars()).mockResolvedValueOnce(
      ok({
        events: [
          {
            ...server_event("evt-1", "Older", 4),
            updated_at: "2026-10-09T12:00:00.000Z",
          },
        ],
        total: 1,
        server_time: "2026-10-09T12:00:00.000Z",
        has_more: false,
      }),
    );

    await calendar_sync_engine.initial_load();

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Newer"]);
    expect((await store.get_events(ACCOUNT))[0]?.version).toBe(5);
  });

  it("drops rows the server no longer returns on a full sync", async () => {
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-stale", "Stale")],
    });
    get.mockResolvedValueOnce(empty_calendars()).mockResolvedValueOnce(
      ok({
        events: [server_event("evt-live", "Live")],
        total: 1,
        server_time: "2026-10-09T12:00:00.000Z",
        has_more: false,
      }),
    );

    await calendar_sync_engine.initial_load();

    expect(String(get.mock.calls[1][0])).toBe("/calendar/v1/events?limit=500");
    expect(calendar_sync_engine.get_events().map((event) => event.id)).toEqual([
      "evt-live",
    ]);
  });

  it("ignores realtime frames from its own session", async () => {
    get.mockResolvedValue(empty_calendars());
    await calendar_sync_engine.initial_load();
    get.mockClear();

    await handle_calendar_mutation_frame({
      type: "calendar_mutation",
      action: "update",
      ids: ["evt-1"],
      origin_device: "sess-own",
    });
    await wait(400);

    expect(get).not.toHaveBeenCalled();
  });

  it("pulls a delta for frames from another device", async () => {
    get.mockResolvedValue(empty_calendars());
    await calendar_sync_engine.initial_load();
    get.mockClear();

    await handle_calendar_mutation_frame({
      type: "calendar_mutation",
      action: "update",
      ids: ["evt-1"],
      origin_device: "sess-other",
    });
    await handle_calendar_mutation_frame({
      type: "calendar_mutation",
      action: "update",
      ids: ["evt-2"],
      origin_device: "sess-other",
    });
    await wait(450);

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("refuses to pull when the server session belongs to another account", async () => {
    get.mockResolvedValue(empty_calendars());
    await calendar_sync_engine.initial_load();
    get.mockClear();
    identity_ok.mockResolvedValue(false);

    try {
      expect(await calendar_sync_engine.pull_delta()).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(identity_ok).toHaveBeenCalledWith(ACCOUNT);
    } finally {
      identity_ok.mockResolvedValue(true);
    }
  });

  it("skips the pull while offline and resumes on the online event", async () => {
    get.mockResolvedValue(empty_calendars());
    await calendar_sync_engine.initial_load();
    get.mockClear();
    set_online(false);

    expect(await calendar_sync_engine.pull_delta()).toBe(false);
    expect(get).not.toHaveBeenCalled();

    set_online(true);
    window.dispatchEvent(new Event("online"));
    await wait(50);

    expect(get).toHaveBeenCalled();
  });

  it("pulls again once rows newer than the sync horizon settle", async () => {
    const horizon = new Date(Date.now() - 120_000).toISOString();

    await store.apply_page(ACCOUNT, {
      meta: {
        events_cursor: { server_time: horizon, cursor_id: null },
        calendars_cursor: { server_time: horizon, cursor_id: null },
      },
    });
    get
      .mockResolvedValueOnce(
        ok({ calendars: [], total: 0, server_time: horizon, has_more: false }),
      )
      .mockResolvedValueOnce(
        ok({
          events: [
            {
              ...server_event("evt-1", "Fresh"),
              updated_at: new Date().toISOString(),
            },
          ],
          total: 1,
          server_time: horizon,
          has_more: false,
        }),
      )
      .mockResolvedValue(
        ok({
          calendars: [],
          events: [],
          total: 0,
          server_time: horizon,
          has_more: false,
        }),
      );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      await calendar_sync_engine.initial_load();

      expect(get).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(124_000);

      expect(get).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2_000);

      expect(get.mock.calls.length).toBeGreaterThan(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not pull again when every row is older than the sync horizon", async () => {
    const horizon = new Date(Date.now() - 120_000).toISOString();

    await store.apply_page(ACCOUNT, {
      meta: {
        events_cursor: { server_time: horizon, cursor_id: null },
        calendars_cursor: { server_time: horizon, cursor_id: null },
      },
    });
    get
      .mockResolvedValueOnce(
        ok({ calendars: [], total: 0, server_time: horizon, has_more: false }),
      )
      .mockResolvedValueOnce(
        ok({
          events: [server_event("evt-1", "Settled")],
          total: 1,
          server_time: horizon,
          has_more: false,
        }),
      );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      await calendar_sync_engine.initial_load();
      await vi.advanceTimersByTimeAsync(130_000);

      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the cursors after a 400 so the next pull is a full sync", async () => {
    await store.apply_page(ACCOUNT, {
      meta: {
        events_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
        calendars_cursor: {
          server_time: new Date().toISOString(),
          cursor_id: null,
        },
      },
    });
    get
      .mockResolvedValueOnce({ data: null, error: "bad cursor", status: 400 })
      .mockResolvedValue(empty_calendars());

    const load = calendar_sync_engine.initial_load();

    await wait(20);

    const meta = await read_sync_meta(ACCOUNT);

    expect(meta.events_cursor).toBeUndefined();
    expect(meta.calendars_cursor).toBeUndefined();

    await load;
  });
});

describe("calendar sync engine binding ledger", () => {
  function loose_blob(title: string, extra: Record<string, unknown>) {
    return JSON.stringify({ ...JSON.parse(event_blob(title)), ...extra });
  }

  function events_page(events: unknown[]) {
    return ok({
      events,
      total: events.length,
      server_time: "2026-10-09T12:00:00.000Z",
      has_more: false,
    });
  }

  function serve(events: unknown[]) {
    get.mockImplementation(async (url: unknown) =>
      String(url).includes("events") ? events_page(events) : empty_calendars(),
    );
  }

  it("reports the lowest format a write may use for a stored row", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.write_floor("evt-1")).toBe(2);
    expect(calendar_sync_engine.write_floor("evt-unknown")).toBe(1);
    expect(calendar_sync_engine.write_floor("evt-1", true)).toBe(1);
  });

  it("rejects an unbound blob for a row that was bound before", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Bound"]);
    expect((await read_sync_meta(ACCOUNT)).bound_event_ids).toEqual(["evt-1"]);

    serve([
      {
        ...server_event("evt-1", "Swapped", 2),
        encrypted_blob: loose_blob("Swapped", { test_unbound: true }),
      },
    ]);
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);

    await calendar_sync_engine.pull_delta();
    await calendar_sync_engine.retry_failed_decrypts();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });

  it("rejects an old format blob for a row that was bound before", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();
    serve([
      {
        ...server_event("evt-1", "Rolled back", 2),
        encrypted_blob: loose_blob("Rolled back", { test_format: 1 }),
      },
    ]);
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });

  it("keeps rejecting the swapped row after a reload from the cache", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();

    const swapped = {
      ...server_event("evt-1", "Swapped", 2),
      encrypted_blob: loose_blob("Swapped", { test_unbound: true }),
    };

    serve([swapped]);
    await calendar_sync_engine.pull_delta();
    calendar_sync_engine.reset();
    serve([swapped]);
    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });

  it("accepts a bound blob again after a rejected one", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();
    serve([
      {
        ...server_event("evt-1", "Swapped", 2),
        encrypted_blob: loose_blob("Swapped", { test_unbound: true }),
      },
    ]);
    await calendar_sync_engine.pull_delta();
    serve([server_event("evt-1", "Bound again", 3)]);
    await calendar_sync_engine.pull_delta();

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Bound again"]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("shows an unbound row that was never bound and queues it for migration", async () => {
    serve([
      {
        ...server_event("evt-1", "Fresh"),
        encrypted_blob: loose_blob("Fresh", { test_unbound: true }),
      },
    ]);
    await calendar_sync_engine.initial_load();

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Fresh"]);
    expect(
      calendar_sync_engine.legacy_event_rows().map((row) => row.id),
    ).toEqual(["evt-1"]);
    expect((await read_sync_meta(ACCOUNT)).bound_event_ids ?? []).toEqual([]);
  });

  it("keeps temp and pending rows out of the migration list", async () => {
    serve([
      {
        ...server_event("evt-1", "Fresh"),
        encrypted_blob: loose_blob("Fresh", { test_unbound: true }),
      },
      {
        ...server_event("evt-2", "Pending"),
        encrypted_blob: loose_blob("Pending", { test_unbound: true }),
      },
      {
        ...server_event("local-temp", "Temp"),
        encrypted_blob: loose_blob("Temp", { test_unbound: true }),
      },
    ]);
    calendar_sync_engine.set_pending_lookup((id) => id === "evt-2");
    await calendar_sync_engine.initial_load();

    expect(
      calendar_sync_engine.legacy_event_rows().map((row) => row.id),
    ).toEqual(["evt-1"]);
    calendar_sync_engine.set_pending_lookup(() => false);
  });

  it("accepts its own old format write and the echo of it", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();

    const own = {
      ...cached_event("evt-1", "Own write", 2),
      encrypted_blob: loose_blob("Own write", { test_format: 1 }),
    };

    await calendar_sync_engine.upsert_event_local(own);

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Own write"]);
    expect((await read_sync_meta(ACCOUNT)).bound_event_ids).toEqual([]);

    serve([own]);
    await calendar_sync_engine.pull_delta();
    calendar_sync_engine.reset();
    serve([own]);
    await calendar_sync_engine.initial_load();

    expect(
      calendar_sync_engine.get_events().map((event) => event.title),
    ).toEqual(["Own write"]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("keeps the binding record of a locally deleted row", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();
    await calendar_sync_engine.remove_event_local("evt-1");

    expect((await read_sync_meta(ACCOUNT)).bound_event_ids).toEqual(["evt-1"]);
  });

  it("rejects an unbound blob served for an id after its tombstone", async () => {
    serve([server_event("evt-1", "Bound")]);
    await calendar_sync_engine.initial_load();
    serve([{ ...server_event("evt-1", "Bound", 2), deleted: true }]);
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_events()).toEqual([]);

    serve([
      {
        ...server_event("evt-1", "Resurrected", 3),
        encrypted_blob: loose_blob("Resurrected", { test_unbound: true }),
      },
    ]);
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_events()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });
});

describe("calendar sync engine revision ledger", () => {
  function stamped(title: string, rev_at: number, version: number) {
    return {
      ...server_event("evt-1", title, version),
      encrypted_blob: JSON.stringify({
        ...JSON.parse(event_blob(title)),
        rev_at,
      }),
    };
  }

  function serve(events: unknown[]) {
    get.mockImplementation(async (url: unknown) =>
      String(url).includes("events")
        ? ok({
            events,
            total: events.length,
            server_time: "2026-10-09T12:00:00.000Z",
            has_more: false,
          })
        : empty_calendars(),
    );
  }

  function titles() {
    return calendar_sync_engine.get_events().map((event) => event.title);
  }

  it("rejects a server copy older than one this device has seen", async () => {
    serve([stamped("Newer", 2000, 2)]);
    await calendar_sync_engine.initial_load();

    expect(titles()).toEqual(["Newer"]);
    expect((await read_sync_meta(ACCOUNT)).event_revisions).toEqual({
      "evt-1": 2000,
    });

    serve([stamped("Older", 1000, 3)]);
    await calendar_sync_engine.pull_delta();

    expect(titles()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });

  it("keeps the good cached row when a rolled back copy is rejected", async () => {
    serve([stamped("Newer", 2000, 2)]);
    await calendar_sync_engine.initial_load();
    serve([stamped("Older", 1000, 3)]);
    await calendar_sync_engine.pull_delta();

    const rows = await store.get_events(ACCOUNT);

    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].encrypted_blob).title).toBe("Newer");
    expect(rows[0].version).toBe(2);
  });

  it("rejects a copy with no revision once a stamped copy was seen", async () => {
    serve([stamped("Stamped", 2000, 2)]);
    await calendar_sync_engine.initial_load();
    serve([server_event("evt-1", "Unstamped", 3)]);
    await calendar_sync_engine.pull_delta();

    expect(titles()).toEqual([]);
  });

  it("keeps rejecting the older copy after a reload from the cache", async () => {
    serve([stamped("Newer", 2000, 2)]);
    await calendar_sync_engine.initial_load();
    serve([stamped("Older", 1000, 3)]);
    await calendar_sync_engine.pull_delta();
    calendar_sync_engine.reset();
    serve([stamped("Older", 1000, 3)]);
    await calendar_sync_engine.initial_load();

    expect(titles()).toEqual([]);
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(1);
  });

  it("accepts the same or a newer revision", async () => {
    serve([stamped("First", 2000, 2)]);
    await calendar_sync_engine.initial_load();
    serve([stamped("Same", 2000, 3)]);
    await calendar_sync_engine.pull_delta();

    expect(titles()).toEqual(["Same"]);

    serve([stamped("Later", 3000, 4)]);
    await calendar_sync_engine.pull_delta();

    expect(titles()).toEqual(["Later"]);
  });

  it("reads unstamped rows when nothing newer was seen", async () => {
    serve([server_event("evt-1", "Legacy")]);
    await calendar_sync_engine.initial_load();

    expect(titles()).toEqual(["Legacy"]);
  });

  it("stamps each write above the newest revision it has seen", async () => {
    const { encrypt_event_draft } =
      await import("@/services/calendar/calendar_codec");
    const future = Date.now() + 60_000;

    serve([stamped("Future", future, 2)]);
    await calendar_sync_engine.initial_load();

    const draft = {
      ...JSON.parse(event_blob("Edit")),
      calendar_id: "cal-1",
    };
    const vault = { identity_key: "test-identity" } as never;
    const first = await encrypt_event_draft(draft, vault, "evt-1");
    const second = await encrypt_event_draft(draft, vault, "evt-1");

    expect(JSON.parse(first.encrypted_blob).rev_at).toBe(future + 1);
    expect(JSON.parse(second.encrypted_blob).rev_at).toBe(future + 2);
  });
});
