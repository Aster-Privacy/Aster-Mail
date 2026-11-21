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
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  vault: null as Record<string, unknown> | null,
  written: [] as Record<string, unknown>[],
}));

vi.mock("./memory_key_store", () => ({
  get_last_vault_owner_id: () => "user-a",
  get_vault_from_memory: () => state.vault,
  has_vault_in_memory_for: () => true,
}));

vi.mock("./vault_cas_write", () => ({
  write_vault_merged: async ({ next }: { next: Record<string, unknown> }) => {
    state.written.push(next);

    return { status: "written", vault: next };
  },
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock_bounded: <T>(run: () => Promise<T>) => run(),
}));

vi.mock("./storage_rotation/vault_step", () => ({ VAULT_LOCK_WAIT_MS: 1 }));

import { ensure_untagged_snapshot } from "./scheduled_untagged_allowlist";

const NOW = Date.parse("2026-11-18T00:00:00.000Z");

describe("first scheduled snapshot when the vault holds one it cannot read", () => {
  beforeEach(() => {
    state.vault = {
      identity_key: "k",
      scheduled_untagged: { v: 2, at: "2026-11-01T00:00:00.000Z", ids: ["a"] },
    };
    state.written = [];
  });

  it("opens nothing and keeps the vault as it is", async () => {
    const list_ids = vi.fn(async () => ["a", "planted"]);
    const snapshot = await ensure_untagged_snapshot({
      list_ids,
      now: () => NOW,
    });

    expect(snapshot?.ids ?? []).toEqual([]);
    expect(list_ids).not.toHaveBeenCalled();
    expect(state.written).toHaveLength(0);
  });
});
