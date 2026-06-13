//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

const { get_mock } = vi.hoisted(() => ({ get_mock: vi.fn() }));

vi.mock("./client", () => ({
  api_client: {
    get: get_mock,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { list_all_aliases } from "./aliases";

function make_alias(id: string) {
  return {
    id,
    encrypted_local_part: "",
    local_part_nonce: "",
    alias_address_hash: "",
    domain: "astermail.org",
    is_enabled: true,
    is_random: false,
    is_pinned: false,
    created_at: "",
    updated_at: "",
  };
}

describe("list_all_aliases", () => {
  beforeEach(() => {
    get_mock.mockReset();
  });

  it("returns a single page when has_more is false", async () => {
    get_mock.mockResolvedValueOnce({
      data: {
        aliases: [make_alias("a"), make_alias("b")],
        total: 2,
        has_more: false,
        max_aliases: -1,
      },
    });

    const result = await list_all_aliases();

    expect(result.aliases.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.max_aliases).toBe(-1);
    expect(result.total).toBe(2);
    expect(result.error).toBeUndefined();
    expect(get_mock).toHaveBeenCalledTimes(1);
    expect(get_mock).toHaveBeenCalledWith(
      "/addresses/v1/aliases?limit=100&offset=0",
    );
  });

  it("pages through every batch and accumulates the full list", async () => {
    const page0 = Array.from({ length: 100 }, (_, i) => make_alias(`p0-${i}`));
    const page1 = Array.from({ length: 30 }, (_, i) => make_alias(`p1-${i}`));

    get_mock
      .mockResolvedValueOnce({
        data: { aliases: page0, total: 130, has_more: true, max_aliases: -1 },
      })
      .mockResolvedValueOnce({
        data: { aliases: page1, total: 130, has_more: false, max_aliases: -1 },
      });

    const result = await list_all_aliases();

    expect(result.aliases).toHaveLength(130);
    expect(get_mock).toHaveBeenCalledTimes(2);
    expect(get_mock).toHaveBeenNthCalledWith(
      1,
      "/addresses/v1/aliases?limit=100&offset=0",
    );
    expect(get_mock).toHaveBeenNthCalledWith(
      2,
      "/addresses/v1/aliases?limit=100&offset=100",
    );
  });

  it("surfaces the error and does not loop when the first page fails", async () => {
    get_mock.mockResolvedValueOnce({ error: "request_failed" });

    const result = await list_all_aliases();

    expect(result.error).toBe("request_failed");
    expect(result.aliases).toHaveLength(0);
    expect(get_mock).toHaveBeenCalledTimes(1);
  });

  it("keeps already-fetched pages if a later page fails", async () => {
    const page0 = Array.from({ length: 100 }, (_, i) => make_alias(`p0-${i}`));

    get_mock
      .mockResolvedValueOnce({
        data: { aliases: page0, total: 130, has_more: true, max_aliases: -1 },
      })
      .mockResolvedValueOnce({ error: "request_failed" });

    const result = await list_all_aliases();

    expect(result.aliases).toHaveLength(100);
    expect(result.error).toBeUndefined();
    expect(get_mock).toHaveBeenCalledTimes(2);
  });

  it("stops when a batch is empty even if has_more is true", async () => {
    get_mock.mockResolvedValueOnce({
      data: { aliases: [], total: 0, has_more: true, max_aliases: 5 },
    });

    const result = await list_all_aliases();

    expect(result.aliases).toHaveLength(0);
    expect(get_mock).toHaveBeenCalledTimes(1);
  });
});
