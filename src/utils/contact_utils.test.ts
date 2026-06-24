import { describe, it, expect } from "vitest";

import { parse_csv_records } from "./contact_utils";

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
