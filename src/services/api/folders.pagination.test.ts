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

import { list_folders } from "./folders";

function label_page(count: number, offset: number, has_more: boolean) {
  return {
    data: {
      labels: Array.from({ length: count }, (_, index) => ({
        id: `id_${offset + index}`,
        label_token: `token_${offset + index}`,
        encrypted_name: "",
        name_nonce: "",
        is_system: false,
        sort_order: offset + index,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      })),
      total: 620,
      has_more,
    },
  };
}

describe("list_folders", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("keeps requesting pages until the server reports no more folders", async () => {
    get
      .mockResolvedValueOnce(label_page(500, 0, true))
      .mockResolvedValueOnce(label_page(120, 500, false));

    const response = await list_folders({ include_system: true });

    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][0]).toContain("limit=500");
    expect(get.mock.calls[0][0]).toContain("offset=0");
    expect(get.mock.calls[1][0]).toContain("offset=500");
    expect(response.data?.folders).toHaveLength(620);
    expect(response.data?.has_more).toBe(false);
  });

  it("requests a single page when the caller sets its own limit", async () => {
    get.mockResolvedValueOnce(label_page(10, 0, true));

    const response = await list_folders({ limit: 10 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(response.data?.folders).toHaveLength(10);
    expect(response.data?.has_more).toBe(true);
  });

  it("returns the folders already collected when a later page fails", async () => {
    get
      .mockResolvedValueOnce(label_page(500, 0, true))
      .mockResolvedValueOnce({ error: "network" });

    const response = await list_folders();

    expect(response.data?.folders).toHaveLength(500);
    expect(response.error).toBeUndefined();
  });
});
