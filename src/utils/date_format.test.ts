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
  format_timestamp_smart,
  locale_date_format,
  set_display_date_format,
  format_date,
  format_iso_date,
  set_display_time_zone,
  locale_time_format,
  set_display_locale,
  date_from_zoned_parts,
  zoned_add_days,
  zoned_next_weekday,
  get_zoned_parts,
  zoned_start_of_day,
  zoned_weekday,
  zoned_with_time,
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
    expect(format_date_short(new Date("2022-08-03T12:00:00Z"), US)).not.toMatch(
      /2022/,
    );
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
    expect(
      format_email_list_timestamp(new Date("2026-08-02T09:00:00Z"), EU),
    ).not.toMatch(/2026/);
  });

  it("still shows only the time for today", () => {
    expect(
      format_email_list_timestamp(new Date("2026-08-03T09:30:00Z"), ISO),
    ).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("format_email_detail_timestamp", () => {
  it("includes the year for an email from a previous year", () => {
    const result = format_email_detail_timestamp(
      new Date("2022-08-03T15:04:00Z"),
      US,
    );

    expect(result).toMatch(/2022/);
  });

  it("distinguishes the same calendar day across different years", () => {
    const this_year = format_email_detail_timestamp(
      new Date("2026-08-01T15:04:00Z"),
      US,
    );
    const old_year = format_email_detail_timestamp(
      new Date("2022-08-01T15:04:00Z"),
      US,
    );

    expect(this_year).not.toBe(old_year);
    expect(old_year).toMatch(/2022/);
  });

  it("does not clutter same-year dates with a redundant year", () => {
    const result = format_email_detail_timestamp(
      new Date("2026-01-15T15:04:00Z"),
      US,
    );

    expect(result).not.toMatch(/2026/);
  });

  it("still uses relative wording for today and yesterday", () => {
    expect(
      format_email_detail_timestamp(new Date("2026-08-03T09:00:00Z"), US),
    ).toMatch(/Today/);
    expect(
      format_email_detail_timestamp(new Date("2026-08-02T09:00:00Z"), US),
    ).toMatch(/Yesterday/);
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
    expect(format_full_date(new Date("2026-07-31T09:17:49Z"), US)).toMatch(
      /2026/,
    );
  });
});

describe("format_full_datetime", () => {
  it("includes the year in the translated branch", () => {
    const t = (_key: string, vars?: Record<string, unknown>) =>
      `${vars?.date} at ${vars?.time}`;

    expect(
      format_full_datetime(new Date("2022-07-31T09:17:49Z"), US, t),
    ).toMatch(/2022/);
  });

  it("includes the year in the untranslated Intl branch", () => {
    expect(format_full_datetime(new Date("2022-07-31T09:17:49Z"), US)).toMatch(
      /2022/,
    );
  });
});

describe("locale_date_format", () => {
  afterEach(() => set_display_locale(undefined));

  it("keeps month-first ordering for United States English", () => {
    set_display_locale("en-US");
    expect(locale_date_format()).toBe("MM/DD/YYYY");
  });

  it("uses day-first ordering for German", () => {
    set_display_locale("de-DE");
    expect(locale_date_format()).toBe("DD/MM/YYYY");
  });

  it("uses year-first ordering for Japanese", () => {
    set_display_locale("ja-JP");
    expect(locale_date_format()).toBe("YYYY-MM-DD");
  });
});

describe("locale_time_format", () => {
  afterEach(() => set_display_locale(undefined));

  it("keeps a 12 hour clock for United States English", () => {
    set_display_locale("en-US");
    expect(locale_time_format()).toBe("12h");
  });

  it("uses a 24 hour clock for German", () => {
    set_display_locale("de-DE");
    expect(locale_time_format()).toBe("24h");
  });

  it("uses a 24 hour clock for French", () => {
    set_display_locale("fr-FR");
    expect(locale_time_format()).toBe("24h");
  });
});

describe("yesterday across a daylight saving change", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
    vi.useRealTimers();
  });

  it("still reads Yesterday on the day the clocks go back", () => {
    set_display_time_zone("America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T04:00:00Z"));

    const saturday = new Date("2026-10-31T18:00:00Z");

    expect(format_timestamp_smart(saturday, US)).toBe("Yesterday");
  });

  it("still reads Yesterday on the day the clocks go forward", () => {
    set_display_time_zone("America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T23:00:00Z"));

    const saturday = new Date("2026-03-07T18:00:00Z");

    expect(format_timestamp_smart(saturday, US)).toBe("Yesterday");
  });
});

