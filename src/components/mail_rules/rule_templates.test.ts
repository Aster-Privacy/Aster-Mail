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
import { describe, it, expect } from "vitest";

import { en } from "@/lib/i18n/translations/en";

import {
  RULE_TEMPLATES,
  RULE_TEMPLATE_CATEGORIES,
  template_to_seed,
  type RuleTemplate,
} from "./rule_templates";

type Cond = RuleTemplate["conditions"][number];
type Act = RuleTemplate["actions"][number];

function leaf_missing_value(c: Cond): boolean {
  if (c.type === "and" || c.type === "or")
    return c.conditions.some(leaf_missing_value);
  if (c.type === "not") return leaf_missing_value(c.condition);
  if (c.type === "header" && !c.name) return true;
  if ("operator" in c && c.operator === "is_empty") return false;
  if ("value" in c) {
    const v = (c as { value: unknown }).value;
    if (typeof v === "string") return v.length === 0;
  }
  return false;
}

function action_missing_value(a: Act): boolean {
  switch (a.type) {
    case "move_to":
      return a.folder_token === null;
    case "apply_labels":
      return a.label_tokens.length === 0;
    case "forward":
      return a.to === "";
    case "auto_reply":
      return a.template_id === "";
    default:
      return false;
  }
}

function en_value(key: string): string | undefined {
  const [ns, sub] = key.split(".") as [keyof typeof en, string];
  const namespace = en[ns] as unknown as Record<string, string>;
  return namespace?.[sub];
}

describe("rule templates catalog", () => {
  it("has unique ids", () => {
    const ids = RULE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every name and description key in English", () => {
    for (const tpl of RULE_TEMPLATES) {
      expect(en_value(tpl.name_key), tpl.name_key).toBeTruthy();
      expect(en_value(tpl.description_key), tpl.description_key).toBeTruthy();
    }
  });

  it("ships at least one condition and one action per template", () => {
    for (const tpl of RULE_TEMPLATES) {
      expect(tpl.conditions.length, tpl.id).toBeGreaterThan(0);
      expect(tpl.actions.length, tpl.id).toBeGreaterThan(0);
    }
  });

  it("uses only literal operators, never regex (ReDoS safety)", () => {
    const has_regex = (c: RuleTemplate["conditions"][number]): boolean => {
      if (c.type === "and" || c.type === "or") return c.conditions.some(has_regex);
      if (c.type === "not") return has_regex(c.condition);
      return (
        "operator" in c &&
        (c as { operator?: string }).operator === "matches_regex"
      );
    };
    for (const tpl of RULE_TEMPLATES) {
      expect(tpl.conditions.some(has_regex), tpl.id).toBe(false);
    }
  });

  it("only uses categories the gallery can render", () => {
    for (const tpl of RULE_TEMPLATES) {
      expect(RULE_TEMPLATE_CATEGORIES, tpl.id).toContain(tpl.category);
    }
  });

  it("flags needs_config exactly when a user value is missing", () => {
    for (const tpl of RULE_TEMPLATES) {
      const requires_input =
        tpl.conditions.some(leaf_missing_value) ||
        tpl.actions.some(action_missing_value);
      expect(!!tpl.needs_config, tpl.id).toBe(requires_input);
    }
  });

  it("deep-copies into a seed so the shared catalog cannot be mutated", () => {
    const tpl = RULE_TEMPLATES.find((t) => t.conditions.length > 0)!;
    const before = JSON.stringify(tpl.conditions);
    const seed = template_to_seed(tpl, "My copy");

    expect(seed.conditions).not.toBe(tpl.conditions);
    (seed.conditions[0] as { value?: unknown }).value = "mutated-value-xyz";
    seed.actions.push({ type: "star", value: true });

    expect(JSON.stringify(tpl.conditions)).toBe(before);
    expect(seed.name).toBe("My copy");
  });
});
