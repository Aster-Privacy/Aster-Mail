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
import type { Action, Condition, Rule } from "@/services/api/mail_rules";

import { describe, expect, it } from "vitest";

import {
  alias_rule_delivery,
  alias_rule_label,
  rule_alias_delivery_conflict,
  rule_alias_label_conflict,
  type AliasDeliverySetting,
} from "@/lib/alias_rule_delivery";

const build_rule = (overrides: Partial<Rule>): Rule => ({
  id: "rule_1",
  name: "Receipts",
  color: "#6366f1",
  enabled: true,
  match_mode: "all",
  conditions: [],
  actions: [],
  sort_order: 0,
  applied_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const to_is = (value: string): Condition => ({
  type: "to",
  operator: "is",
  value,
});

const delivery = (
  overrides: Partial<AliasDeliverySetting> = {},
): AliasDeliverySetting => ({
  delivery_folder_token: null,
  delivery_label_token: null,
  never_inbox: false,
  ...overrides,
});

describe("alias_rule_delivery", () => {
  it("finds the rule that routes an alias to a folder", () => {
    const rules = [
      build_rule({
        conditions: [to_is("shop@aster.cx")],
        actions: [{ type: "move_to", folder_token: "folder_a" }],
      }),
    ];

    expect(alias_rule_delivery(rules, "shop@aster.cx")).toEqual({
      rule_id: "rule_1",
      rule_name: "Receipts",
      folder_token: "folder_a",
    });
  });

  it("ignores disabled rules and rules for other addresses", () => {
    const rules = [
      build_rule({
        id: "off",
        enabled: false,
        conditions: [to_is("shop@aster.cx")],
        actions: [{ type: "move_to", folder_token: "folder_a" }],
      }),
      build_rule({
        id: "other",
        conditions: [to_is("news@aster.cx")],
        actions: [{ type: "move_to", folder_token: "folder_b" }],
      }),
    ];

    expect(alias_rule_delivery(rules, "shop@aster.cx")).toBeNull();
  });

  it("matches addresses nested inside logic groups and domain operators", () => {
    const rules = [
      build_rule({
        conditions: [
          {
            type: "or",
            conditions: [
              to_is("other@aster.cx"),
              { type: "cc", operator: "matches_domain", value: "aster.cx" },
            ],
          },
        ],
        actions: [{ type: "move_to", folder_token: "folder_a" }],
      }),
    ];

    expect(alias_rule_delivery(rules, "shop@aster.cx")?.folder_token).toBe(
      "folder_a",
    );
  });

  it("finds the rule that labels an alias", () => {
    const rules = [
      build_rule({
        conditions: [to_is("shop@aster.cx")],
        actions: [{ type: "apply_labels", label_tokens: ["tag_a", "tag_b"] }],
      }),
    ];

    expect(alias_rule_label(rules, "shop@aster.cx")).toEqual({
      rule_id: "rule_1",
      rule_name: "Receipts",
      label_tokens: ["tag_a", "tag_b"],
    });
  });

  it("returns null for a blank or malformed address", () => {
    const rules = [
      build_rule({
        conditions: [to_is("shop@aster.cx")],
        actions: [{ type: "move_to", folder_token: "folder_a" }],
      }),
    ];

    expect(alias_rule_delivery(rules, "  ")).toBeNull();
    expect(alias_rule_label(rules, "shop")).toBeNull();
  });
});

describe("rule_alias_delivery_conflict", () => {
  const alias_delivery = new Map<string, AliasDeliverySetting>([
    ["shop@aster.cx", delivery({ delivery_folder_token: "folder_a" })],
  ]);

  it("flags a rule that routes elsewhere", () => {
    const actions: Action[] = [{ type: "move_to", folder_token: "folder_b" }];

    expect(
      rule_alias_delivery_conflict(
        [to_is("shop@aster.cx")],
        actions,
        alias_delivery,
      ),
    ).toEqual({
      alias_address: "shop@aster.cx",
      alias_delivery: alias_delivery.get("shop@aster.cx"),
      rule_folder_token: "folder_b",
    });
  });

  it("stays quiet when the targets agree", () => {
    const actions: Action[] = [{ type: "move_to", folder_token: "folder_a" }];

    expect(
      rule_alias_delivery_conflict(
        [to_is("shop@aster.cx")],
        actions,
        alias_delivery,
      ),
    ).toBeNull();
  });

  it("stays quiet when the alias has no explicit target", () => {
    const actions: Action[] = [{ type: "move_to", folder_token: "folder_b" }];

    expect(
      rule_alias_delivery_conflict(
        [to_is("news@aster.cx")],
        actions,
        new Map([["news@aster.cx", delivery()]]),
      ),
    ).toBeNull();
  });
});

describe("rule_alias_label_conflict", () => {
  const alias_delivery = new Map<string, AliasDeliverySetting>([
    ["shop@aster.cx", delivery({ delivery_label_token: "tag_a" })],
  ]);

  it("flags a rule that applies different labels", () => {
    const actions: Action[] = [
      { type: "apply_labels", label_tokens: ["tag_b"] },
    ];

    expect(
      rule_alias_label_conflict(
        [to_is("shop@aster.cx")],
        actions,
        alias_delivery,
      ),
    ).toEqual({
      alias_address: "shop@aster.cx",
      alias_label_token: "tag_a",
      rule_label_tokens: ["tag_b"],
    });
  });

  it("stays quiet when the rule already includes the alias label", () => {
    const actions: Action[] = [
      { type: "apply_labels", label_tokens: ["tag_a", "tag_b"] },
    ];

    expect(
      rule_alias_label_conflict(
        [to_is("shop@aster.cx")],
        actions,
        alias_delivery,
      ),
    ).toBeNull();
  });

  it("stays quiet when the alias has no delivery label", () => {
    const actions: Action[] = [
      { type: "apply_labels", label_tokens: ["tag_b"] },
    ];

    expect(
      rule_alias_label_conflict(
        [to_is("news@aster.cx")],
        actions,
        new Map([["news@aster.cx", delivery()]]),
      ),
    ).toBeNull();
  });
});
