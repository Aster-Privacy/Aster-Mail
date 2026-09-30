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

import { describe, it, expect } from "vitest";

import { compute_total_pages } from "@/components/email/inbox/inbox_view_helpers";

describe("compute_total_pages", () => {
  it("pages an alias view by its server total, not the loaded page", () => {
    expect(
      compute_total_pages({
        effective_total: 213,
        page_size: 50,
        current_page: 0,
        has_more: true,
        server_paged: true,
      }),
    ).toBe(5);
  });

  it("keeps a next page reachable when the total is unknown", () => {
    expect(
      compute_total_pages({
        effective_total: 50,
        page_size: 50,
        current_page: 0,
        has_more: true,
        server_paged: true,
      }),
    ).toBe(2);
  });

  it("stops at the last page once the server reports no more items", () => {
    expect(
      compute_total_pages({
        effective_total: 50,
        page_size: 50,
        current_page: 0,
        has_more: false,
        server_paged: true,
      }),
    ).toBe(1);
  });

  it("trusts the client-filtered count without adding a page", () => {
    expect(
      compute_total_pages({
        effective_total: 30,
        page_size: 50,
        current_page: 0,
        has_more: true,
        server_paged: false,
      }),
    ).toBe(1);
  });

  it("never reports fewer than one page", () => {
    expect(
      compute_total_pages({
        effective_total: 0,
        page_size: 50,
        current_page: 0,
        has_more: false,
        server_paged: true,
      }),
    ).toBe(1);
  });
});
