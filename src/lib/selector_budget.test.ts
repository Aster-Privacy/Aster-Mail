//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  create_selector_budget,
  is_affordable_selector,
} from "./selector_budget";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("is_affordable_selector", () => {
  it.each([".a", "table > tr td", "p.x, ", "a:hover", "div ~ p + span"])(
    "accepts %s",
    (selector) => {
      expect(is_affordable_selector(selector)).toBe(true);
    },
  );

  it.each([
    "div:has(p)",
    "div:HAS(p)",
    `p${".x".repeat(300)}`,
    `${"div ".repeat(20)}p`,
  ])("rejects %s", (selector) => {
    expect(is_affordable_selector(selector)).toBe(false);
  });

  it("counts a run of combinator characters as one step", () => {
    expect(is_affordable_selector(`${"a  >  ".repeat(16)}b`)).toBe(false);
    expect(is_affordable_selector(`${"a  >  ".repeat(15)}b`)).toBe(true);
  });
});

describe("create_selector_budget", () => {
  it("stops after the count limit", () => {
    const budget = create_selector_budget(2, 10_000);

    expect([budget.take(), budget.take(), budget.take()]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("stops once the time budget is spent", () => {
    let now = 0;

    vi.spyOn(performance, "now").mockImplementation(() => now);

    const budget = create_selector_budget(100, 50);

    expect(budget.take()).toBe(true);
    now = 51;
    expect(budget.take()).toBe(false);
  });
});
