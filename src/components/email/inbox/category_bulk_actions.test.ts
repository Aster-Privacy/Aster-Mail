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

vi.mock("@/services/api/archive", () => ({
  batch_archive: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  get_category_action_ids: vi.fn(),
  is_fully_built: vi.fn(),
  is_index_capped: vi.fn(),
  remove_ids: vi.fn(),
  reindex_ids: vi.fn(),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  stale_all_view_caches: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

import { batch_archive } from "@/services/api/archive";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import {
  get_category_action_ids,
  is_fully_built,
  is_index_capped,
  remove_ids,
  reindex_ids,
} from "@/services/category_index";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  run_category_scope_action,
  CATEGORY_ACTION_CHUNK_SIZE,
} from "./category_bulk_actions";

const mock_batch_archive = vi.mocked(batch_archive);
const mock_bulk_update = vi.mocked(bulk_update_metadata_by_ids);
const mock_action_ids = vi.mocked(get_category_action_ids);
const mock_fully_built = vi.mocked(is_fully_built);
const mock_capped = vi.mocked(is_index_capped);
const mock_remove_ids = vi.mocked(remove_ids);
const mock_reindex_ids = vi.mocked(reindex_ids);

function make_ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id_${i}`);
}

function set_index(ids: string[]) {
  mock_action_ids.mockReturnValue({
    rep_ids: ids.slice(0, Math.min(ids.length, 50)),
    all_ids: ids,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock_fully_built.mockReturnValue(true);
  mock_capped.mockReturnValue(false);
  mock_batch_archive.mockResolvedValue({
    data: { success: true, archived_count: 0, total_size_bytes: 0 },
  });
  mock_bulk_update.mockResolvedValue({
    success: true,
    updated_count: 0,
    failed_ids: [],
  });
});

describe("run_category_scope_action", () => {
  it("returns not_ready when the index is not built", async () => {
    mock_fully_built.mockReturnValue(false);

    const outcome = await run_category_scope_action("trash", "primary");

    expect(outcome).toBe("not_ready");
    expect(mock_bulk_update).not.toHaveBeenCalled();
    expect(mock_batch_archive).not.toHaveBeenCalled();
  });

  it("refuses destructive actions when the index is capped", async () => {
    mock_capped.mockReturnValue(true);
    set_index(make_ids(3));

    for (const action of ["trash", "archive", "mark_spam"] as const) {
      const outcome = await run_category_scope_action(action, "primary");

      expect(outcome).toBe("not_ready");
    }
    expect(mock_bulk_update).not.toHaveBeenCalled();
    expect(mock_batch_archive).not.toHaveBeenCalled();
  });

  it("refuses non-destructive actions when the index is capped", async () => {
    mock_capped.mockReturnValue(true);
    set_index(make_ids(3));

    for (const action of ["mark_read", "mark_unread", "star"] as const) {
      const outcome = await run_category_scope_action(action, "primary");

      expect(outcome).toBe("not_ready");
    }
    expect(mock_bulk_update).not.toHaveBeenCalled();
  });

  it("returns noop for an empty tab", async () => {
    set_index([]);

    const outcome = await run_category_scope_action("trash", "primary");

    expect(outcome).toBe("noop");
    expect(mock_bulk_update).not.toHaveBeenCalled();
  });

  it("trashes every indexed message including thread siblings beyond the loaded page", async () => {
    const all_ids = make_ids(250);

    set_index(all_ids);

    const outcome = await run_category_scope_action("trash", "primary");

    expect(outcome).toBe("done");

    const sent_ids = mock_bulk_update.mock.calls.flatMap((c) => c[0]);

    expect(sent_ids).toEqual(all_ids);
    for (const call of mock_bulk_update.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(CATEGORY_ACTION_CHUNK_SIZE);
      expect(call[1]).toEqual({ is_trashed: true });
    }

    const removed = mock_remove_ids.mock.calls.flatMap((c) => c[0]);

    expect(removed).toEqual(all_ids);
    expect(vi.mocked(invalidate_mail_stats)).toHaveBeenCalled();
    expect(vi.mocked(stale_all_view_caches)).toHaveBeenCalled();
  });

  it("archives through the batch endpoint before the blob write", async () => {
    const all_ids = make_ids(150);
    const call_order: string[] = [];

    set_index(all_ids);
    mock_batch_archive.mockImplementation(async () => {
      call_order.push("batch");

      return {
        data: { success: true, archived_count: 0, total_size_bytes: 0 },
      };
    });
    mock_bulk_update.mockImplementation(async () => {
      call_order.push("blob");

      return { success: true, updated_count: 0, failed_ids: [] };
    });

    const outcome = await run_category_scope_action("archive", "primary");

    expect(outcome).toBe("done");
    expect(call_order).toEqual(["batch", "blob", "batch", "blob"]);
    expect(mock_batch_archive).toHaveBeenCalledWith({
      ids: all_ids.slice(0, 100),
      tier: "hot",
    });
    expect(mock_batch_archive).toHaveBeenCalledWith({
      ids: all_ids.slice(100),
      tier: "hot",
    });
    expect(mock_remove_ids.mock.calls.flatMap((c) => c[0])).toEqual(all_ids);
  });

  it("throws and stops when the archive batch endpoint fails", async () => {
    set_index(make_ids(150));
    mock_batch_archive.mockResolvedValue({ error: "boom" });

    await expect(
      run_category_scope_action("archive", "primary"),
    ).rejects.toThrow();
    expect(mock_remove_ids).not.toHaveBeenCalled();
    expect(mock_bulk_update).not.toHaveBeenCalled();
    expect(vi.mocked(invalidate_mail_stats)).not.toHaveBeenCalled();
  });

  it("reindexes a chunk whose blob write fails after a successful archive", async () => {
    const all_ids = make_ids(30);

    set_index(all_ids);
    mock_bulk_update.mockResolvedValue({
      success: false,
      updated_count: 0,
      failed_ids: all_ids,
    });

    const outcome = await run_category_scope_action("archive", "primary");

    expect(outcome).toBe("done");
    expect(mock_reindex_ids).toHaveBeenCalledWith(all_ids);
  });

  it("only removes ids that succeeded on a partial trash failure", async () => {
    const all_ids = make_ids(10);

    set_index(all_ids);
    mock_bulk_update.mockResolvedValue({
      success: false,
      updated_count: 8,
      failed_ids: ["id_3", "id_7"],
    });

    await expect(
      run_category_scope_action("trash", "primary"),
    ).rejects.toThrow();

    const removed = mock_remove_ids.mock.calls.flatMap((c) => c[0]);

    expect(removed).toEqual(all_ids.filter((id) => id !== "id_3" && id !== "id_7"));
  });

  it("marks spam with is_spam and removes ids from the index", async () => {
    const all_ids = make_ids(5);

    set_index(all_ids);

    const outcome = await run_category_scope_action("mark_spam", "primary");

    expect(outcome).toBe("done");
    expect(mock_bulk_update).toHaveBeenCalledWith(all_ids, {
      is_spam: true,
      is_trashed: false,
    });
    expect(mock_remove_ids.mock.calls.flatMap((c) => c[0])).toEqual(all_ids);
  });

  it("reindexes after read and star updates instead of removing", async () => {
    const all_ids = make_ids(120);

    set_index(all_ids);

    await run_category_scope_action("mark_unread", "primary");

    expect(mock_bulk_update).toHaveBeenCalledWith(all_ids.slice(0, 100), {
      is_read: false,
    });
    expect(mock_remove_ids).not.toHaveBeenCalled();
    expect(mock_reindex_ids).toHaveBeenCalledWith(all_ids);

    vi.clearAllMocks();
    mock_fully_built.mockReturnValue(true);
    mock_capped.mockReturnValue(false);
    set_index(all_ids);
    mock_bulk_update.mockResolvedValue({
      success: true,
      updated_count: 0,
      failed_ids: [],
    });

    await run_category_scope_action("star", "primary");

    expect(mock_bulk_update).toHaveBeenCalledWith(all_ids.slice(0, 100), {
      is_starred: true,
    });
    expect(mock_reindex_ids).toHaveBeenCalledWith(all_ids);
  });

  it("reports progress from zero through the full message count", async () => {
    const all_ids = make_ids(250);
    const progress: Array<[number, number]> = [];

    set_index(all_ids);

    await run_category_scope_action("trash", "primary", {
      on_progress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress[0]).toEqual([0, 250]);
    expect(progress[progress.length - 1]).toEqual([250, 250]);
    for (const [, total] of progress) {
      expect(total).toBe(250);
    }
  });
});
