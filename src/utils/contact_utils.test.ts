import { afterEach, describe, it, expect, vi } from "vitest";

import { get_days_until_birthday, parse_csv_records } from "./contact_utils";

describe("parse_csv_records", () => {
  it("keeps a quoted field with embedded newlines as one field", () => {
    const csv =
      "First Name,Last Name,Notes\n" +
      'John,Smith,"123 Main St\nApt 4\nSpringfield"\n';

    const records = parse_csv_records(csv);

    expect(records).toHaveLength(2);
    expect(records[1]).toEqual([
      "John",
      "Smith",
      "123 Main St\nApt 4\nSpringfield",
    ]);
  });

  it("does not turn each physical line of a multi-line address into a new row", () => {
    const csv =
      "First Name,Last Name,Address 1 - Formatted,E-mail 1 - Value\n" +
      'Jane,Doe,"742 Evergreen Terrace\nSpringfield, USA",jane@example.com\n';

    const records = parse_csv_records(csv);

    expect(records).toHaveLength(2);
    expect(records[1][0]).toBe("Jane");
    expect(records[1][1]).toBe("Doe");
    expect(records[1][3]).toBe("jane@example.com");
  });

  it("handles escaped double quotes inside a quoted field", () => {
    const csv = 'Name,Note\nAcme,"He said ""hello"" today"\n';

    const records = parse_csv_records(csv);

    expect(records[1]).toEqual(["Acme", 'He said "hello" today']);
  });

  it("handles CRLF line endings and trailing row without newline", () => {
    const csv = "a,b\r\n1,2\r\n3,4";

    const records = parse_csv_records(csv);

    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drops fully blank lines between records", () => {
    const csv = "a,b\n\n1,2\n\n";

    const records = parse_csv_records(csv);

    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("get_days_until_birthday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function on(year: number, month: number, day: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(year, month - 1, day, 15, 30));
  }

  it("counts down to birthdays written in other valid forms", () => {
    on(2026, 5, 10);
    expect(get_days_until_birthday("1990-05-15")).toBe(5);
    expect(get_days_until_birthday("19900515")).toBe(5);
    expect(get_days_until_birthday("--0515")).toBe(5);
    expect(get_days_until_birthday("--05-15")).toBe(5);
    expect(get_days_until_birthday("0000-05-15")).toBe(5);
  });

  it("rolls a passed birthday over to next year", () => {
    on(2026, 5, 16);
    expect(get_days_until_birthday("--05-15")).toBe(364);
  });

  it("lands a 29 February birthday on the real day in a leap year", () => {
    on(2027, 3, 2);
    expect(get_days_until_birthday("--02-29")).toBe(364);

    on(2028, 2, 20);
    expect(get_days_until_birthday("--02-29")).toBe(9);
  });

  it("returns NaN for a value that is not a date", () => {
    on(2026, 5, 10);
    expect(get_days_until_birthday("someday")).toBeNaN();
  });

  it("does not count down to a birthday without a day", () => {
    on(2026, 3, 25);
    expect(get_days_until_birthday("--04")).toBeNaN();
    expect(get_days_until_birthday("1985-04")).toBeNaN();
  });

  it("does not guess a day from text or an impossible date", () => {
    on(2026, 2, 20);
    expect(get_days_until_birthday("April 15")).toBeNaN();
    expect(get_days_until_birthday("1900-02-29")).toBeNaN();
    expect(get_days_until_birthday("2000-02-30")).toBeNaN();
  });

  it("counts down to a birthday stored with the placeholder year 1604", () => {
    on(2026, 4, 10);
    expect(get_days_until_birthday("1604-04-15")).toBe(5);
  });
});
