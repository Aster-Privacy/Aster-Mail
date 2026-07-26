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
import { describe, expect, it, afterEach, vi } from "vitest";

import { format_created_at, format_relative_time } from "./alias_stats_format";

const t = ((key: string, vars?: Record<string, unknown>) =>
  vars && "count" in vars ? `${key}:${vars.count}` : key) as never;

const now = new Date("2026-07-26T20:37:00.000Z").getTime();

function ago(ms: number): string {
  return new Date(now - ms).toISOString();
}

function freeze() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("format_relative_time", () => {
  it("reports seconds-old activity as just now", () => {
    freeze();
    expect(format_relative_time(t, ago(25_000))).toBe(
      "settings.fam_org_time_just_now",
    );
  });

  it("reports minutes", () => {
    freeze();
    expect(format_relative_time(t, ago(5 * 60_000))).toBe(
      "settings.fam_org_time_minutes:5",
    );
    expect(format_relative_time(t, ago(18 * 60_000))).toBe(
      "settings.fam_org_time_minutes:18",
    );
  });

  it("switches to hours at the hour boundary", () => {
    freeze();
    expect(format_relative_time(t, ago(60 * 60_000))).toBe(
      "settings.fam_org_time_hour:1",
    );
    expect(format_relative_time(t, ago(23 * 3_600_000))).toBe(
      "settings.fam_org_time_hours:23",
    );
  });

  it("switches to days at the day boundary", () => {
    freeze();
    expect(format_relative_time(t, ago(24 * 3_600_000))).toBe(
      "settings.fam_org_time_yesterday",
    );
    expect(format_relative_time(t, ago(9 * 86_400_000))).toBe(
      "settings.fam_org_time_days:9",
    );
  });

  it("reports months beyond thirty days", () => {
    freeze();
    expect(format_relative_time(t, ago(30 * 86_400_000))).toBe(
      "settings.fam_org_time_month:1",
    );
    expect(format_relative_time(t, ago(182 * 86_400_000))).toBe(
      "settings.fam_org_time_months:6",
    );
  });

  it("reports years beyond a year", () => {
    freeze();
    expect(format_relative_time(t, ago(400 * 86_400_000))).toBe(
      "settings.fam_org_time_year:1",
    );
    expect(format_relative_time(t, ago(4 * 365 * 86_400_000))).toBe(
      "settings.fam_org_time_years:4",
    );
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(format_relative_time(t, "not-a-date")).toBe("");
  });
});

describe("format_created_at", () => {
  it("renders day, short month, year and time", () => {
    expect(format_created_at("2026-07-26T20:37:00.000Z", "en-US")).toContain(
      "Jul",
    );
    expect(format_created_at("2026-07-26T20:37:00.000Z", "en-US")).toContain(
      "2026",
    );
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(format_created_at("", "en-US")).toBe("");
    expect(format_created_at("nope", "en-US")).toBe("");
  });
});
