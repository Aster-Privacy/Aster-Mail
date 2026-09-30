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

import { next_radio_index } from "@/lib/radiogroup_navigation";

describe("next_radio_index", () => {
  it("moves down and wraps to the first option", () => {
    expect(next_radio_index("ArrowDown", 0, 3, false)).toBe(1);
    expect(next_radio_index("ArrowDown", 2, 3, false)).toBe(0);
  });

  it("moves up and wraps to the last option", () => {
    expect(next_radio_index("ArrowUp", 0, 3, false)).toBe(2);
  });

  it("treats right as forward in a left-to-right layout", () => {
    expect(next_radio_index("ArrowRight", 0, 3, false)).toBe(1);
    expect(next_radio_index("ArrowLeft", 1, 3, false)).toBe(0);
  });

  it("reverses left and right in a right-to-left layout", () => {
    expect(next_radio_index("ArrowLeft", 0, 3, true)).toBe(1);
    expect(next_radio_index("ArrowRight", 1, 3, true)).toBe(0);
  });

  it("jumps to the first and last option", () => {
    expect(next_radio_index("Home", 2, 3, false)).toBe(0);
    expect(next_radio_index("End", 0, 3, false)).toBe(2);
  });

  it("starts from the first option when nothing is selected", () => {
    expect(next_radio_index("ArrowDown", -1, 3, false)).toBe(1);
    expect(next_radio_index("ArrowUp", -1, 3, false)).toBe(2);
  });

  it("ignores keys that are not navigation keys", () => {
    expect(next_radio_index("Enter", 0, 3, false)).toBe(null);
    expect(next_radio_index("a", 0, 3, false)).toBe(null);
  });

  it("returns null for an empty group", () => {
    expect(next_radio_index("ArrowDown", -1, 0, false)).toBe(null);
  });
});
