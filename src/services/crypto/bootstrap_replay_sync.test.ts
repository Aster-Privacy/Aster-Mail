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

const h = vi.hoisted(() => ({
  vault: null as Record<string, unknown> | null,
  writes: [] as Array<{ next: Record<string, unknown>; base: unknown }>,
  status: "written" as string,
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("./vault_cas_write", () => ({
  write_vault_merged: vi.fn(
    async (request: { next: Record<string, unknown>; base: unknown }) => {
      h.writes.push(request);

      return { status: h.status };
    },
  ),
}));

import {
  BOOTSTRAP_REPLAY_FLUSH_DELAY_MS,
  flush_bootstrap_replay,
  pending_bootstrap_replay,
  queue_bootstrap_replay,
  vault_bootstrap_replay,
} from "./bootstrap_replay_sync";

const SENDER = "sender@example.com";

describe("bootstrap replay sync", () => {
  beforeEach(async () => {
    h.vault = { identity_key: "id" } as unknown as Record<string, unknown>;
    h.writes = [];
    h.status = "written";
    await flush_bootstrap_replay();
    h.writes = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the record for one sender from the vault", () => {
    h.vault = {
      bootstrap_replay: { [SENDER]: { f: 4, e: [{ k: "k", m: "m", t: 5 }] } },
    };

    expect(vault_bootstrap_replay(SENDER)).toEqual({
      f: 4,
      e: [{ k: "k", m: "m", t: 5 }],
    });
    expect(vault_bootstrap_replay("other@example.com")).toEqual({ f: 0, e: [] });
  });

  it("writes queued records merged into the vault", async () => {
    h.vault = {
      identity_key: "id",
      bootstrap_replay: { [SENDER]: { f: 2, e: [{ k: "k1", m: "m1", t: 3 }] } },
    };

    queue_bootstrap_replay(SENDER, { f: 0, e: [{ k: "k2", m: "m2", t: 4 }] });

    expect(await flush_bootstrap_replay()).toBe(true);
    expect(h.writes).toHaveLength(1);

    const [write] = h.writes;

    expect(write.base).toBe(h.vault);
    expect(write.next.identity_key).toBe("id");
    expect(write.next.bootstrap_replay).toEqual({
      [SENDER]: {
        f: 2,
        e: [
          { k: "k1", m: "m1", t: 3 },
          { k: "k2", m: "m2", t: 4 },
        ],
      },
    });
    expect(pending_bootstrap_replay().size).toBe(0);
  });

  it("keeps the queued record when the write does not land", async () => {
    h.status = "conflict";
    queue_bootstrap_replay(SENDER, { f: 0, e: [{ k: "k1", m: "m1", t: 3 }] });

    expect(await flush_bootstrap_replay()).toBe(false);
    expect(pending_bootstrap_replay().get(SENDER)?.e).toHaveLength(1);

    h.status = "written";

    expect(await flush_bootstrap_replay()).toBe(true);
    expect(pending_bootstrap_replay().size).toBe(0);
  });

  it("flushes on its own after the delay", async () => {
    vi.useFakeTimers();
    queue_bootstrap_replay(SENDER, { f: 0, e: [{ k: "k1", m: "m1", t: 3 }] });

    expect(h.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(BOOTSTRAP_REPLAY_FLUSH_DELAY_MS);

    expect(h.writes).toHaveLength(1);
  });
});
