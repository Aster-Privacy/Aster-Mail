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

import {
  advance_counts,
  clamp_final_count,
  progress_percent,
} from "./progress_math";

describe("advance_counts", () => {
  it("never moves backwards", () => {
    const first = advance_counts(
      { done: 0, total: 0 },
      { done: 2400, total: 13922 },
    );
    const second = advance_counts(first, { done: 0, total: 0 });

    expect(second).toEqual({ done: 2400, total: 13922 });
  });

  it("never reports more done than the known total", () => {
    const counts = advance_counts(
      { done: 14921, total: 14921 },
      { done: 15130, total: 0 },
    );

    expect(counts).toEqual({ done: 14921, total: 14921 });
  });

  it("lets done grow while the total is unknown", () => {
    expect(
      advance_counts({ done: 10, total: 0 }, { done: 50, total: 0 }),
    ).toEqual({ done: 50, total: 0 });
  });

  it("returns the same object when nothing changed", () => {
    const prev = { done: 5, total: 10 };

    expect(advance_counts(prev, { done: 3, total: 10 })).toBe(prev);
  });
});

describe("clamp_final_count", () => {
  it("caps the final count at the known total", () => {
    expect(clamp_final_count(15130, 14921)).toBe(14921);
    expect(clamp_final_count(100, 0)).toBe(100);
  });
});

describe("progress_percent", () => {
  it("stays under 100 while active and reaches 100 when done", () => {
    expect(progress_percent({ done: 100, total: 100 }, true)).toBe(99);
    expect(progress_percent({ done: 100, total: 100 }, false)).toBe(100);
  });
});
