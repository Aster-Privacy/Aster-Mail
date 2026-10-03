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

import { set_display_locale } from "@/utils/date_format";
import {
  contact_date_from_parts,
  contact_date_input_value,
  format_contact_date,
  format_relative_time,
  format_relative_time_short,
  is_partial_contact_date,
  normalize_contact_date,
  vcard_date_value,
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

describe("format_contact_date", () => {
  afterEach(() => {
    set_display_locale(undefined);
  });

  it("spells the date in the app language, not the browser's", () => {
    set_display_locale("pt");
    expect(format_contact_date("1990-03-05")).toBe("5 de março de 1990");

    set_display_locale("de");
    expect(format_contact_date("1990-03-05")).toBe("5. März 1990");
  });

  it("keeps the calendar day of a date-only value", () => {
    set_display_locale("en");
    expect(format_contact_date("1990-03-05")).toBe("March 5, 1990");
  });

  it("reads the basic form instead of showing it raw", () => {
    set_display_locale("en");
    expect(format_contact_date("19900515")).toBe("May 15, 1990");
  });

  it("shows only the month and day when there is no year", () => {
    set_display_locale("en");
    expect(format_contact_date("--05-15")).toBe("May 15");
    expect(format_contact_date("--0515")).toBe("May 15");
    expect(format_contact_date("0000-10-05")).toBe("October 5");
    expect(format_contact_date("--02-29")).toBe("February 29");

    set_display_locale("pt");
    expect(format_contact_date("--05-15")).toBe("15 de maio");
  });

  it("shows a month without a day as the month, not the first of it", () => {
    set_display_locale("en");
    expect(format_contact_date("--04")).toBe("April");
    expect(format_contact_date("1985-04")).toBe("April 1985");

    set_display_locale("pt");
    expect(format_contact_date("--04")).toBe("abril");
    expect(format_contact_date("1985-04")).toBe("abril de 1985");
  });

  it("treats the placeholder years 1604 and 0000 as no year", () => {
    set_display_locale("en");
    expect(format_contact_date("1604-04-15")).toBe("April 15");
    expect(format_contact_date("1604-04")).toBe("April");
    expect(format_contact_date("0000-04")).toBe("April");

    set_display_locale("pt");
    expect(format_contact_date("1604-04-15")).toBe("15 de abril");
    expect(format_contact_date("0000-04")).toBe("abril");
  });

  it("shows a value it cannot read as written instead of guessing a date", () => {
    for (const locale of ["en", "pt"]) {
      set_display_locale(locale);
      expect(format_contact_date("April 15")).toBe("April 15");
      expect(format_contact_date("1900-02-29")).toBe("1900-02-29");
      expect(format_contact_date("2000-02-30")).toBe("2000-02-30");
      expect(format_contact_date("--13")).toBe("--13");
      expect(format_contact_date("1985-00")).toBe("1985-00");
    }
  });

  it("keeps 29 February only when the year has one", () => {
    set_display_locale("en");
    expect(format_contact_date("2000-02-29")).toBe("February 29, 2000");
    expect(format_contact_date("--02-29")).toBe("February 29");
    expect(format_contact_date("2001-02-29")).toBe("2001-02-29");

    set_display_locale("pt");
    expect(format_contact_date("2000-02-29")).toBe("29 de fevereiro de 2000");
    expect(format_contact_date("--02-29")).toBe("29 de fevereiro");
    expect(format_contact_date("2001-02-29")).toBe("2001-02-29");
  });
});

describe("normalize_contact_date", () => {
  it("rewrites every readable form to a calendar or yearless date", () => {
    expect(normalize_contact_date("19900515")).toBe("1990-05-15");
    expect(normalize_contact_date(" 1990-05-15 ")).toBe("1990-05-15");
    expect(normalize_contact_date("--0515")).toBe("--05-15");
    expect(normalize_contact_date("0000-05-15")).toBe("--05-15");
    expect(normalize_contact_date("1604-05-15", "1604")).toBe("--05-15");
  });

  it("leaves invalid or unknown values untouched", () => {
    expect(normalize_contact_date("1990-02-30")).toBe("1990-02-30");
    expect(normalize_contact_date("--13-01")).toBe("--13-01");
    expect(normalize_contact_date("May 15")).toBe("May 15");
  });
});

describe("contact date helpers", () => {
  it("only gives the date picker a value that has a year", () => {
    expect(contact_date_input_value("19900515")).toBe("1990-05-15");
    expect(contact_date_input_value("--05-15")).toBe("");
    expect(contact_date_input_value("May 15")).toBe("");
  });

  it("marks dates the picker cannot hold as partial", () => {
    expect(is_partial_contact_date("--05-15")).toBe(true);
    expect(is_partial_contact_date("--04")).toBe(true);
    expect(is_partial_contact_date("1985-04")).toBe(true);
    expect(is_partial_contact_date("1604-04-15")).toBe(true);
    expect(is_partial_contact_date("1990-05-15")).toBe(false);
    expect(is_partial_contact_date("April 15")).toBe(false);
    expect(is_partial_contact_date("")).toBe(false);
    expect(contact_date_input_value("--04")).toBe("");
    expect(contact_date_input_value("1985-04")).toBe("");
  });

  it("keeps partial dates as they are on import and export", () => {
    expect(normalize_contact_date("--04")).toBe("--04");
    expect(normalize_contact_date("1985-04")).toBe("1985-04");
    expect(normalize_contact_date("1604-04-15")).toBe("--04-15");
    expect(vcard_date_value("--04", true)).toBe("--04");
    expect(vcard_date_value("1985-04", false)).toBe("1985-04");
  });

  it("builds a yearless value when the device has no year", () => {
    expect(contact_date_from_parts({ month: 10, day: 5 })).toBe("--10-05");
    expect(contact_date_from_parts({ year: 1990, month: 5, day: 1 })).toBe(
      "1990-05-01",
    );
  });

  it("writes the vCard 4 basic form for a yearless date", () => {
    expect(vcard_date_value("--05-15", true)).toBe("--0515");
    expect(vcard_date_value("0000-05-15", false)).toBe("--05-15");
    expect(vcard_date_value("1990-05-15", true)).toBe("1990-05-15");
  });
});
