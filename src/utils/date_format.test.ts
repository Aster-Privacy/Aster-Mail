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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  format_date_short,
  format_email_detail_timestamp,
  format_email_list_timestamp,
  format_full_date,
  format_full_datetime,
  type FormatOptions,
} from "./date_format";

const US: FormatOptions = { date_format: "MM/DD/YYYY", time_format: "12h" };
const EU: FormatOptions = { date_format: "DD/MM/YYYY", time_format: "24h" };
const ISO: FormatOptions = { date_format: "YYYY-MM-DD", time_format: "24h" };

const NOW = new Date("2026-08-03T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("format_date_short", () => {
  it("omits the year by default so existing callers are unchanged", () => {
    expect(format_date_short(new Date("2022-08-03T12:00:00Z"), US)).not.toMatch(/2022/);
  });

  it("includes the year when asked, in every date_format preference", () => {
    const d = new Date("2022-08-03T12:00:00Z");
    expect(format_date_short(d, US, true)).toMatch(/2022/);
    expect(format_date_short(d, EU, true)).toMatch(/2022/);
    expect(format_date_short(d, ISO, true)).toMatch(/2022/);
  });
});

describe("format_email_list_timestamp", () => {
  it("disambiguates an older-year message with the year", () => {
    const d = new Date("2022-08-02T09:00:00Z");
    expect(format_email_list_timestamp(d, US)).toMatch(/2022/);
    expect(format_email_list_timestamp(d, EU)).toMatch(/2022/);
    expect(format_email_list_timestamp(d, ISO)).toMatch(/2022/);
  });

  it("keeps same-year rows compact", () => {
    expect(format_email_list_timestamp(new Date("2026-08-02T09:00:00Z"), EU)).not.toMatch(
      /2026/,
    );
  });

  it("still shows only the time for today", () => {
    expect(format_email_list_timestamp(new Date("2026-08-03T09:30:00Z"), ISO)).toMatch(
      /^\d{2}:\d{2}$/,
    );
  });
});

describe("format_email_detail_timestamp", () => {
  it("includes the year for an email from a previous year", () => {
    const result = format_email_detail_timestamp(new Date("2022-08-03T15:04:00Z"), US);
    expect(result).toMatch(/2022/);
  });

  it("distinguishes the same calendar day across different years", () => {
    const this_year = format_email_detail_timestamp(new Date("2026-08-01T15:04:00Z"), US);
    const old_year = format_email_detail_timestamp(new Date("2022-08-01T15:04:00Z"), US);
    expect(this_year).not.toBe(old_year);
    expect(old_year).toMatch(/2022/);
  });

  it("does not clutter same-year dates with a redundant year", () => {
    const result = format_email_detail_timestamp(new Date("2026-01-15T15:04:00Z"), US);
    expect(result).not.toMatch(/2026/);
  });

  it("still uses relative wording for today and yesterday", () => {
    expect(format_email_detail_timestamp(new Date("2026-08-03T09:00:00Z"), US)).toMatch(/Today/);
    expect(format_email_detail_timestamp(new Date("2026-08-02T09:00:00Z"), US)).toMatch(/Yesterday/);
  });

  it("carries the year through every date_format preference", () => {
    const d = new Date("2019-03-09T15:04:00Z");
    expect(format_email_detail_timestamp(d, US)).toMatch(/2019/);
    expect(format_email_detail_timestamp(d, EU)).toMatch(/2019/);
    expect(format_email_detail_timestamp(d, ISO)).toMatch(/2019/);
  });
});

describe("format_full_date", () => {
  it("always includes the year, whatever the preference", () => {
    const d = new Date("2022-07-31T09:17:49Z");
    expect(format_full_date(d, US)).toMatch(/2022/);
    expect(format_full_date(d, EU)).toMatch(/2022/);
    expect(format_full_date(d, ISO)).toMatch(/2022/);
  });

  it("includes the year even for a current-year date", () => {
    expect(format_full_date(new Date("2026-07-31T09:17:49Z"), US)).toMatch(/2026/);
  });
});

describe("format_full_datetime", () => {
  it("includes the year in the translated branch", () => {
    const t = (_key: string, vars?: Record<string, unknown>) =>
      `${vars?.date} at ${vars?.time}`;
    expect(format_full_datetime(new Date("2022-07-31T09:17:49Z"), US, t)).toMatch(/2022/);
  });

  it("includes the year in the untranslated Intl branch", () => {
    expect(format_full_datetime(new Date("2022-07-31T09:17:49Z"), US)).toMatch(/2022/);
  });
});
