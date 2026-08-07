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

const { batched_archive, batched_unarchive } = await import("./archive");

beforeEach(() => {
  post.mockReset();
});

describe("batched_archive", () => {
  it("splits the batch on the reported failed ids", async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        archived_count: 2,
        total_size_bytes: 10,
        failed_ids: ["b"],
      },
    });

    const result = await batched_archive(["a", "b", "c"]);

    expect(result.succeeded_ids).toEqual(["a", "c"]);
    expect(result.failed_ids).toEqual(["b"]);
  });

  it("treats the whole batch as archived when the field is absent", async () => {
    post.mockResolvedValue({
      data: { success: true, archived_count: 3, total_size_bytes: 10 },
    });

    const result = await batched_archive(["a", "b", "c"]);

    expect(result.succeeded_ids).toEqual(["a", "b", "c"]);
    expect(result.failed_ids).toEqual([]);
  });

  it("fails the whole batch when the request errors", async () => {
    post.mockResolvedValue({ error: "boom" });

    const result = await batched_archive(["a", "b"]);

    expect(result.succeeded_ids).toEqual([]);
    expect(result.failed_ids).toEqual(["a", "b"]);
  });

  it("fails the whole batch when the request throws", async () => {
    post.mockRejectedValue(new Error("offline"));

    const result = await batched_archive(["a", "b"]);

    expect(result.failed_ids).toEqual(["a", "b"]);
  });

  it("reports an empty failure list for an empty input", async () => {
    const result = await batched_archive([]);

    expect(post).not.toHaveBeenCalled();
    expect(result.succeeded_ids).toEqual([]);
    expect(result.failed_ids).toEqual([]);
  });
});

describe("batched_unarchive", () => {
  it("splits the batch on the reported failed ids", async () => {
    post.mockResolvedValue({
      data: { success: true, unarchived_count: 1, failed_ids: ["a", "c"] },
    });

    const result = await batched_unarchive(["a", "b", "c"]);

    expect(result.succeeded_ids).toEqual(["b"]);
    expect(result.failed_ids).toEqual(["a", "c"]);
  });

  it("treats the whole batch as unarchived when the field is absent", async () => {
    post.mockResolvedValue({
      data: { success: true, unarchived_count: 2 },
    });

    const result = await batched_unarchive(["a", "b"]);

    expect(result.succeeded_ids).toEqual(["a", "b"]);
    expect(result.failed_ids).toEqual([]);
  });

  it("fails the whole batch when the request errors", async () => {
    post.mockResolvedValue({ error: "boom" });

    const result = await batched_unarchive(["a", "b"]);

    expect(result.failed_ids).toEqual(["a", "b"]);
  });
});
