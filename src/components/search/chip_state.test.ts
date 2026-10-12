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

import {
  describe_date_filter,
  is_chip_covered_operator,
  person_chip_label,
} from "./chip_state";

import {
  create_active_filters,
  parse_search_query,
} from "@/utils/search_operators";

type Translate = NonNullable<Parameters<typeof create_active_filters>[1]>;

const t = ((key: string) => key) as Translate;

function date_state(query: string) {
  return describe_date_filter(parse_search_query(query).operators);
}

function labels(query: string): string[] {
  return create_active_filters(parse_search_query(query).operators, t).map(
    (filter) => filter.label,
  );
}

describe("describe_date_filter", () => {
  it("reports no date filter", () => {
    expect(date_state("report from:alice")).toEqual({ kind: "none" });
  });

  it("names a shortcut", () => {
    expect(date_state("date:this_week")).toEqual({
      kind: "shortcut",
      label_key: "mail.filter_this_week",
    });
  });

  it("names a single day", () => {
    expect(date_state("date:2026-03-02")).toEqual({
      kind: "day",
      value: "2026-03-02",
    });
    expect(date_state("after:2026-03-02 before:2026-03-03")).toEqual({
      kind: "day",
      value: "2026-03-02",
    });
  });

  it("shows the last included day of a range", () => {
    expect(date_state("after:2026-02-27 before:2026-03-01")).toEqual({
      kind: "range",
      from: "2026-02-27",
      to: "2026-02-28",
    });
  });

  it("names an open ended window", () => {
    expect(date_state("after:2026-03-02")).toEqual({
      kind: "after",
      value: "2026-03-02",
    });
    expect(date_state("before:2026-03-02")).toEqual({
      kind: "before",
      value: "2026-03-02",
    });
  });

  it("ignores a negated date operator", () => {
    expect(date_state("-after:2026-03-02")).toEqual({ kind: "none" });
  });
});

describe("person_chip_label", () => {
  it("counts the values past the first", () => {
    expect(person_chip_label([])).toBeNull();
    expect(person_chip_label(["alice"])).toBe("alice");
    expect(person_chip_label(["alice", "bob", "carol"])).toBe("alice +2");
  });
});

describe("is_chip_covered_operator", () => {
  it("leaves every negated operator to its own chip", () => {
    const [negated_from, positive_from, negated_word, subject] =
      parse_search_query(
        "-from:alice from:bob NOT draft subject:plan",
      ).operators;

    expect(is_chip_covered_operator(negated_from)).toBe(false);
    expect(is_chip_covered_operator(positive_from)).toBe(true);
    expect(is_chip_covered_operator(negated_word)).toBe(false);
    expect(is_chip_covered_operator(subject)).toBe(false);
  });
});

describe("create_active_filters labels", () => {
  it.each([
    "-from:alice",
    "NOT to:bob",
    "-subject:plan",
    "-is:unread",
    "-label:work",
    "-after:2026-03-02",
    "-filename:report.pdf",
    "NOT draft",
  ])("marks %s as negated", (query) => {
    const [label] = labels(query);

    expect(label.startsWith("mail.filter_not_prefix")).toBe(true);
  });

  it("names a negated attachment filter", () => {
    expect(labels("-has:attachment")).toEqual(["mail.filter_no_attachments"]);
    expect(labels("-has:pdf")).toEqual(["mail.filter_no_type"]);
  });

  it("does not mark a positive filter as negated", () => {
    for (const label of labels("from:alice subject:plan is:unread")) {
      expect(label).not.toContain("mail.filter_not_prefix");
    }
  });

  it("gives each repeated operator its own id", () => {
    const filters = create_active_filters(
      parse_search_query("from:alice from:alice -from:alice").operators,
      t,
    );

    expect(new Set(filters.map((filter) => filter.id)).size).toBe(3);
  });
});
