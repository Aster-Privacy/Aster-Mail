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
  clear_filter_operators,
  count_filter_operators,
  ends_with_bare_operator,
  has_operator,
  remove_operator_at,
  strip_operators,
  toggle_operator,
} from "./rewrite";

describe("toggle_operator", () => {
  it("adds an operator that is absent", () => {
    expect(toggle_operator("report", "is", "unread")).toBe("report is:unread");
  });

  it("removes an operator that is present and keeps the text", () => {
    expect(toggle_operator("report is:unread budget", "is", "unread")).toBe(
      "report budget",
    );
  });

  it("does not count a negated operator as present", () => {
    expect(has_operator("-is:unread", "is", "unread")).toBe(false);
    expect(has_operator("NOT is:unread", "is", "unread")).toBe(false);
    expect(has_operator("IS:Unread", "is", "unread")).toBe(true);
  });
});

describe("clear_filter_operators", () => {
  it("removes every filter and keeps the free text and the scope", () => {
    const query = 'report from:alice -has:pdf in:trash NOT draft "q3 plan"';

    expect(count_filter_operators(query)).toBe(3);
    expect(clear_filter_operators(query)).toBe('report in:trash "q3 plan"');
  });

  it("counts nothing for a plain text search in a folder", () => {
    expect(count_filter_operators("report in:trash")).toBe(0);
  });
});

describe("remove_operator_at", () => {
  it("removes only the operator at that position", () => {
    expect(remove_operator_at("from:a to:b report from:a", 0)).toBe(
      "to:b report from:a",
    );
    expect(remove_operator_at("from:a to:b report from:a", 2)).toBe(
      "from:a to:b report",
    );
  });
});

describe("strip_operators", () => {
  it("leaves a word that only looks like the operator text", () => {
    expect(
      strip_operators(
        "notes about is:unread-ish is:unread",
        (operator) => operator.type === "is",
      ),
    ).toBe("notes about is:unread-ish");
  });
});

describe("ends_with_bare_operator", () => {
  it.each(["from:", "report to:", "-from:", "report AFTER:", "from: "])(
    "flags %s",
    (query) => {
      expect(ends_with_bare_operator(query)).toBe(true);
    },
  );

  it.each(["from:alice", "report", "", "see http:", "from: alice"])(
    "passes %s",
    (query) => {
      expect(ends_with_bare_operator(query)).toBe(false);
    },
  );
});
