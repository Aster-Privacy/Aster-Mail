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

import { is_write_dead_streak } from "./client";

const TEN_MINUTES = 10 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("is_write_dead_streak", () => {
  it("stays alive below the denial threshold even after long elapsed time", () => {
    expect(is_write_dead_streak(7, NOW - TEN_MINUTES * 6, NOW)).toBe(false);
  });

  it("stays alive at the denial threshold when elapsed time is short", () => {
    expect(is_write_dead_streak(8, NOW - TEN_MINUTES + 1, NOW)).toBe(false);
    expect(is_write_dead_streak(50, NOW - 30_000, NOW)).toBe(false);
  });

  it("stays alive when the streak never started", () => {
    expect(is_write_dead_streak(100, 0, NOW)).toBe(false);
  });

  it("expires only when both denial count and elapsed time are met", () => {
    expect(is_write_dead_streak(8, NOW - TEN_MINUTES, NOW)).toBe(true);
    expect(is_write_dead_streak(120, NOW - TEN_MINUTES * 2, NOW)).toBe(true);
  });

  it("treats a single transient rollover window as alive", () => {
    expect(is_write_dead_streak(3, NOW - 90_000, NOW)).toBe(false);
  });

  it("expires a five-second retry storm after ten minutes", () => {
    const denials_in_ten_minutes = Math.floor(TEN_MINUTES / 5000);

    expect(
      is_write_dead_streak(denials_in_ten_minutes, NOW - TEN_MINUTES, NOW),
    ).toBe(true);
  });
});
