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
import type { FilterState } from "@/components/search/search_modal_types";

import { describe, it, expect } from "vitest";

import { search_filters_to_rule_seed } from "@/components/mail_rules/search_filter_seed";

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    fields: ["all"],
    has_attachments: undefined,
    is_starred: undefined,
    date_from: "",
    date_to: "",
    scope: "all",
    search_content: true,
    from: "",
    to: "",
    subject: "",
    has_words: "",
    does_not_have: "",
    size_op: "greater",
    size_value: "",
    size_unit: "mb",
    within_days: "",
    ...overrides,
  };
}

describe("search_filters_to_rule_seed", () => {
  it("turns every rule-compatible search field into a condition", () => {
    const seed = search_filters_to_rule_seed(
      filters({
        from: " news@shop.example ",
        to: "me@astermail.org",
        subject: "Weekly deals",
        has_words: "coupon",
        does_not_have: "receipt",
        has_attachments: true,
        size_op: "less",
        size_value: "2",
        size_unit: "mb",
      }),
      "Untitled rule",
    );

    expect(seed.match_mode).toBe("all");
    expect(seed.actions).toEqual([]);
    expect(seed.name).toBe("news@shop.example");
    expect(seed.conditions).toEqual([
      { type: "from", operator: "contains", value: "news@shop.example" },
      { type: "to", operator: "contains", value: "me@astermail.org" },
      { type: "subject", operator: "contains", value: "Weekly deals" },
      { type: "body", operator: "contains", value: "coupon" },
      { type: "body", operator: "does_not_contain", value: "receipt" },
      { type: "has_attachment", value: true },
      { type: "total_size", operator: "less_than", value: 2 * 1024 * 1024 },
    ]);
  });

  it("ignores fields a rule cannot express and falls back to a default name", () => {
    const seed = search_filters_to_rule_seed(
      filters({ scope: "inbox", within_days: "7", size_value: "0" }),
      "Untitled rule",
    );

    expect(seed.conditions).toEqual([]);
    expect(seed.name).toBe("Untitled rule");
  });

  it("names the rule after the subject when there is no sender", () => {
    const seed = search_filters_to_rule_seed(
      filters({
        subject: "Invoice\nready",
        size_value: "500",
        size_unit: "kb",
      }),
      "Untitled rule",
    );

    expect(seed.name).toBe("Invoice ready");
    expect(seed.conditions).toContainEqual({
      type: "total_size",
      operator: "greater_than",
      value: 500 * 1024,
    });
  });
});
