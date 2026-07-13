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

import { reconcile_string_list } from "./inbox_email_list";

describe("reconcile_string_list", () => {
  it("keeps the previous reference when content is unchanged", () => {
    const prev = ["a", "b", "c"];
    const next = ["a", "b", "c"];

    expect(reconcile_string_list(prev, next)).toBe(prev);
  });

  it("returns the next reference when content differs", () => {
    const prev = ["a", "b"];
    const next = ["a", "b", "c"];

    expect(reconcile_string_list(prev, next)).toBe(next);
  });

  it("returns the next reference when order differs", () => {
    const prev = ["a", "b"];
    const next = ["b", "a"];

    expect(reconcile_string_list(prev, next)).toBe(next);
  });

  it("returns a shared empty reference for empty input", () => {
    const first = reconcile_string_list(["a"], []);
    const second = reconcile_string_list([], []);

    expect(first).toEqual([]);
    expect(first).toBe(second);
  });

  it("stays stable across repeated equal reconciliations", () => {
    let current = ["x", "y"];

    current = reconcile_string_list(current, ["x", "y"]);
    const after_first = current;

    current = reconcile_string_list(current, ["x", "y"]);

    expect(current).toBe(after_first);
  });
});
