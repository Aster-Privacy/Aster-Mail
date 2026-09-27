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

describe("list_mail_items pinned_first", () => {
  it("asks the server to put pinned mail first when requested", async () => {
    await list_mail_items({ limit: 50, offset: 0, pinned_first: true });

    const endpoint = get.mock.calls[0][0] as string;
    const query = new URLSearchParams(endpoint.split("?")[1]);

    expect(query.get("pinned_first")).toBe("true");
  });

  it("keeps the plain date order when the flag is not set", async () => {
    await list_mail_items({ limit: 50, offset: 0 });

    expect(get.mock.calls[0][0]).not.toContain("pinned_first");
  });
});
