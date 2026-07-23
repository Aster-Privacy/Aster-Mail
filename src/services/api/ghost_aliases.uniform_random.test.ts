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
import { uniform_random_index } from "./ghost_aliases";

describe("uniform_random_index", () => {
  it("stays within [0, modulus) for the alias suffix range", () => {
    for (let i = 0; i < 20000; i += 1) {
      const value = uniform_random_index(10000);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10000);
    }
  });

  it("covers the low and high ends of a small modulus", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      seen.add(uniform_random_index(4));
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });
});
