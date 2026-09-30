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

import { clear_strikes, record_absences } from "@/services/absent_strikes";

const known = new Set(["a", "b", "c"]);

function is_known(id: string): boolean {
  return known.has(id);
}

describe("ids absent from one server response are not deleted immediately", () => {
  it("keeps an id that is missing from a single response", () => {
    const strikes = new Map<string, number>();

    expect(record_absences(strikes, ["a"], is_known)).toEqual([]);
  });

  it("deletes an id only after a second consecutive absence", () => {
    const strikes = new Map<string, number>();

    record_absences(strikes, ["a"], is_known);

    expect(record_absences(strikes, ["a"], is_known)).toEqual(["a"]);
  });

  it("forgets the first absence once the id comes back", () => {
    const strikes = new Map<string, number>();

    record_absences(strikes, ["a"], is_known);
    clear_strikes(strikes, ["a"]);

    expect(record_absences(strikes, ["a"], is_known)).toEqual([]);
  });

  it("ignores ids the index does not hold", () => {
    const strikes = new Map<string, number>();

    record_absences(strikes, ["zz"], is_known);

    expect(record_absences(strikes, ["zz"], is_known)).toEqual([]);
    expect(strikes.size).toBe(0);
  });

  it("tracks each id separately", () => {
    const strikes = new Map<string, number>();

    record_absences(strikes, ["a", "b"], is_known);

    expect(record_absences(strikes, ["a"], is_known)).toEqual(["a"]);
    expect(strikes.get("b")).toBe(1);
  });
});
