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
import { describe, it, expect, beforeEach, vi } from "vitest";

const DELETE_SYNC_TOKEN_PREFIX = "aster_delete_sync_token_";
const account_id = "account-1";

function storage_key(): string {
  return `${DELETE_SYNC_TOKEN_PREFIX}${account_id}`;
}

interface SyncResult {
  deleted_ids?: string[];
  sync_token?: string;
}

function make_pruner(
  entries: Map<string, unknown>,
  sync: () => Promise<{ data: SyncResult | null }>,
  mark_dirty: (id: string) => void,
) {
  return async function prune_server_deletions(): Promise<boolean> {
    const key = storage_key();

    try {
      const since = localStorage.getItem(key);

      if (!since) {
        localStorage.setItem(key, new Date().toISOString());

        return false;
      }

      const response = await sync();
      const data = response?.data;

      if (!data) return false;

      let changed = false;

      for (const id of data.deleted_ids ?? []) {
        if (entries.delete(id)) {
          mark_dirty(id);
          changed = true;
        }
      }

      if (data.sync_token) localStorage.setItem(key, data.sync_token);

      return changed;
    } catch {
      return false;
    }
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("server deletion pruning", () => {
  it("seeds the token on first run without pruning anything", async () => {
    const entries = new Map<string, unknown>([["a", {}]]);
    const sync = vi.fn();
    const prune = make_pruner(entries, sync as never, () => {});

    expect(await prune()).toBe(false);
    expect(sync).not.toHaveBeenCalled();
    expect(entries.has("a")).toBe(true);
    expect(localStorage.getItem(storage_key())).toBeTruthy();
  });

  it("removes only ids the server reports as deleted", async () => {
    localStorage.setItem(storage_key(), "2026-07-01T00:00:00.000Z");

    const entries = new Map<string, unknown>([
      ["a", {}],
      ["b", {}],
      ["c", {}],
    ]);
    const dirty: string[] = [];
    const prune = make_pruner(
      entries,
      async () => ({
        data: { deleted_ids: ["a", "c"], sync_token: "2026-07-02T00:00:00Z" },
      }),
      (id) => dirty.push(id),
    );

    expect(await prune()).toBe(true);
    expect([...entries.keys()]).toEqual(["b"]);
    expect(dirty.sort()).toEqual(["a", "c"]);
    expect(localStorage.getItem(storage_key())).toBe("2026-07-02T00:00:00Z");
  });

  it("advances the token even when nothing local matched", async () => {
    localStorage.setItem(storage_key(), "2026-07-01T00:00:00.000Z");

    const entries = new Map<string, unknown>([["b", {}]]);
    const prune = make_pruner(
      entries,
      async () => ({
        data: { deleted_ids: ["zzz"], sync_token: "2026-07-03T00:00:00Z" },
      }),
      () => {},
    );

    expect(await prune()).toBe(false);
    expect(entries.has("b")).toBe(true);
    expect(localStorage.getItem(storage_key())).toBe("2026-07-03T00:00:00Z");
  });

  it("keeps the previous token when the request fails", async () => {
    localStorage.setItem(storage_key(), "2026-07-01T00:00:00.000Z");

    const entries = new Map<string, unknown>([["a", {}]]);
    const prune = make_pruner(
      entries,
      async () => {
        throw new Error("network down");
      },
      () => {},
    );

    expect(await prune()).toBe(false);
    expect(entries.has("a")).toBe(true);
    expect(localStorage.getItem(storage_key())).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });
});
