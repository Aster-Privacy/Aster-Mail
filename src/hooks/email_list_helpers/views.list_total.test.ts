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

import { UNKNOWN_TOTAL, grow_list_total, resolve_list_total } from "./views";

describe("resolve_list_total", () => {
  it("uses the server count when it is known", () => {
    expect(resolve_list_total(12_000, 2, 0, 50)).toBe(12_002);
  });

  it("drops a carried count when the first page reports the count is too large to count", () => {
    expect(resolve_list_total(UNKNOWN_TOTAL, 0, 0, 50)).toBe(0);
  });

  it("keeps the carried count for later pages that skip counting", () => {
    expect(resolve_list_total(UNKNOWN_TOTAL, 0, 50, 30_000)).toBe(30_000);
  });

  it("never returns a negative carried count", () => {
    expect(resolve_list_total(UNKNOWN_TOTAL, 0, 100, -4)).toBe(0);
  });

  it("treats a missing total like an unknown one", () => {
    expect(resolve_list_total(undefined, 0, 0, 50)).toBe(0);
  });
});

describe("grow_list_total", () => {
  it("adds restored rows to a known count", () => {
    expect(grow_list_total(120, 2)).toBe(122);
  });

  it("leaves an unknown count unknown instead of counting only the added rows", () => {
    expect(grow_list_total(0, 1)).toBe(0);
  });
});
