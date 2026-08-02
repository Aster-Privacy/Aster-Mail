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

import { sanitize_username, sanitize_username_input } from "./sanitize";

describe("sanitize_username", () => {
  it("keeps dots so dotted accounts can sign in", () => {
    expect(sanitize_username("john.smith")).toBe("john.smith");
  });

  it("lowercases and drops unsupported characters", () => {
    expect(sanitize_username("John.Smith+tag!")).toBe("john.smithtag");
  });

  it("keeps underscores and digits", () => {
    expect(sanitize_username("a_b.c9")).toBe("a_b.c9");
  });

  it("allows the same length as registration", () => {
    const local = "a".repeat(45);

    expect(sanitize_username(local)).toHaveLength(40);
  });

  it("matches the registration sanitizer", () => {
    const samples = ["john.smith", "JOHN.SMITH", "j.o.h.n_9", "a".repeat(45)];

    for (const sample of samples) {
      expect(sanitize_username(sample)).toBe(sanitize_username_input(sample));
    }
  });
});
