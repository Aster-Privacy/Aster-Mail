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

import { build_bar_segments } from "@/components/settings/storage_section";

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("build_bar_segments", () => {
  it("returns zero widths when nothing is used", () => {
    expect(build_bar_segments([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("keeps the total width at or below the used share", () => {
    const shares = [4, 0.001, 0.001, 0.001, 0.001];
    const widths = build_bar_segments(shares);

    expect(sum(widths)).toBeLessThanOrEqual(sum(shares) + 1e-9);
    widths.forEach((width) => expect(width).toBeGreaterThan(0));
  });

  it("never overflows a full bar", () => {
    const widths = build_bar_segments([60, 39, 0.4, 0.3, 0.3]);

    expect(sum(widths)).toBeLessThanOrEqual(100 + 1e-9);
  });

  it("gives a tiny category a visible width when there is room", () => {
    const widths = build_bar_segments([50, 0.01]);

    expect(widths[1]).toBeGreaterThanOrEqual(1);
    expect(sum(widths)).toBeLessThanOrEqual(50.02);
  });

  it("preserves proportions when every share is already visible", () => {
    const widths = build_bar_segments([40, 20, 10]);

    expect(widths).toEqual([40, 20, 10]);
  });
});
