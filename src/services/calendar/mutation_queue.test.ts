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
import type { QueueEvent } from "@/services/calendar/mutation_queue";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();
const identity_ok = vi.fn(async (_account_id: string) => true);
const decrypt_bindings: Array<{ event_id?: string }> = [];

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

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "test-identity" }),
  on_keys_ready: () => () => undefined,
  wait_for_account_key_load: async () => undefined,
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
  decrypt_calendar_payload: async (
    record: { ciphertext: string },
    _vault: unknown,
    binding: { event_id?: string },
  ) => {
    decrypt_bindings.push(binding);

    return {
      payload: JSON.parse(record.ciphertext),
      format: 2,
      bound: true,
    };
  },
}));

const { calendar_sync_engine } =
  await import("@/services/calendar/sync_engine");
const { calendar_mutation_queue, generate_temp_id, subscribe_calendar_queue } =
  await import("@/services/calendar/mutation_queue");
const { MemorySyncStore, set_sync_store_adapter } =
  await import("@/services/calendar/sync_store");
const { next_revision } = await import("@/services/calendar/revision_ledger");

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

function stamped_blob(title: string, rev_at: number) {
  return JSON.stringify({ ...JSON.parse(event_blob(title)), rev_at });
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

function empty_page(key: "events" | "calendars") {
  return ok({
    [key]: [],
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

function create_op(title: string, temp_id = generate_temp_id()) {
  return {
    kind: "event_create" as const,
    temp_id,
    client_ref: temp_id,
    calendar_id: "cal-1",
    encrypted_blob: event_blob(title),
    blob_nonce: `nonce-${title}`,
  };
}

function update_op(
  event_id: string,
  title: string,
  expected_version: number | null,
) {
  return {
    kind: "event_update" as const,
    event_id,
    calendar_id: "cal-1",
    encrypted_blob: event_blob(title),
    blob_nonce: `nonce-${title}`,
    expected_version,
  };
}

let store: InstanceType<typeof MemorySyncStore>;
let events: QueueEvent[];
let unsubscribe: () => void;

async function seed_event(id: string, title: string, version = 1) {
  await store.apply_page(ACCOUNT, {
    events: [cached_event(id, title, version)],
    meta: {
      events_cursor: { server_time: new Date().toISOString(), cursor_id: null },
      calendars_cursor: {
        server_time: new Date().toISOString(),
        cursor_id: null,
      },
    },
  });
}

beforeEach(() => {
  store = new MemorySyncStore();
  set_sync_store_adapter(store);
  calendar_sync_engine.reset();
  calendar_mutation_queue.reset();
  events = [];
  decrypt_bindings.length = 0;
  unsubscribe = subscribe_calendar_queue((event) => events.push(event));
  get.mockReset();
  post.mockReset();
  put.mockReset();
  patch.mockReset();
  del.mockReset();
  get.mockImplementation(async (url: string) =>
    String(url).includes("/calendars")
      ? empty_page("calendars")
      : empty_page("events"),
  );
  set_online(true);
});

afterEach(() => {
  unsubscribe();
  calendar_mutation_queue.reset();
  set_sync_store_adapter(null);
  set_online(true);
});

describe("calendar mutation queue", () => {
  it("shows the offline notice again after an account switch", async () => {
    set_online(false);
    await calendar_mutation_queue.submit(create_op("Before switch"));
    calendar_mutation_queue.reset();
    events.length = 0;
    await calendar_mutation_queue.submit(create_op("After switch"));

    expect(events.some((event) => event.type === "queued_offline")).toBe(true);
  });

  it("holds queued changes while the server session belongs to another account", async () => {
    set_online(false);
    const op = create_op("Held change");

    await calendar_mutation_queue.submit(op);
    set_online(true);
    identity_ok.mockResolvedValue(false);

    try {
      await calendar_mutation_queue.flush();

      expect(post).not.toHaveBeenCalled();
      expect(calendar_mutation_queue.pending_count()).toBe(1);
      expect((await store.get_queue(ACCOUNT)).length).toBe(1);
    } finally {
      identity_ok.mockResolvedValue(true);
    }
  });

  it("queues an offline create, then flushes it and remaps the temp id", async () => {
    set_online(false);
    const op = create_op("Offline standup");
    const result = await calendar_mutation_queue.submit(op);

    expect(result.queued).toBe(true);
    expect(calendar_mutation_queue.pending_count()).toBe(1);
    expect(calendar_sync_engine.get_event(op.temp_id)?.title).toBe(
      "Offline standup",
    );
    expect(events.some((event) => event.type === "queued_offline")).toBe(true);
    expect(post).not.toHaveBeenCalled();
    expect((await store.get_queue(ACCOUNT)).length).toBe(1);

    post.mockResolvedValueOnce(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    set_online(true);
    await calendar_mutation_queue.flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ client_ref: op.temp_id });
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
    expect(calendar_sync_engine.get_event("evt-real")?.title).toBe(
      "Offline standup",
    );
    expect(calendar_sync_engine.get_event_row("evt-real")?.version).toBe(1);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(await store.get_queue(ACCOUNT)).toEqual([]);
    expect(events.some((event) => event.type === "drained")).toBe(true);
  });

  it("resolves an online create with the real id", async () => {
    post.mockResolvedValueOnce(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    const op = create_op("Online standup");
    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(false);
    expect(result.id_map[op.temp_id]).toBe("evt-real");
    expect(result.acks["evt-real"]?.version).toBe(1);
  });

  it("drops a create when the server returns a different id than the client chose", async () => {
    const op = {
      ...create_op("Swapped"),
      server_id: "6f8e3b40-ac3d-4e5f-9a21-3c4d5e6f7081",
    };

    post.mockResolvedValueOnce(
      ok({
        id: "7a9f4c51-bd4e-4f60-8b32-4d5e6f708192",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(false);
    expect(result.id_map).toEqual({});
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "rejected",
    });
  });

  it("maps a create to the client id when the ack omits the id", async () => {
    const op = {
      ...create_op("No echo"),
      server_id: "8b0a5d62-ce5f-4071-9c43-5e6f708192a3",
    };

    post.mockResolvedValueOnce(
      ok({ success: true, updated_at: "2026-10-09T12:00:00.000Z", version: 1 }),
    );
    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(true);
    expect(result.id_map[op.temp_id]).toBe(op.server_id);
    expect(result.acks[op.server_id]?.version).toBe(1);
  });

  it("drops a batch whose create ack carries a different id", async () => {
    const temp_id = generate_temp_id();

    post.mockResolvedValueOnce(
      ok({
        results: [
          {
            event_id: "ad2c7f84-e071-4293-9e65-708192a3b4c5",
            client_ref: temp_id,
            updated_at: "2026-10-09T12:00:00.000Z",
            version: 1,
          },
        ],
      }),
    );
    const result = await calendar_mutation_queue.submit({
      kind: "event_batch",
      operations: [
        {
          op: "create",
          temp_id,
          server_id: "9c1b6e73-df60-4182-8d54-6f708192a3b4",
          client_ref: temp_id,
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Batch swap"),
          blob_nonce: "nonce-batch-swap",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.id_map).toEqual({});
  });

  it("sends the expected version on updates and bumps it from the ack", async () => {
    await seed_event("evt-1", "Original", 4);
    put.mockResolvedValueOnce(
      ok({
        id: "evt-1",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 5,
      }),
    );

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Renamed", 4),
    );

    expect(result.ok).toBe(true);
    expect(put.mock.calls[0][0]).toBe("/calendar/v1/events/evt-1");
    expect(put.mock.calls[0][1]).toMatchObject({ expected_version: 4 });
    expect(calendar_sync_engine.get_event_row("evt-1")?.version).toBe(5);
    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Renamed");
  });

  it("flushes queued operations in order and rewrites temp ids in later ops", async () => {
    set_online(false);
    const op = create_op("Draft");

    await calendar_mutation_queue.submit(op);
    await calendar_mutation_queue.submit(
      update_op(op.temp_id, "Draft renamed", null),
    );
    expect(calendar_mutation_queue.pending_count()).toBe(2);

    post.mockResolvedValueOnce(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    put.mockResolvedValueOnce(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:01.000Z",
        version: 2,
      }),
    );
    set_online(true);
    await calendar_mutation_queue.flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe("/calendar/v1/events/evt-real");
    expect(put.mock.calls[0][1]).toMatchObject({ expected_version: 1 });
    expect(calendar_sync_engine.get_event("evt-real")?.title).toBe(
      "Draft renamed",
    );
    expect(calendar_sync_engine.get_event_row("evt-real")?.version).toBe(2);
  });

  it("cancels an unsynced create when the temp event is deleted offline", async () => {
    set_online(false);
    const op = create_op("Never sent");

    await calendar_mutation_queue.submit(op);
    await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: op.temp_id,
      expected_version: null,
    });
    await wait(0);

    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();

    set_online(true);
    await calendar_mutation_queue.flush();

    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes a create that may have reached the server instead of dropping it", async () => {
    post.mockResolvedValueOnce({
      data: null,
      error: "timeout",
      code: "NETWORK_ERROR",
    });
    const op = create_op("Landed");

    await calendar_mutation_queue.submit(op);
    expect(calendar_mutation_queue.pending_count()).toBe(1);

    set_online(false);
    await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: op.temp_id,
      expected_version: null,
    });
    await wait(0);

    expect(calendar_mutation_queue.pending_count()).toBe(2);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();

    set_online(true);
    post.mockResolvedValueOnce(
      ok({
        id: "evt-landed",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    del.mockResolvedValueOnce(
      ok({
        id: "evt-landed",
        success: true,
        updated_at: "2026-10-09T12:01:00.000Z",
        version: 2,
      }),
    );
    await calendar_mutation_queue.flush();

    expect(del).toHaveBeenCalledTimes(1);
    expect(String(del.mock.calls[0][0])).toContain("evt-landed");
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-landed")).toBeUndefined();
  });

  it("sends a delete for a temp id whose create already acked", async () => {
    post.mockResolvedValueOnce(
      ok({
        id: "evt-acked",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    const op = create_op("Acked");

    await calendar_mutation_queue.submit(op);
    expect(calendar_mutation_queue.pending_count()).toBe(0);

    del.mockResolvedValueOnce(
      ok({
        id: "evt-acked",
        success: true,
        updated_at: "2026-10-09T12:01:00.000Z",
        version: 2,
      }),
    );
    await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: op.temp_id,
      expected_version: null,
    });
    await calendar_mutation_queue.flush();

    expect(del).toHaveBeenCalledTimes(1);
    expect(String(del.mock.calls[0][0])).toContain("evt-acked");
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-acked")).toBeUndefined();
  });

  it("sends an update for a temp id whose create already acked", async () => {
    post.mockResolvedValueOnce(
      ok({
        id: "evt-acked-2",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    const op = create_op("Before");

    await calendar_mutation_queue.submit(op);

    put.mockResolvedValueOnce(
      ok({
        id: "evt-acked-2",
        success: true,
        updated_at: "2026-10-09T12:01:00.000Z",
        version: 2,
      }),
    );
    await calendar_mutation_queue.submit(update_op(op.temp_id, "After", null));
    await calendar_mutation_queue.flush();

    expect(put).toHaveBeenCalledTimes(1);
    expect(String(put.mock.calls[0][0])).toContain("evt-acked-2");
    expect(put.mock.calls[0][1]).toMatchObject({ expected_version: 1 });
    expect(calendar_mutation_queue.pending_count()).toBe(0);
  });

  it("decodes an optimistic batch create under its chosen server id", async () => {
    set_online(false);
    const temp_id = generate_temp_id();
    const server_id = "5e2c7f84-e071-4293-9e65-708192a3b4c5";

    await calendar_mutation_queue.submit({
      kind: "event_batch",
      operations: [
        {
          op: "create",
          temp_id,
          server_id,
          client_ref: temp_id,
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Detached"),
          blob_nonce: "nonce-detached",
        },
      ],
    });

    expect(decrypt_bindings.map((binding) => binding.event_id)).toContain(
      server_id,
    );
    expect(decrypt_bindings.map((binding) => binding.event_id)).not.toContain(
      temp_id,
    );
    expect(calendar_sync_engine.decrypt_failure_count()).toBe(0);
  });

  it("treats the chosen server id of a queued create as pending", async () => {
    set_online(false);
    const op = {
      ...create_op("Chosen"),
      server_id: "0d2c7f84-e071-4293-9e65-708192a3b4c5",
    };

    await calendar_mutation_queue.submit(op);

    expect(calendar_mutation_queue.is_pending(op.temp_id)).toBe(true);
    expect(calendar_mutation_queue.is_pending(op.server_id)).toBe(true);
    expect(calendar_mutation_queue.is_pending("evt-other")).toBe(false);
  });

  it("skips a delete whose create was dropped", async () => {
    post.mockResolvedValueOnce({
      data: null,
      error: "timeout",
      code: "NETWORK_ERROR",
    });
    const op = create_op("Dropped");

    await calendar_mutation_queue.submit(op);
    set_online(false);
    await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: op.temp_id,
      expected_version: null,
    });
    await wait(0);

    set_online(true);
    post.mockResolvedValueOnce({ data: null, error: "invalid", status: 400 });
    await calendar_mutation_queue.flush();

    expect(del).not.toHaveBeenCalled();
    expect(calendar_mutation_queue.pending_count()).toBe(0);
  });

  it("keeps the newer server copy when a sent create was edited elsewhere", async () => {
    const server_id = "1e3d8a95-f182-43a4-8f76-8192a3b4c5d6";
    const theirs = {
      id: server_id,
      calendar_id: "cal-1",
      encrypted_blob: event_blob("Theirs"),
      blob_nonce: "nonce-theirs",
      updated_at: "2026-10-09T12:30:00.000Z",
      version: 2,
    };
    const conflict = {
      data: null,
      error: "conflict",
      status: 409,
      body: { error: "conflict", event: theirs },
    };

    set_online(false);
    const op = { ...create_op("Mine"), server_id };

    await calendar_mutation_queue.submit(op);
    await calendar_mutation_queue.submit(
      update_op(op.temp_id, "Mine edited", null),
    );
    expect(calendar_mutation_queue.pending_count()).toBe(2);

    set_online(true);
    post.mockResolvedValueOnce(conflict);
    put.mockResolvedValueOnce(conflict);
    await calendar_mutation_queue.flush();

    expect(put).toHaveBeenCalledTimes(1);
    expect(String(put.mock.calls[0][0])).toContain(server_id);
    expect(put.mock.calls[0][1]).toMatchObject({ expected_version: 1 });
    expect(calendar_mutation_queue.get_conflicts()).toHaveLength(1);
    expect(calendar_sync_engine.get_event(server_id)?.title).toBe("Theirs");
    expect(calendar_sync_engine.get_event_row(server_id)?.version).toBe(2);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
  });

  it("surfaces a conflict on 409 and keep mine re-sends with the server version", async () => {
    await seed_event("evt-1", "Mine", 2);
    put.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-1",
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Theirs"),
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 7,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Mine edited", 2),
    );

    expect(result.queued).toBe(true);
    const conflicts = calendar_mutation_queue.get_conflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].target).toBe("event");
    expect(conflicts[0].local.title).toBe("Mine edited");
    expect(conflicts[0].server.title).toBe("Theirs");
    expect(conflicts[0].server_version).toBe(7);
    expect(events.some((event) => event.type === "conflicts_changed")).toBe(
      true,
    );

    put.mockResolvedValueOnce(
      ok({
        id: "evt-1",
        success: true,
        updated_at: "2026-10-09T12:31:00.000Z",
        version: 8,
      }),
    );
    await calendar_mutation_queue.resolve_conflict(
      conflicts[0].id,
      "keep_mine",
    );
    await wait(20);

    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][1]).toMatchObject({ expected_version: 7 });
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Mine edited");
    expect(calendar_sync_engine.get_event_row("evt-1")?.version).toBe(8);
  });

  it("keep mine re-sends with a revision above the server copy", async () => {
    const server_revision = Date.now() + 10 * 60_000;

    await seed_event("evt-k", "Mine", 2);
    put.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-k",
          calendar_id: "cal-1",
          encrypted_blob: stamped_blob("Theirs", server_revision),
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 7,
        },
      },
    });

    await calendar_mutation_queue.submit({
      ...update_op("evt-k", "Mine edited", 2),
      encrypted_blob: stamped_blob(
        "Mine edited",
        next_revision("event", "evt-k"),
      ),
    });

    const conflicts = calendar_mutation_queue.get_conflicts();

    expect(conflicts).toHaveLength(1);

    put.mockResolvedValueOnce(
      ok({
        id: "evt-k",
        success: true,
        updated_at: "2026-10-09T12:31:00.000Z",
        version: 8,
      }),
    );
    await calendar_mutation_queue.resolve_conflict(
      conflicts[0].id,
      "keep_mine",
    );
    await wait(20);

    const resent = JSON.parse(put.mock.calls[1][1].encrypted_blob);

    expect(put.mock.calls[1][1]).toMatchObject({ expected_version: 7 });
    expect(resent.title).toBe("Mine edited");
    expect(resent.rev_at).toBeGreaterThan(server_revision);
    expect(calendar_sync_engine.get_event("evt-k")?.title).toBe("Mine edited");
  });

  it("holds a 409 whose server copy cannot be read and asks instead of overwriting", async () => {
    await seed_event("evt-1", "Mine", 2);
    put.mockResolvedValue({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-1",
          calendar_id: "cal-1",
          encrypted_blob: "sealed-under-a-newer-key",
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 7,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Mine edited", 2),
    );

    expect(result.queued).toBe(true);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_mutation_queue.pending_count()).toBe(1);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await calendar_mutation_queue.flush();
    }

    expect(
      put.mock.calls.every(
        (call) =>
          (call[1] as { expected_version?: number }).expected_version === 2,
      ),
    ).toBe(true);
    const conflicts = calendar_mutation_queue.get_conflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].server.unreadable).toBe(true);
    expect(conflicts[0].server_version).toBe(7);
    put.mockReset();
  });

  it("use theirs discards the local change and applies the server row", async () => {
    await seed_event("evt-1", "Mine", 2);
    put.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-1",
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Theirs"),
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 7,
        },
      },
    });

    await calendar_mutation_queue.submit(update_op("evt-1", "Mine edited", 2));
    const [conflict] = calendar_mutation_queue.get_conflicts();

    await calendar_mutation_queue.resolve_conflict(conflict.id, "use_theirs");
    await wait(20);

    expect(put).toHaveBeenCalledTimes(1);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Theirs");
    expect(calendar_sync_engine.get_event_row("evt-1")?.version).toBe(7);
  });

  it("handles conflicts one at a time", async () => {
    await seed_event("evt-1", "One", 1);
    await store.apply_page(ACCOUNT, {
      events: [cached_event("evt-2", "Two", 1)],
    });
    const conflict_response = (id: string) => ({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id,
          calendar_id: "cal-1",
          encrypted_blob: event_blob(`${id} theirs`),
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 3,
        },
      },
    });

    set_online(false);
    await calendar_mutation_queue.submit(update_op("evt-1", "One mine", 1));
    await calendar_mutation_queue.submit(update_op("evt-2", "Two mine", 1));
    put.mockResolvedValueOnce(conflict_response("evt-1"));
    set_online(true);
    await calendar_mutation_queue.flush();

    expect(put).toHaveBeenCalledTimes(1);
    expect(calendar_mutation_queue.get_conflicts()).toHaveLength(1);
    expect(calendar_mutation_queue.pending_count()).toBe(2);

    put.mockResolvedValueOnce(conflict_response("evt-2"));
    await calendar_mutation_queue.resolve_conflict(
      calendar_mutation_queue.get_conflicts()[0].id,
      "use_theirs",
    );
    await wait(20);

    expect(put).toHaveBeenCalledTimes(2);
    expect(calendar_mutation_queue.get_conflicts()).toHaveLength(1);
    expect(calendar_mutation_queue.get_conflicts()[0].target_id).toBe("evt-2");
  });

  it("drops the operation on 404 and notifies", async () => {
    await seed_event("evt-gone", "Gone", 1);
    const full_sync = vi.spyOn(calendar_sync_engine, "request_full_sync");

    put.mockResolvedValueOnce({ data: null, error: "not found", status: 404 });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-gone", "Edit", 1),
    );

    expect(result.ok).toBe(false);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "not_found",
    });
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(full_sync).toHaveBeenCalledWith("event");
    full_sync.mockRestore();
  });

  it("drops a change the plan does not allow instead of retrying it", async () => {
    await seed_event("evt-plan", "Plan", 1);

    put.mockResolvedValueOnce({
      data: null,
      error: "limit",
      status: 403,
      code: "FORBIDDEN",
      server_code: "PLAN_LIMIT_EXCEEDED",
    });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-plan", "Edit", 1),
    );

    expect(result.ok).toBe(false);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "plan_limit",
    });
  });

  it("drops an operation whose 409 keeps naming a different record", async () => {
    await seed_event("evt-1", "Mine", 2);
    put.mockResolvedValue({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-other",
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Other"),
          blob_nonce: "nonce-other",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 9,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Mine edited", 2),
    );

    expect(result.queued).toBe(true);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await calendar_mutation_queue.flush();
    }

    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "rejected",
    });
    put.mockReset();
  });

  it("treats a 409 that already carries the sent blob as an ack", async () => {
    await seed_event("evt-1", "Mine", 2);
    const op = update_op("evt-1", "Mine edited", 2);

    put.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-1",
          calendar_id: "cal-1",
          encrypted_blob: op.encrypted_blob,
          blob_nonce: op.blob_nonce,
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 3,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(false);
    expect(result.acks["evt-1"]).toEqual({
      updated_at: "2026-10-09T12:30:00.000Z",
      version: 3,
    });
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event_row("evt-1")?.version).toBe(3);
    expect(events.some((event) => event.type === "conflicts_changed")).toBe(
      false,
    );
  });

  it("treats a 409 tombstone for a delete as an ack", async () => {
    await seed_event("evt-1", "Mine", 2);
    del.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: "evt-1",
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Theirs"),
          blob_nonce: "nonce-theirs",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 4,
          deleted: true,
        },
      },
    });

    const result = await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: "evt-1",
      expected_version: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(false);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-1")).toBeUndefined();
  });

  it("treats a 409 for a create that already landed as an ack", async () => {
    const op = {
      ...create_op("Landed"),
      server_id: "4d6c1f2e-8a1b-4c3d-9e0f-1a2b3c4d5e6f",
    };

    post.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: op.server_id,
          calendar_id: "cal-1",
          encrypted_blob: event_blob("Edited elsewhere"),
          blob_nonce: "nonce-elsewhere",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 2,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(true);
    expect(result.id_map[op.temp_id]).toBe(op.server_id);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
  });

  it("opens a conflict for a landed create whose server copy is older", async () => {
    const server_id = "6f7e3b4a-0c3d-4e5f-9a21-3c4d5e6f7082";

    await calendar_sync_engine.ensure_loaded();

    const revision = next_revision("event", server_id);
    const op = {
      ...create_op("Landed"),
      server_id,
      encrypted_blob: stamped_blob("Landed", revision),
    };

    post.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: server_id,
          calendar_id: "cal-1",
          encrypted_blob: stamped_blob("Replayed", revision - 60_000),
          blob_nonce: "nonce-replayed",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 2,
        },
      },
    });

    await calendar_mutation_queue.submit(op);

    expect(calendar_mutation_queue.get_conflicts()).toHaveLength(1);
    expect(calendar_mutation_queue.pending_count()).toBe(1);
    expect(calendar_sync_engine.get_event(server_id)).toBeUndefined();
  });

  it("shows the server copy again after the server rejects an edit", async () => {
    const server_row = {
      ...cached_event("evt-r", "Server", 3),
      encrypted_blob: stamped_blob("Server", 1000),
    };

    await store.apply_page(ACCOUNT, {
      events: [server_row],
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
    get.mockImplementation(async (url: string) =>
      String(url).includes("/calendars")
        ? empty_page("calendars")
        : ok({
            events: [server_row],
            total: 1,
            server_time: "2026-10-09T12:00:00.000Z",
            has_more: false,
          }),
    );
    await calendar_sync_engine.initial_load();

    expect(calendar_sync_engine.get_event("evt-r")?.title).toBe("Server");

    put.mockResolvedValueOnce({ data: null, error: "invalid", status: 400 });

    const result = await calendar_mutation_queue.submit({
      ...update_op("evt-r", "Mine", 3),
      encrypted_blob: stamped_blob("Mine", next_revision("event", "evt-r")),
    });

    await wait(50);
    await calendar_sync_engine.pull_delta();

    expect(result.ok).toBe(false);
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "rejected",
    });
    expect(calendar_sync_engine.get_event("evt-r")?.title).toBe("Server");
  });

  it("drops a create whose row was deleted on another device", async () => {
    const op = {
      ...create_op("Gone"),
      server_id: "5e7d2a3f-9b2c-4d4e-8f10-2b3c4d5e6f70",
    };

    post.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: {
        error: "conflict",
        event: {
          id: op.server_id,
          calendar_id: "cal-1",
          updated_at: "2026-10-09T12:30:00.000Z",
          version: 3,
          deleted: true,
        },
      },
    });

    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(false);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_mutation_queue.get_conflicts()).toEqual([]);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "not_found",
    });
  });

  it("drops a 409 without a server row instead of retrying forever", async () => {
    await seed_event("evt-1", "Mine", 2);
    const full_sync = vi.spyOn(calendar_sync_engine, "request_full_sync");

    put.mockResolvedValueOnce({
      data: null,
      error: "conflict",
      status: 409,
      body: { error: "conflict" },
    });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Edit", 2),
    );

    expect(result.ok).toBe(false);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "rejected",
    });
    expect(full_sync).toHaveBeenCalledWith("event");
    full_sync.mockRestore();
  });

  it("resyncs from the server after a rejected update of a saved event", async () => {
    await seed_event("evt-1", "Mine", 2);
    const full_sync = vi.spyOn(calendar_sync_engine, "request_full_sync");

    put.mockResolvedValueOnce({ data: null, error: "invalid", status: 400 });

    const result = await calendar_mutation_queue.submit(
      update_op("evt-1", "Too big", 2),
    );

    expect(result.ok).toBe(false);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(full_sync).toHaveBeenCalledWith("event");
    full_sync.mockRestore();
  });

  it("treats a 404 on delete as success", async () => {
    await seed_event("evt-gone", "Gone", 1);
    del.mockResolvedValueOnce({ data: null, error: "not found", status: 404 });

    const result = await calendar_mutation_queue.submit({
      kind: "event_delete",
      event_id: "evt-gone",
      expected_version: 1,
    });

    expect(result.ok).toBe(true);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event("evt-gone")).toBeUndefined();
    expect(events.some((event) => event.type === "dropped")).toBe(false);
  });

  it("drops a rejected create and removes the optimistic row", async () => {
    post.mockResolvedValueOnce({ data: null, error: "invalid", status: 400 });
    const op = create_op("Bad");
    const result = await calendar_mutation_queue.submit(op);

    expect(result.ok).toBe(false);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
    expect(events).toContainEqual({
      type: "dropped",
      target: "event",
      reason: "rejected",
    });
  });

  it("does not duplicate a send when flush is called twice", async () => {
    set_online(false);
    await calendar_mutation_queue.submit(create_op("Once"));
    post.mockResolvedValue(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    set_online(true);

    await Promise.all([
      calendar_mutation_queue.flush(),
      calendar_mutation_queue.flush(),
    ]);
    await calendar_mutation_queue.flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
  });

  it("keeps a create queued after a network failure and recovers it from the delta", async () => {
    post.mockResolvedValueOnce({
      data: null,
      error: "offline",
      code: "NETWORK_ERROR",
    });
    const op = create_op("Flaky");
    const result = await calendar_mutation_queue.submit(op);

    expect(result.queued).toBe(true);
    expect(calendar_mutation_queue.pending_count()).toBe(1);
    expect((await store.get_queue(ACCOUNT))[0].payload).toMatchObject({
      maybe_sent: true,
    });

    get.mockImplementation(async (url: string) =>
      String(url).includes("/calendars")
        ? empty_page("calendars")
        : ok({
            events: [
              {
                id: "evt-server",
                calendar_id: "cal-1",
                encrypted_blob: op.encrypted_blob,
                blob_nonce: op.blob_nonce,
                created_at: "2026-10-09T12:00:00.000Z",
                updated_at: "2026-10-09T12:00:00.000Z",
                version: 1,
              },
            ],
            total: 1,
            server_time: "2026-10-09T12:00:00.000Z",
            has_more: false,
          }),
    );
    await calendar_mutation_queue.flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(calendar_mutation_queue.pending_count()).toBe(0);
    expect(calendar_sync_engine.get_event(op.temp_id)).toBeUndefined();
    expect(calendar_sync_engine.get_event("evt-server")?.title).toBe("Flaky");
  });

  it("skips pending rows during a delta pull so optimistic edits survive", async () => {
    await seed_event("evt-1", "Server", 1);
    set_online(false);
    await calendar_mutation_queue.submit(update_op("evt-1", "Local edit", 1));
    get.mockImplementation(async (url: string) =>
      String(url).includes("/calendars")
        ? empty_page("calendars")
        : ok({
            events: [cached_event("evt-1", "Server newer", 2)],
            total: 1,
            server_time: "2026-10-09T12:00:00.000Z",
            has_more: false,
          }),
    );
    set_online(true);
    await calendar_sync_engine.pull_delta();

    expect(calendar_sync_engine.get_event("evt-1")?.title).toBe("Local edit");
  });

  it("sends calendar visibility through PATCH with the expected version", async () => {
    await store.apply_page(ACCOUNT, {
      calendars: [
        {
          id: "cal-1",
          encrypted_blob: JSON.stringify({ name: "Work", color: "#112233" }),
          blob_nonce: "nonce-cal",
          is_visible: true,
          is_default: true,
          version: 3,
          updated_at: "2026-10-09T08:00:00.000Z",
        },
      ],
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
    patch.mockResolvedValueOnce(
      ok({
        id: "cal-1",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 4,
      }),
    );

    await calendar_mutation_queue.submit({
      kind: "calendar_visibility",
      calendar_id: "cal-1",
      is_visible: false,
      expected_version: 3,
    });

    expect(patch.mock.calls[0][0]).toBe(
      "/calendar/v1/calendars/cal-1/visibility",
    );
    expect(patch.mock.calls[0][1]).toEqual({
      is_visible: false,
      expected_version: 3,
    });
    expect(calendar_sync_engine.get_calendar("cal-1")?.is_visible).toBe(false);
    expect(calendar_sync_engine.get_calendar_row("cal-1")?.version).toBe(4);
  });

  it("restores the persisted queue after a reload", async () => {
    set_online(false);
    const op = create_op("Persisted");

    await calendar_mutation_queue.submit(op);
    calendar_mutation_queue.reset();
    calendar_sync_engine.reset();

    post.mockResolvedValueOnce(
      ok({
        id: "evt-real",
        success: true,
        updated_at: "2026-10-09T12:00:00.000Z",
        version: 1,
      }),
    );
    set_online(true);
    await calendar_mutation_queue.ensure_loaded();

    expect(calendar_mutation_queue.pending_count()).toBe(1);
    expect(calendar_sync_engine.get_event(op.temp_id)?.title).toBe("Persisted");

    await calendar_mutation_queue.flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(calendar_sync_engine.get_event("evt-real")?.title).toBe("Persisted");
  });
});
