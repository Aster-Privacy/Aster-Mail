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
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  api_client: {
    delete: vi.fn(async () => ({ data: { success: true } })),
  },
}));

const { api_client } = await import("./client");
const { delete_domain_address } = await import("./domains");

describe("delete_domain_address", () => {
  beforeEach(() => {
    vi.mocked(api_client.delete).mockClear();
  });

  it("sends the plaintext address so the server can end its credential", async () => {
    await delete_domain_address("domain-1", "addr-1", "billing@example.com");

    expect(api_client.delete).toHaveBeenCalledWith(
      "/addresses/v1/domains/domain-1/addresses/addr-1",
      { data: { address: "billing@example.com" } },
    );
  });

  it("sends no body when the address is unknown", async () => {
    await delete_domain_address("domain-1", "addr-1");

    expect(api_client.delete).toHaveBeenCalledWith(
      "/addresses/v1/domains/domain-1/addresses/addr-1",
      undefined,
    );
  });
});
