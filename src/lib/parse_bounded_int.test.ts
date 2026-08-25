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

import { parse_bounded_int } from "@/lib/parse_bounded_int";

describe("parse_bounded_int", () => {
  it("returns null for an empty field", () => {
    expect(parse_bounded_int("", 1, 30)).toBe(null);
    expect(parse_bounded_int("   ", 1, 30)).toBe(null);
  });

  it("returns null for text that is not a number", () => {
    expect(parse_bounded_int("abc", 1, 30)).toBe(null);
    expect(parse_bounded_int("-", 1, 30)).toBe(null);
  });

  it("clamps a value below the minimum", () => {
    expect(parse_bounded_int("-5", 1, 30)).toBe(1);
    expect(parse_bounded_int("0", 1, 30)).toBe(1);
  });

  it("clamps a value above the maximum", () => {
    expect(parse_bounded_int("999", 1, 30)).toBe(30);
  });

  it("keeps a value inside the range", () => {
    expect(parse_bounded_int("7", 1, 30)).toBe(7);
  });

  it("truncates a decimal instead of rejecting it", () => {
    expect(parse_bounded_int("7.9", 1, 30)).toBe(7);
  });

  it("reads exponent notation as its full value, not its first digit", () => {
    expect(parse_bounded_int("1e2", 1, 300)).toBe(100);
  });
});
