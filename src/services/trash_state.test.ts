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
  spam_thread: vi.fn(),
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
  spam_thread: api_mock.spam_thread,
  restore_mail_item: api_mock.restore_mail_item,
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: metadata_mock.bulk_update_metadata_by_ids,
}));

vi.mock("@/lib/ignore_error", () => ({
  ignore_error: vi.fn(),
}));

vi.mock("@/services/api/rate_limit_retry", async (load_actual) => {
  const actual =
    await load_actual<typeof import("@/services/api/rate_limit_retry")>();

  return {
    ...actual,
    with_rate_limit_retry: <T>(
      request: () => Promise<import("@/services/api/client").ApiResponse<T>>,
    ) => actual.with_rate_limit_retry(request, { wait: async () => {} }),
  };
});

import {
  set_thread_trashed,
  set_threads_trashed,
  sync_thread_spam,
  restore_item_from_trash,
} from "./trash_state";

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

  describe("set_threads_trashed", () => {
    it("writes the blob once for every conversation that moved", async () => {
      api_mock.trash_thread.mockImplementation(async (token: string) => ({
        data: { trashed: 1, ids: [`${token}-server`] },
      }));

      const targets = Array.from({ length: 30 }, (_, i) => ({
        thread_token: `t${i}`,
        known_ids: [`t${i}-known`],
      }));
      const result = await set_threads_trashed(targets, true);

      expect(result.failed_tokens).toEqual([]);
      expect(api_mock.trash_thread).toHaveBeenCalledTimes(30);
      expect(metadata_mock.bulk_update_metadata_by_ids).toHaveBeenCalledTimes(
        1,
      );

      const [ids, updates] = metadata_mock.bulk_update_metadata_by_ids.mock
        .calls[0] as unknown as [string[], unknown];

      expect(ids).toHaveLength(60);
      expect(updates).toEqual({ is_trashed: true });
    });

    it("keeps at most four requests in flight", async () => {
      let active = 0;
      let peak = 0;

      api_mock.trash_thread.mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;

        return { data: { trashed: 1, ids: [] } };
      });

      await set_threads_trashed(
        Array.from({ length: 20 }, (_, i) => ({
          thread_token: `t${i}`,
          known_ids: [],
        })),
        true,
      );

      expect(peak).toBeLessThanOrEqual(4);
    });

    it("sends a rate limited request again and succeeds", async () => {
      api_mock.trash_thread
        .mockResolvedValueOnce({
          error: "Too many requests",
          code: "RATE_LIMIT_EXCEEDED",
          status: 429,
          retry_after_secs: 60,
        })
        .mockResolvedValueOnce({ data: { trashed: 1, ids: ["m1"] } });

      const result = await set_threads_trashed(
        [{ thread_token: "t1", known_ids: ["m1"] }],
        true,
      );

      expect(result.failed_tokens).toEqual([]);
      expect(api_mock.trash_thread).toHaveBeenCalledTimes(2);
    });

    it("reports the conversations that failed and writes only the rest", async () => {
      api_mock.trash_thread.mockImplementation(async (token: string) => {
        if (token === "bad") return { data: null, error: "Server error" };
        if (token === "thrown") throw new Error("network");

        return { data: { trashed: 1, ids: [`${token}-m`] } };
      });

      const result = await set_threads_trashed(
        [
          { thread_token: "good", known_ids: [] },
          { thread_token: "bad", known_ids: ["bad-m"] },
          { thread_token: "thrown", known_ids: ["thrown-m"] },
        ],
        true,
      );

      expect(result.failed_tokens.sort()).toEqual(["bad", "thrown"]);
      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [["good-m"], { is_trashed: true }],
      ]);
    });
  });

  describe("sync_thread_spam", () => {
    it("writes the blob once for all conversations", async () => {
      api_mock.spam_thread.mockImplementation(async (token: string) => ({
        data: { updated: 1, ids: [`${token}-m`] },
      }));

      const ids = await sync_thread_spam(["a", "b", undefined, "a"], true);

      expect(ids.sort()).toEqual(["a-m", "b-m"]);
      expect(api_mock.spam_thread).toHaveBeenCalledTimes(2);
      expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
        [expect.any(Array), { is_spam: true, is_trashed: false }],
      ]);
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
