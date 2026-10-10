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

import { resolve_refresh_offset, shift_page_offsets } from "./use_email_list";

describe("resolve_refresh_offset", () => {
  it("refreshes from the top when the list is not windowed", () => {
    expect(resolve_refresh_offset(false, 3, 30, new Map([[3, 97]]))).toBe(0);
  });

  it("reuses the recorded raw offset of the visible page", () => {
    expect(resolve_refresh_offset(true, 3, 30, new Map([[3, 97]]))).toBe(97);
  });

  it("falls back to the arithmetic offset when none was recorded", () => {
    expect(resolve_refresh_offset(true, 2, 30, new Map())).toBe(60);
  });

  it("keeps page zero at the start of the list", () => {
    expect(resolve_refresh_offset(true, 0, 30, new Map([[1, 41]]))).toBe(0);
  });
});

describe("shift_page_offsets", () => {
  it("pulls the next page back by the rows that left the view", () => {
    const shifted = shift_page_offsets(
      new Map([
        [1, 50],
        [6, 300],
      ]),
      40,
    );

    expect(shifted.get(1)).toBe(10);
    expect(shifted.get(6)).toBe(260);
  });

  it("never goes below the start of the list", () => {
    expect(shift_page_offsets(new Map([[1, 30]]), 45).get(1)).toBe(0);
  });

  it("leaves offsets alone when nothing loaded was removed", () => {
    const offsets = new Map([[2, 100]]);

    expect(shift_page_offsets(offsets, 0)).toBe(offsets);
  });
});
