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
import type { Condition } from "@/services/api/mail_rules";

import { describe, it, expect } from "vitest";

import { parse, serialize } from "./expression_parser";

function round_trip(c: Condition): Condition | null {
  const result = parse(serialize(c));

  return result.ok ? result.ast : null;
}

describe("expression case_sensitive", () => {
  it("writes case_sensitive after the value of a case sensitive condition", () => {
    expect(
      serialize({
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      }),
    ).toBe('subject contains "URGENT" case_sensitive');
  });

  it("round trips case sensitivity on every text-like field", () => {
    const conditions: Condition[] = [
      { type: "from", operator: "is", value: "A@B.C", case_sensitive: true },
      {
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      },
      {
        type: "header",
        name: "X-Tag",
        operator: "starts_with",
        value: "Ops",
        case_sensitive: true,
      },
      {
        type: "attachment_name",
        operator: "ends_with",
        value: ".PDF",
        case_sensitive: true,
      },
    ];

    for (const c of conditions) {
      expect(round_trip(c)).toEqual(c);
    }
  });

  it("parses case_sensitive inside a larger expression", () => {
    expect(
      parse(
        'subject contains "URGENT" case_sensitive and body contains "invoice"',
      ),
    ).toEqual({
      ok: true,
      ast: {
        type: "and",
        conditions: [
          {
            type: "subject",
            operator: "contains",
            value: "URGENT",
            case_sensitive: true,
          },
          { type: "body", operator: "contains", value: "invoice" },
        ],
      },
    });
  });

  it("leaves case insensitive conditions unchanged", () => {
    expect(
      serialize({
        type: "subject",
        operator: "contains",
        value: "urgent",
        case_sensitive: false,
      }),
    ).toBe('subject contains "urgent"');
    expect(parse('subject contains "urgent"')).toEqual({
      ok: true,
      ast: { type: "subject", operator: "contains", value: "urgent" },
    });
  });

  it("reads the case flags the server writes", () => {
    expect(parse('from.address is "A@B.C" case_sensitive')).toEqual({
      ok: true,
      ast: {
        type: "from",
        operator: "is",
        value: "A@B.C",
        case_sensitive: true,
      },
    });
    expect(parse('header.X-Tag starts_with "Ops" case_sensitive')).toEqual({
      ok: true,
      ast: {
        type: "header",
        name: "X-Tag",
        operator: "starts_with",
        value: "Ops",
        case_sensitive: true,
      },
    });
    expect(parse('subject contains "urgent" ci')).toEqual({
      ok: true,
      ast: { type: "subject", operator: "contains", value: "urgent" },
    });
    expect(parse("subject is_empty case_sensitive")).toEqual({
      ok: true,
      ast: { type: "subject", operator: "is_empty", value: "" },
    });
  });

  it("reports a misplaced case flag clearly", () => {
    for (const text of [
      "case_sensitive",
      "ci",
      "spam_score > 5 case_sensitive",
      "date_received older_than_days 3 case_sensitive",
      "has_attachment case_sensitive",
      'subject contains "a" case_sensitive case_sensitive',
      'subject contains "a" match_case',
    ]) {
      const result = parse(text);

      expect(result.ok ? null : result.error).not.toBeNull();
    }
    for (const text of [
      "case_sensitive",
      "has_attachment case_sensitive",
      'subject contains "a" case_sensitive ci',
    ]) {
      const result = parse(text);

      expect(result.ok ? null : result.error).toBe("misplaced_case_flag");
    }
  });
});
