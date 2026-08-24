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

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (endpoint: string, options?: unknown) => get(endpoint, options),
  },
}));

import { list_scheduled_emails } from "./scheduled";

function scheduled_page(count: number, offset: number, total: number) {
  return {
    data: {
      items: Array.from({ length: count }, (_, index) => ({
        id: `id_${offset + index}`,
        recipient_count: 1,
        has_attachments: false,
        scheduled_at: "2026-09-01T10:00:00Z",
        status: "pending",
        created_at: "2026-08-01T10:00:00Z",
        is_external: false,
      })),
      total,
      limit: 100,
      offset,
    },
  };
}

describe("list_scheduled_emails pagination", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("collects every page instead of stopping at the server limit", async () => {
    get
      .mockResolvedValueOnce(scheduled_page(100, 0, 230))
      .mockResolvedValueOnce(scheduled_page(100, 100, 230))
      .mockResolvedValueOnce(scheduled_page(30, 200, 230));

    const response = await list_scheduled_emails();

    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[0][0]).toContain("limit=100&offset=0");
    expect(get.mock.calls[1][0]).toContain("limit=100&offset=100");
    expect(get.mock.calls[2][0]).toContain("limit=100&offset=200");
    expect(response.data?.emails).toHaveLength(230);
    expect(response.data?.total).toBe(230);
    expect(response.data?.has_more).toBe(false);
  });

  it("stops after a single page when the server returns everything", async () => {
    get.mockResolvedValueOnce(scheduled_page(4, 0, 4));

    const response = await list_scheduled_emails();

    expect(get).toHaveBeenCalledTimes(1);
    expect(response.data?.emails).toHaveLength(4);
  });

  it("keeps the pages it already collected when a later page fails", async () => {
    get
      .mockResolvedValueOnce(scheduled_page(100, 0, 230))
      .mockResolvedValueOnce({ error: "network", code: "NETWORK_ERROR" });

    const response = await list_scheduled_emails();

    expect(response.data?.emails).toHaveLength(100);
    expect(response.error).toBeUndefined();
  });
});
