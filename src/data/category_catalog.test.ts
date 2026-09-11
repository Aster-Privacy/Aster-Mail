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
  BUILTIN_CATEGORIES,
  RULE_CATEGORY_OPTIONS,
  rule_category_label_key,
} from "@/data/category_catalog";
import { RULE_TEMPLATES } from "@/components/mail_rules/rule_templates";
import { en } from "@/lib/i18n/translations/en";

function english(key: string): string {
  const [section, name] = key.split(".");

  return (en as unknown as Record<string, Record<string, string>>)[section][
    name
  ];
}

const CANONICAL = [
  ["primary", "Inbox"],
  ["promotions", "Deals"],
  ["newsletters", "Newsletters"],
  ["social", "Social"],
  ["updates", "Notifications"],
  ["transactions", "Purchases"],
  ["forums", "Discussions"],
  ["finance", "Finance"],
  ["travel", "Travel"],
  ["shopping", "Shopping"],
];

describe("category_catalog", () => {
  it("keeps the canonical order and labels", () => {
    expect(
      BUILTIN_CATEGORIES.map((def) => [def.id, english(def.label_key)]),
    ).toEqual(CANONICAL);
  });

  it("offers every built-in category to the rules categorize action", () => {
    expect(RULE_CATEGORY_OPTIONS.map((option) => option.id)).toEqual(
      CANONICAL.map(([id]) => id),
    );
    expect(
      RULE_CATEGORY_OPTIONS.map((option) => english(option.label_key)),
    ).toEqual(CANONICAL.map(([, label]) => label));
  });

  it("labels rule chips with the same names as the tabs", () => {
    expect(english(rule_category_label_key("newsletters")!)).toBe(
      "Newsletters",
    );
    expect(english(rule_category_label_key("forums")!)).toBe("Discussions");
    expect(english(rule_category_label_key("important")!)).toBe("Important");
    expect(rule_category_label_key("custom:abc")).toBeUndefined();
  });

  it("uses only categories the catalog knows in rule templates", () => {
    const ids = new Set(BUILTIN_CATEGORIES.map((def) => def.id));

    for (const template of RULE_TEMPLATES) {
      for (const action of template.actions) {
        if (action.type === "categorize") {
          expect(ids.has(action.category)).toBe(true);
        }
      }
    }

    const newsletters = RULE_TEMPLATES.find((tpl) => tpl.id === "newsletters");

    expect(newsletters?.actions).toEqual([
      { type: "categorize", category: "newsletters" },
    ]);
  });
});
