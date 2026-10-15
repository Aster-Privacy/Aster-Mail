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
import { describe, expect, it } from "vitest";

import { parse_search_query } from "./parse";
import { add_operator_to_query } from "./query";

import { split_search_terms } from "@/utils/search_query";

function terms_of(query: string): string[] {
  return split_search_terms(parse_search_query(query).text_query);
}

describe("parse_search_query negation", () => {
  it.each(["-from:alice@example.com", "NOT from:alice@example.com"])(
    "reads %s as a negated sender",
    (query) => {
      const parsed = parse_search_query(query);

      expect(parsed.operators).toHaveLength(1);
      expect(parsed.operators[0]).toMatchObject({
        type: "from",
        value: "alice@example.com",
        negated: true,
      });
      expect(terms_of(query)).toEqual([]);
    },
  );

  it("keeps a plain operator positive", () => {
    expect(parse_search_query("from:alice").operators[0].negated).toBe(false);
  });

  it("negates a quoted operator value after NOT", () => {
    const query = 'budget NOT subject:"weekly report"';
    const parsed = parse_search_query(query);

    expect(parsed.operators[0]).toMatchObject({
      type: "subject",
      value: "weekly report",
      negated: true,
    });
    expect(terms_of(query)).toEqual(["budget"]);
  });

  it("treats lowercase not as an ordinary word", () => {
    const parsed = parse_search_query("not urgent");

    expect(parsed.operators).toEqual([]);
    expect(terms_of("not urgent")).toEqual(["not", "urgent"]);
  });

  it("does not negate an operator after lowercase not", () => {
    const parsed = parse_search_query("not from:alice");

    expect(parsed.operators).toHaveLength(1);
    expect(parsed.operators[0]).toMatchObject({ type: "from", negated: false });
    expect(terms_of("not from:alice")).toEqual(["not"]);
  });

  it("turns an uppercase NOT word into a negated text term", () => {
    const parsed = parse_search_query("invoice NOT draft");

    expect(parsed.operators).toHaveLength(1);
    expect(parsed.operators[0]).toMatchObject({
      type: "text",
      value: "draft",
      negated: true,
    });
    expect(terms_of("invoice NOT draft")).toEqual(["invoice"]);
  });
});

describe("parse_search_query phrases", () => {
  it("keeps a quoted phrase as one term", () => {
    expect(terms_of('"quarterly report" budget')).toEqual([
      "quarterly report",
      "budget",
    ]);
  });

  it("splits unquoted words into separate terms", () => {
    expect(terms_of("quarterly report budget")).toEqual([
      "quarterly",
      "report",
      "budget",
    ]);
  });

  it("quotes an operator value that has a space", () => {
    const query = add_operator_to_query("", "from", "Jane Doe");

    expect(query).toBe('from:"Jane Doe"');
    expect(parse_search_query(query).operators[0]).toMatchObject({
      type: "from",
      value: "Jane Doe",
    });
  });
});

describe("parse_search_query operators it cannot evaluate", () => {
  it.each(["size:5mb", "larger:big", "after:someday", "date:2026-13-40"])(
    "treats %s as plain text",
    (query) => {
      expect(parse_search_query(query).operators).toEqual([]);
      expect(terms_of(query)).toEqual([query]);
    },
  );

  it("accepts a size range", () => {
    expect(parse_search_query("size:1mb-5mb").operators[0]).toMatchObject({
      type: "size",
      value: "1mb-5mb",
    });
  });

  it("accepts a single calendar day and a shortcut for date", () => {
    expect(parse_search_query("date:2026-03-02").operators[0]).toMatchObject({
      type: "date",
      value: "2026-03-02",
    });
    expect(parse_search_query("date:today").operators[0]).toMatchObject({
      type: "date",
      value: "today",
    });
  });

  it("never reads an empty operator prefix as a filter", () => {
    expect(parse_search_query("from:").operators).toEqual([]);
    expect(parse_search_query("report -from:").operators).toEqual([]);
  });
});

describe("literal operators inside quoted phrases", () => {
  it.each([
    '"notes from:alice@example.com"',
    '"invoice NOT draft"',
    '"invoice NOT subject:paid"',
  ])("keeps %s as literal text", (query) => {
    expect(parse_search_query(query).operators).toEqual([]);
    expect(terms_of(query)).toEqual([query.slice(1, -1).toLowerCase()]);
  });

  it("still parses real operators beside a literal phrase", () => {
    const query =
      'from:bob@example.com "notes from:alice@example.com" is:unread';
    expect(parse_search_query(query).operators.map((op) => op.type)).toEqual([
      "from",
      "is",
    ]);
    expect(terms_of(query)).toEqual(["notes from:alice@example.com"]);
  });
});