describe("default format options", () => {
  beforeEach(() => {
    set_display_time_zone(undefined);
    set_display_date_format(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    set_display_date_format(undefined);
    localStorage.clear();
  });

  it("honors the stored date format preference when no options are passed", () => {
    set_display_date_format("DD/MM/YYYY");

    expect(format_date(new Date("2026-03-07T12:00:00Z"))).toBe("07/03/2026");
  });

  it("reads the date format preference from storage on a cold start", () => {
    localStorage.setItem("astermail_date_format", "YYYY-MM-DD");

    expect(format_date(new Date("2026-03-07T12:00:00Z"))).toBe("2026-03-07");
  });

  it("falls back to month first when nothing is stored", () => {
    expect(format_date(new Date("2026-03-07T12:00:00Z"))).toBe("03/07/2026");
  });
});

describe("format_iso_date", () => {
  beforeEach(() => {
    set_display_date_format(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    set_display_date_format(undefined);
    localStorage.clear();
  });

  it("keeps a calendar date on its own day in every time zone", () => {
    set_display_time_zone("Pacific/Kiritimati");
    set_display_date_format("DD/MM/YYYY");

    expect(format_iso_date("1990-04-12")).toBe("12/04/1990");
  });

  it("leaves a value it does not recognize untouched", () => {
    expect(format_iso_date("")).toBe("");
    expect(format_iso_date("April 1990")).toBe("April 1990");
  });
});

describe("zoned date construction", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
  });

  it("reads wall-clock parts in the account time zone", () => {
    set_display_time_zone("Asia/Tokyo");

    expect(get_zoned_parts(new Date("2026-08-03T00:30:00Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 3,
      hours: 9,
      minutes: 30,
    });
  });

  it("builds an instant from wall-clock parts in the account time zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const built = date_from_zoned_parts({
      year: 2026,
      month: 8,
      day: 3,
      hours: 9,
      minutes: 0,
    });

    expect(built.toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("round-trips across a daylight saving boundary", () => {
    set_display_time_zone("America/New_York");

    const before = date_from_zoned_parts({
      year: 2026,
      month: 3,
      day: 7,
      hours: 9,
      minutes: 0,
    });
    const after = date_from_zoned_parts({
      year: 2026,
      month: 3,
      day: 9,
      hours: 9,
      minutes: 0,
    });

    expect(get_zoned_parts(before).hours).toBe(9);
    expect(get_zoned_parts(after).hours).toBe(9);
    expect(after.getTime() - before.getTime()).toBe(47 * 60 * 60 * 1000);
  });

  it("sets a time of day in the account time zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = zoned_with_time(new Date("2026-08-03T22:00:00Z"), 8, 0);

    expect(target.toISOString()).toBe("2026-08-03T23:00:00.000Z");
    expect(get_zoned_parts(target)).toEqual({
      year: 2026,
      month: 8,
      day: 4,
      hours: 8,
      minutes: 0,
    });
  });

  it("starts the day and adds days in the account time zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const start = zoned_start_of_day(new Date("2026-08-03T22:00:00Z"));

    expect(get_zoned_parts(start)).toEqual({
      year: 2026,
      month: 8,
      day: 4,
      hours: 0,
      minutes: 0,
    });
    expect(get_zoned_parts(zoned_add_days(start, 1)).day).toBe(5);
  });

  it("rolls a month over when adding days", () => {
    set_display_time_zone("Asia/Tokyo");

    const rolled = zoned_add_days(
      date_from_zoned_parts({
        year: 2026,
        month: 8,
        day: 31,
        hours: 9,
        minutes: 0,
      }),
      1,
    );

    expect(get_zoned_parts(rolled)).toEqual({
      year: 2026,
      month: 9,
      day: 1,
      hours: 9,
      minutes: 0,
    });
  });

  it("finds the next weekday in the account time zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const saturday_evening = new Date("2026-08-08T22:00:00Z");

    expect(zoned_weekday(saturday_evening)).toBe(0);

    const monday = zoned_next_weekday(saturday_evening, 1);

    expect(get_zoned_parts(monday)).toEqual({
      year: 2026,
      month: 8,
      day: 10,
      hours: 0,
      minutes: 0,
    });
  });

  it("matches local time when no account time zone is set", () => {
    set_display_time_zone(undefined);

    const source = new Date(2026, 7, 3, 22, 0, 0, 0);

    expect(get_zoned_parts(source)).toEqual({
      year: 2026,
      month: 8,
      day: 3,
      hours: 22,
      minutes: 0,
    });
    expect(zoned_with_time(source, 8, 0).getTime()).toBe(
      new Date(2026, 7, 3, 8, 0, 0, 0).getTime(),
    );
    expect(zoned_start_of_day(source).getTime()).toBe(
      new Date(2026, 7, 3, 0, 0, 0, 0).getTime(),
    );
  });
});
