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
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  format_relative_time,
  format_relative_time_short,
} from "@/utils/date_utils";

const t = (key: string, params?: Record<string, string | number>) =>
  params && "count" in params ? `${key}:${params.count}` : key;

function at(offset_ms: number): string {
  return new Date(Date.now() - offset_ms).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("format_relative_time_short", () => {
  it("reports anything under a minute as just now", () => {
    expect(format_relative_time_short(at(30_000), t)).toBe("common.just_now");
  });

  it("floors partial minutes instead of rounding them up", () => {
    expect(format_relative_time_short(at(90_000), t)).toBe(
      "common.minutes_ago_short:1",
    );
  });

  it("floors partial hours instead of rounding them up", () => {
    expect(format_relative_time_short(at(90 * 60_000), t)).toBe(
      "common.hours_ago_short:1",
    );
  });

  it("counts days up to the thirtieth", () => {
    expect(format_relative_time_short(at(29 * 86_400_000), t)).toBe(
      "common.days_ago_short:29",
    );
  });

  it("falls back to an absolute date past thirty days", () => {
    const result = format_relative_time_short(at(400 * 86_400_000), t);

    expect(result).not.toContain("common.");
    expect(result).toMatch(/\d/);
  });

  it("treats a future timestamp as just now rather than a negative count", () => {
    expect(format_relative_time_short(Date.now() + 120_000, t)).toBe(
      "common.just_now",
    );
  });

  it("returns an empty string for an unparseable value", () => {
    expect(format_relative_time_short("not-a-date", t)).toBe("");
  });
});

describe("format_relative_time", () => {
  it("treats a future timestamp as just now rather than a negative count", () => {
    expect(
      format_relative_time(new Date(Date.now() + 120_000).toISOString(), t),
    ).toBe("common.just_now");
  });

  it("uses the long keys for elapsed minutes", () => {
    expect(format_relative_time(at(5 * 60_000), t)).toBe(
      "common.minutes_ago_long:5",
    );
  });

  it("falls back to an absolute date past twelve months", () => {
    const result = format_relative_time(at(400 * 86_400_000), t);

    expect(result).not.toContain("common.");
    expect(result).toMatch(/\d/);
  });
});
