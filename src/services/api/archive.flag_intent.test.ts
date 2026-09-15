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

const post = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
  },
}));

const { batch_archive, batch_unarchive } = await import("./archive");
const { get_flag_intent, clear_all_read_intents } = await import(
  "@/services/read_intent"
);

beforeEach(() => {
  post.mockReset();
  clear_all_read_intents();
});

describe("archive flag intents", () => {
  it("masks server lag while the archive request is in flight", async () => {
    let resolve_post: ((value: unknown) => void) | null = null;

    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolve_post = resolve;
        }),
    );

    const pending = batch_archive({ ids: ["a"], tier: "hot" });

    expect(get_flag_intent("a", "is_archived")).toBe(true);

    resolve_post!({ data: { success: true, archived_count: 1 } });
    await pending;

    expect(get_flag_intent("a", "is_archived")).toBe(true);
  });

  it("drops the intent when the archive fails", async () => {
    post.mockResolvedValue({ error: "boom" });

    await batch_archive({ ids: ["a"], tier: "hot" });

    expect(get_flag_intent("a", "is_archived")).toBeUndefined();
  });

  it("drops the intent for the ids the server rejected", async () => {
    post.mockResolvedValue({
      data: { success: true, archived_count: 1, failed_ids: ["b"] },
    });

    await batch_archive({ ids: ["a", "b"], tier: "hot" });

    expect(get_flag_intent("a", "is_archived")).toBe(true);
    expect(get_flag_intent("b", "is_archived")).toBeUndefined();
  });

  it("flips the intent back when the archive is undone", async () => {
    post.mockResolvedValue({ data: { success: true, archived_count: 1 } });
    await batch_archive({ ids: ["a"], tier: "hot" });

    post.mockResolvedValue({ data: { success: true, unarchived_count: 1 } });
    await batch_unarchive({ ids: ["a"] });

    expect(get_flag_intent("a", "is_archived")).toBe(false);
  });
});
