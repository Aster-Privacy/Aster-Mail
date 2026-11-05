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

import { add_months_clamped, pause_resume_date } from "./cancel_pause_step";

describe("add_months_clamped", () => {
  it("adds whole months and keeps the time of day", () => {
    const start = new Date("2026-03-15T10:30:00Z");

    expect(add_months_clamped(start, 1).toISOString()).toBe(
      "2026-04-15T10:30:00.000Z",
    );
    expect(add_months_clamped(start, 3).toISOString()).toBe(
      "2026-06-15T10:30:00.000Z",
    );
  });

  it("clamps to the last day of a shorter month", () => {
    expect(
      add_months_clamped(new Date("2026-01-31T00:00:00Z"), 1).toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z");
    expect(
      add_months_clamped(new Date("2028-01-31T00:00:00Z"), 1).toISOString(),
    ).toBe("2028-02-29T00:00:00.000Z");
  });

  it("rolls over the year", () => {
    expect(
      add_months_clamped(new Date("2026-11-30T12:00:00Z"), 3).toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z");
  });
});

describe("pause_resume_date", () => {
  it("returns null without a start date", () => {
    expect(pause_resume_date(null, 2)).toBeNull();
    expect(pause_resume_date("not a date", 2)).toBeNull();
  });

  it("returns the end of the pause window", () => {
    expect(pause_resume_date("2026-12-01T00:00:00Z", 2)).toBe(
      "2027-02-01T00:00:00.000Z",
    );
  });
});
