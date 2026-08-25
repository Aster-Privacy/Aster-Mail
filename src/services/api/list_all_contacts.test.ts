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
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { list_all_contacts } from "./contacts";

function make_contact(id: string) {
  return {
    id,
    encrypted_data: "",
    data_nonce: "",
    integrity_hash: "",
    is_starred: false,
    created_at: "",
    updated_at: "",
  };
}

describe("list_all_contacts", () => {
  beforeEach(() => {
    get_mock.mockReset();
  });

  it("returns a single page when has_more is false", async () => {
    get_mock.mockResolvedValueOnce({
      data: {
        items: [make_contact("a"), make_contact("b")],
        next_cursor: null,
        has_more: false,
      },
    });

    const result = await list_all_contacts();

    expect(result.data?.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.data?.has_more).toBe(false);
    expect(get_mock).toHaveBeenCalledTimes(1);
    expect(get_mock).toHaveBeenCalledWith("/contacts/v1?limit=100");
  });

  it("follows the cursor until the server stops reporting more", async () => {
    const page0 = Array.from({ length: 100 }, (_, i) =>
      make_contact(`p0-${i}`),
    );
    const page1 = Array.from({ length: 40 }, (_, i) => make_contact(`p1-${i}`));

    get_mock
      .mockResolvedValueOnce({
        data: { items: page0, next_cursor: "cursor-1", has_more: true },
      })
      .mockResolvedValueOnce({
        data: { items: page1, next_cursor: null, has_more: false },
      });

    const result = await list_all_contacts();

    expect(result.data?.items).toHaveLength(140);
    expect(get_mock).toHaveBeenCalledTimes(2);
    expect(get_mock).toHaveBeenNthCalledWith(1, "/contacts/v1?limit=100");
    expect(get_mock).toHaveBeenNthCalledWith(
      2,
      "/contacts/v1?limit=100&cursor=cursor-1",
    );
  });

  it("stops when the server repeats a cursor", async () => {
    get_mock.mockResolvedValue({
      data: {
        items: [make_contact("loop")],
        next_cursor: "same",
        has_more: true,
      },
    });

    const result = await list_all_contacts();

    expect(get_mock).toHaveBeenCalledTimes(2);
    expect(result.data?.items).toHaveLength(2);
  });

  it("surfaces the error when the first page fails", async () => {
    get_mock.mockResolvedValueOnce({ error: "boom" });

    const result = await list_all_contacts();

    expect(result.error).toBe("boom");
    expect(get_mock).toHaveBeenCalledTimes(1);
  });

  it("keeps the pages it already collected when a later page fails", async () => {
    get_mock
      .mockResolvedValueOnce({
        data: {
          items: [make_contact("a")],
          next_cursor: "cursor-1",
          has_more: true,
        },
      })
      .mockResolvedValueOnce({ error: "boom" });

    const result = await list_all_contacts();

    expect(result.error).toBeUndefined();
    expect(result.data?.items.map((c) => c.id)).toEqual(["a"]);
  });

  it("passes a group filter through on every page", async () => {
    get_mock
      .mockResolvedValueOnce({
        data: {
          items: [make_contact("a")],
          next_cursor: "cursor-1",
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [make_contact("b")],
          next_cursor: null,
          has_more: false,
        },
      });

    await list_all_contacts({ group_id: "group-9" });

    expect(get_mock).toHaveBeenNthCalledWith(
      1,
      "/contacts/v1?limit=100&group_id=group-9",
    );
    expect(get_mock).toHaveBeenNthCalledWith(
      2,
      "/contacts/v1?limit=100&cursor=cursor-1&group_id=group-9",
    );
  });
});
