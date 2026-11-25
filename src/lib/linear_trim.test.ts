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
import { describe, expect, it } from "vitest";

import {
  char_set_predicate,
  is_js_whitespace,
  trim_edges_while,
  trim_end_index,
  trim_end_while,
  trim_js_whitespace_end,
  trim_start_index,
  trim_start_while,
} from "@/lib/linear_trim";

describe("linear_trim", () => {
  it("matches the JS whitespace class exactly", () => {
    for (let code = 0; code <= 0xffff; code += 1) {
      expect(is_js_whitespace(code)).toBe(/\s/.test(String.fromCharCode(code)));
    }
  });

  it("trims a character set from either edge", () => {
    const is_dot = char_set_predicate(".");

    expect(trim_start_while("..a.b..", is_dot)).toBe("a.b..");
    expect(trim_end_while("..a.b..", is_dot)).toBe("..a.b");
    expect(trim_edges_while("..a.b..", is_dot)).toBe("a.b");
    expect(trim_edges_while("....", is_dot)).toBe("");
    expect(trim_edges_while("", is_dot)).toBe("");
    expect(trim_edges_while("abc", is_dot)).toBe("abc");
  });

  it("reports scan indexes from a given position", () => {
    const is_space = char_set_predicate(" ");

    expect(trim_start_index("ab   c", is_space, 2)).toBe(5);
    expect(trim_end_index("a   bc", is_space, 4)).toBe(1);
    expect(trim_start_index("   ", is_space)).toBe(3);
    expect(trim_end_index("   ", is_space)).toBe(0);
  });

  it("matches trimEnd for JS whitespace", () => {
    for (const value of ["", " ", "a \t\n", "a 　", "﻿a﻿"]) {
      expect(trim_js_whitespace_end(value)).toBe(value.trimEnd());
    }
  });

  it("stays linear on long runs", () => {
    const run = " ".repeat(1_000_000);
    const started = performance.now();

    trim_edges_while(`${run}a${run}b${run}`, is_js_whitespace);
    trim_end_while(`${run}a`, is_js_whitespace);

    expect(performance.now() - started).toBeLessThan(500);
  });
});
