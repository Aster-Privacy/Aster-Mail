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

import { resolve_page_range } from "./page_range";

describe("resolve_page_range", () => {
  it("reads the range of a later page against a known total", () => {
    expect(
      resolve_page_range({
        current_page: 14,
        page_size: 50,
        page_row_count: 50,
        total: 12_000,
        total_pages: 240,
      }),
    ).toEqual({ start: 701, end: 750, total: 12_000 });
  });

  it("never ends the range before it starts when the total is stuck at one page", () => {
    expect(
      resolve_page_range({
        current_page: 14,
        page_size: 50,
        page_row_count: 50,
        total: 50,
        total_pages: 16,
      }),
    ).toEqual({ start: 701, end: 750, total: null });
  });

  it("drops a total that equals the page when more pages exist", () => {
    expect(
      resolve_page_range({
        current_page: 0,
        page_size: 50,
        page_row_count: 50,
        total: 50,
        total_pages: 2,
      }),
    ).toEqual({ start: 1, end: 50, total: null });
  });

  it("ends a short last page at the total", () => {
    expect(
      resolve_page_range({
        current_page: 2,
        page_size: 50,
        page_row_count: 23,
        total: 123,
        total_pages: 3,
      }),
    ).toEqual({ start: 101, end: 123, total: 123 });
  });

  it("keeps a single full page that matches the total", () => {
    expect(
      resolve_page_range({
        current_page: 0,
        page_size: 50,
        page_row_count: 50,
        total: 50,
        total_pages: 1,
      }),
    ).toEqual({ start: 1, end: 50, total: 50 });
  });

  it("falls back to the page size when the row count is not known", () => {
    expect(
      resolve_page_range({
        current_page: 1,
        page_size: 50,
        page_row_count: 0,
        total: 400,
        total_pages: 8,
      }),
    ).toEqual({ start: 51, end: 100, total: 400 });
  });

  it("keeps pinned rows shown above the page out of the range", () => {
    expect(
      resolve_page_range({
        current_page: 0,
        page_size: 50,
        page_row_count: 52,
        total: 12_000,
        total_pages: 240,
      }),
    ).toEqual({ start: 1, end: 50, total: 12_000 });
  });
});
