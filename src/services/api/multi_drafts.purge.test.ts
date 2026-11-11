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

const del = vi.fn();
const get = vi.fn();
const note_purged_mail = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    delete: (...args: unknown[]) => del(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/services/search/index_removals", () => ({
  note_purged_mail: (...args: unknown[]) => note_purged_mail(...args),
}));

describe("draft deletion and the search index", () => {
  beforeEach(() => {
    del.mockReset();
    get.mockReset();
    note_purged_mail.mockReset();
  });

  it("leaves the search index alone when a draft is deleted", async () => {
    del.mockResolvedValue({ data: { success: true, deleted_count: 1 } });

    const { delete_draft } = await import("./multi_drafts");
    const result = await delete_draft("draft_1");

    expect(result.data?.success).toBe(true);
    expect(note_purged_mail).not.toHaveBeenCalled();
  });

  it("leaves the search index alone when the deletion fails", async () => {
    del.mockResolvedValue({ error: "offline", code: "NETWORK_ERROR" });

    const { delete_draft } = await import("./multi_drafts");
    const result = await delete_draft("draft_2");

    expect(result.data).toBeUndefined();
    expect(note_purged_mail).not.toHaveBeenCalled();
  });

  it("leaves the search index alone when a thread draft is deleted", async () => {
    del
      .mockResolvedValueOnce({ error: "missing", code: "NOT_FOUND" })
      .mockResolvedValueOnce({ data: { success: true, deleted_count: 1 } });
    get.mockResolvedValue({ data: { id: "draft_5" } });

    const { delete_thread_draft } = await import("./multi_drafts");

    await delete_thread_draft("draft_4", "thread_1");

    expect(del).toHaveBeenCalledTimes(2);
    expect(note_purged_mail).not.toHaveBeenCalled();
  });
});
