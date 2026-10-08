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

const api_mock = vi.hoisted(() => ({
  trash_thread: vi.fn(),
  restore_mail_item: vi.fn(),
}));

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(async (ids: string[]) => ({
    success: true,
    updated_count: ids.length,
    failed_ids: [] as string[],
  })),
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: api_mock.trash_thread,
  restore_mail_item: api_mock.restore_mail_item,
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: metadata_mock.bulk_update_metadata_by_ids,
}));

vi.mock("@/lib/ignore_error", () => ({
  ignore_error: vi.fn(),
}));

import { set_thread_trashed, restore_item_from_trash } from "./trash_state";

describe("trash_state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("set_thread_trashed", () => {
    it("rewrites the blob for the server ids merged with the known ids", async () => {
      api_mock.trash_thread.mockResolvedValueOnce({
        data: { trashed: 3, ids: ["m2", "m3"] },
      });

      const result = await set_thread_trashed("thread-1", ["m1", "m2"], false);

      expect(api_mock.trash_thread).toHaveBeenCalledWith("thread-1", false);
      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [["m2", "m3", "m1"], { is_trashed: false }],
      ]);
      expect(result.data?.trashed).toBe(3);
    });

    it("falls back to the known ids when the server sends none", async () => {
      api_mock.trash_thread.mockResolvedValueOnce({ data: { trashed: 1 } });

      await set_thread_trashed("thread-1", ["m1"], true);

      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [["m1"], { is_trashed: true }],
      ]);
    });

    it("writes nothing when the server call fails", async () => {
      api_mock.trash_thread.mockResolvedValueOnce({
        data: null,
        error: "offline",
      });

      const result = await set_thread_trashed("thread-1", ["m1"], false);

      expect(metadata_mock.bulk_update_metadata_by_ids).not.toHaveBeenCalled();
      expect(result.error).toBe("offline");
    });

    it("still returns the server result when the blob write throws", async () => {
      api_mock.trash_thread.mockResolvedValueOnce({
        data: { trashed: 1, ids: ["m1"] },
      });
      metadata_mock.bulk_update_metadata_by_ids.mockRejectedValueOnce(
        new Error("no key"),
      );

      const result = await set_thread_trashed("thread-1", [], false);

      expect(result.data?.trashed).toBe(1);
    });
  });

  describe("restore_item_from_trash", () => {
    it("clears the trash flag on every restored id", async () => {
      api_mock.restore_mail_item.mockResolvedValueOnce({
        data: { success: true, restored_count: 1, restored_ids: ["m1"] },
      });

      await restore_item_from_trash("m1", ["m1"], { target: "inbox" });

      expect(api_mock.restore_mail_item).toHaveBeenCalledWith("m1", {
        target: "inbox",
      });
      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [["m1"], { is_trashed: false }],
      ]);
    });

    it("also sets the archive flag when restoring to the archive", async () => {
      api_mock.restore_mail_item.mockResolvedValueOnce({
        data: { success: true, restored_count: 1, restored_ids: ["m1"] },
      });

      await restore_item_from_trash("m1", ["m1", "m2"], { target: "archive" });

      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [["m1", "m2"], { is_trashed: false, is_archived: true }],
      ]);
    });

    it("writes nothing when the restore is rejected", async () => {
      api_mock.restore_mail_item.mockResolvedValueOnce({
        data: null,
        error: "not found",
      });

      await restore_item_from_trash("m1", ["m1"]);

      expect(metadata_mock.bulk_update_metadata_by_ids).not.toHaveBeenCalled();
    });
  });
});
