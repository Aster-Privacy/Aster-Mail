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
import { afterEach, describe, expect, it } from "vitest";

import { parse_search_query } from "@/utils/search_operators";
import { set_display_time_zone } from "@/utils/date_format";
import {
  build_chunk_skip_plan,
  build_gram_filter,
  collect_grams,
  date_boundary_local,
  date_operator_range,
  parse_gram_filter,
} from "@/services/search_chunk_filter";

function filter_for(...texts: string[]) {
  const grams = new Set<string>();

  for (const text of texts) collect_grams(text, grams);

  return parse_gram_filter(build_gram_filter(grams))!;
}

function plan_for(query: string) {
  return build_chunk_skip_plan({
    terms: [],
    operators: parse_search_query(query).operators,
    probe_terms: false,
  });
}

function skips(query: string, ...texts: string[]): boolean {
  const plan = plan_for(query);

  return plan.uses_grams && plan.skip_by_grams(filter_for(...texts));
}

afterEach(() => {
  set_display_time_zone(undefined);
});

describe("gram skipping for repeated people operators", () => {
  const chunk = ["alice@example.com", "Alice Hart", "priya@example.org"];

  it("keeps a chunk when one of several from: values can match", () => {
    expect(skips("from:alice from:zzzzqqqq", ...chunk)).toBe(false);
    expect(skips("from:zzzzqqqq from:alice", ...chunk)).toBe(false);
  });

  it("skips a chunk when no from: value can match", () => {
    expect(skips("from:zzzzqqqq from:yyyywwww", ...chunk)).toBe(true);
    expect(skips("from:zzzzqqqq", ...chunk)).toBe(true);
  });

  it.each(["to", "contact"])("treats repeated %s: values the same", (type) => {
    expect(skips(`${type}:priya ${type}:zzzzqqqq`, ...chunk)).toBe(false);
    expect(skips(`${type}:yyyywwww ${type}:zzzzqqqq`, ...chunk)).toBe(true);
  });

  it("still requires every operator type", () => {
    expect(skips("from:alice to:zzzzqqqq", ...chunk)).toBe(true);
    expect(skips("from:alice from:zzzzqqqq to:priya", ...chunk)).toBe(false);
    expect(skips("from:alice subject:zzzzqqqq", ...chunk)).toBe(true);
  });

  it("cannot skip when one value is too short to probe", () => {
    expect(skips("from:al from:zzzzqqqq", ...chunk)).toBe(false);
  });

  it("never lets a negated value cause a skip", () => {
    expect(skips("-from:zzzzqqqq", ...chunk)).toBe(false);
    expect(skips("from:alice -from:zzzzqqqq", ...chunk)).toBe(false);
  });
});

describe("date boundaries in the display time zone", () => {
  it("places the boundary at local midnight", () => {
    set_display_time_zone("Asia/Tokyo");

    expect(date_boundary_local("2026-03-02", false)).toBe(
      Date.parse("2026-03-01T15:00:00Z"),
    );

    set_display_time_zone("America/Los_Angeles");

    expect(date_boundary_local("2026-03-02", false)).toBe(
      Date.parse("2026-03-02T08:00:00Z"),
    );
  });

  it("gives a single day its own local range", () => {
    set_display_time_zone("Asia/Tokyo");

    const range = date_operator_range("2026-03-02")!;

    expect(range.from).toBe(Date.parse("2026-03-01T15:00:00Z"));
    expect(range.to).toBeGreaterThanOrEqual(Date.parse("2026-03-02T14:59:59Z"));
    expect(range.to).toBeLessThan(Date.parse("2026-03-02T15:00:00Z"));
  });

  it("rejects a value that is not a day or a shortcut", () => {
    expect(date_operator_range("someday")).toBeNull();
    expect(Number.isNaN(date_boundary_local("someday", false))).toBe(true);
  });
});
