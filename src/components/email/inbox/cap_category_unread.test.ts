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
import { describe, expect, it } from "vitest";

import { cap_category_unread } from "./cap_category_unread";

describe("cap_category_unread", () => {
  it("never shows more unread than the whole inbox has", () => {
    expect(cap_category_unread(2, 0)).toBe(0);
    expect(cap_category_unread(5, 3)).toBe(3);
  });

  it("keeps the category count when it is within the inbox total", () => {
    expect(cap_category_unread(2, 7)).toBe(2);
    expect(cap_category_unread(0, 4)).toBe(0);
  });

  it("falls back to the category count before inbox stats load", () => {
    expect(cap_category_unread(2, undefined)).toBe(2);
  });

  it("stays empty when the category has no count", () => {
    expect(cap_category_unread(undefined, 3)).toBeUndefined();
  });
});
