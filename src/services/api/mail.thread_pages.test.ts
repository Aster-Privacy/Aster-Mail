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

const get = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

const { list_mail_items } = await import("./mail");

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { items: [], has_more: false } });
});

function sent_query() {
  const endpoint = get.mock.calls[0][0] as string;

  return new URLSearchParams(endpoint.split("?")[1]);
}

describe("list_mail_items thread_pages", () => {
  it("asks the server to page by conversation when requested", async () => {
    await list_mail_items({
      limit: 100,
      offset: 4600,
      label_token: "folder",
      group_by_thread: true,
      thread_pages: true,
    });

    const query = sent_query();

    expect(query.get("thread_pages")).toBe("true");
    expect(query.get("group_by_thread")).toBe("true");
  });

  it("leaves the parameter out for message pages", async () => {
    await list_mail_items({ limit: 100, offset: 0, group_by_thread: false });

    expect(sent_query().has("thread_pages")).toBe(false);
  });
});
