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

const post_mock = vi.fn();

vi.mock("../client", () => ({
  api_client: { post: (...args: unknown[]) => post_mock(...args) },
}));

import { request_cache } from "../request_cache";

import { update_sidebar_addresses } from "./sidebar";

const DOMAIN_KEY = "GET:/addresses/v1/domains/d1/addresses";

async function seed_domain_cache(order: number): Promise<void> {
  await request_cache.get_or_fetch(DOMAIN_KEY, async () => ({
    data: { addresses: [{ id: "a1", sidebar_order: order }] },
  }));
}

async function read_domain_cache(): Promise<unknown> {
  return request_cache.get_or_fetch(DOMAIN_KEY, async () => ({
    data: { addresses: [{ id: "a1", sidebar_order: 1 }] },
  }));
}

describe("update_sidebar_addresses cache", () => {
  beforeEach(() => {
    request_cache.clear();
    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { updated: 1 } });
  });

  it("drops cached domain addresses after reordering a domain address", async () => {
    await seed_domain_cache(0);

    await update_sidebar_addresses([
      { id: "a1", kind: "domain", sort_order: 1 },
    ]);

    expect(await read_domain_cache()).toEqual({
      data: { addresses: [{ id: "a1", sidebar_order: 1 }] },
    });
  });

  it("keeps cached domain addresses when only aliases change", async () => {
    await seed_domain_cache(0);

    await update_sidebar_addresses([
      { id: "x1", kind: "alias", sort_order: 1 },
    ]);

    expect(await read_domain_cache()).toEqual({
      data: { addresses: [{ id: "a1", sidebar_order: 0 }] },
    });
  });
});
