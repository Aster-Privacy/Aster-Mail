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

import { resolve_filtered_pager_total } from "./inbox_view_helpers";

describe("resolve_filtered_pager_total", () => {
  it("shows the exact matching total when it covers every page", () => {
    expect(resolve_filtered_pager_total(23, 3, 10)).toBe(23);
  });

  it("keeps the last page reachable while read rows still hold slots", () => {
    expect(resolve_filtered_pager_total(20, 3, 10)).toBe(21);
  });

  it("returns zero for an empty filtered list", () => {
    expect(resolve_filtered_pager_total(0, 1, 10)).toBe(0);
  });
});
