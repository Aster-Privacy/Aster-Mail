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

export interface AliasRuleDelivery {
  rule_id: string;
  rule_name: string;
  folder_token: string;
}

export interface AliasRuleLabel {
  rule_id: string;
  rule_name: string;
  label_tokens: string[];
}

export interface AliasDeliverySetting {
  delivery_folder_token: string | null;
  delivery_label_token: string | null;
  never_inbox: boolean;
}

export interface AliasDeliveryConflict {
  alias_address: string;
  alias_delivery: AliasDeliverySetting;
  rule_folder_token: string;
}

export interface AliasLabelConflict {
  alias_address: string;
  alias_label_token: string;
  rule_label_tokens: string[];
}

const ADDRESS_CONDITION_TYPES = new Set(["to", "cc", "bcc", "any_recipient"]);

function address_condition_matches(
  operator: string,
  value: string,
  address: string,
): boolean {
  const needle = value.trim();

  if (!needle) {
    return false;
  }
  const lower_needle = needle.toLowerCase();
  const lower_address = address.toLowerCase();

  if (operator === "is") {
    return lower_needle === lower_address;
  }
  if (operator === "contains") {
    return lower_address.includes(lower_needle);
  }
  if (operator === "matches_domain") {
    const domain = lower_address.slice(lower_address.lastIndexOf("@") + 1);

    return domain === lower_needle.replace(/^@/, "");
  }

  return false;
}

export function condition_targets_address(
  condition: Condition,
  address: string,
): boolean {
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.some((child) =>
      condition_targets_address(child, address),
    );
  }
  if (condition.type === "not") {
    return false;
  }
  if (!ADDRESS_CONDITION_TYPES.has(condition.type)) {
    return false;
  }
  const leaf = condition as { operator: string; value: string };

  return address_condition_matches(leaf.operator, leaf.value, address);
}

export function condition_exact_addresses(condition: Condition): string[] {
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap(condition_exact_addresses);
  }
  if (condition.type === "not") {
    return [];
  }
  if (!ADDRESS_CONDITION_TYPES.has(condition.type)) {
    return [];
  }
  const leaf = condition as { operator: string; value: string };

  if (leaf.operator !== "is") {
    return [];
  }
  const address = leaf.value.trim();

  return address.includes("@") ? [address] : [];
}

export function rule_targets_address(rule: Rule, address: string): boolean {
  return rule.conditions.some((condition) =>
    condition_targets_address(condition, address),
  );
}

export function rule_move_to_folder(actions: Action[]): string | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (action.type === "move_to") {
      return action.folder_token;
    }
  }

  return null;
}

export function rule_apply_labels(actions: Action[]): string[] {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (action.type === "apply_labels") {
      return action.label_tokens.filter(Boolean);
    }
  }

  return [];
}

function sorted_active_rules(rules: Rule[]): Rule[] {
  return rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        (a.created_at || "").localeCompare(b.created_at || ""),
    );
}

function normalized_address(alias_address: string): string | null {
  const address = alias_address.trim();

  if (!address || !address.includes("@")) {
    return null;
  }

  return address;
}

export function alias_rule_delivery(
  rules: Rule[],
  alias_address: string,
): AliasRuleDelivery | null {
  const address = normalized_address(alias_address);

  if (!address) {
    return null;
  }
  let match: AliasRuleDelivery | null = null;

  for (const rule of sorted_active_rules(rules)) {
    const folder_token = rule_move_to_folder(rule.actions);

    if (!folder_token) {
      continue;
    }
    if (!rule_targets_address(rule, address)) {
      continue;
    }
    match = { rule_id: rule.id, rule_name: rule.name, folder_token };
  }

  return match;
}

export function alias_rule_label(
  rules: Rule[],
  alias_address: string,
): AliasRuleLabel | null {
  const address = normalized_address(alias_address);

  if (!address) {
    return null;
  }
  let match: AliasRuleLabel | null = null;

  for (const rule of sorted_active_rules(rules)) {
    const label_tokens = rule_apply_labels(rule.actions);

    if (label_tokens.length === 0) {
      continue;
    }
    if (!rule_targets_address(rule, address)) {
      continue;
    }
    match = { rule_id: rule.id, rule_name: rule.name, label_tokens };
  }

  return match;
}

export function rule_alias_delivery_conflict(
  conditions: Condition[],
  actions: Action[],
  alias_delivery: Map<string, AliasDeliverySetting>,
): AliasDeliveryConflict | null {
  const rule_folder_token = rule_move_to_folder(actions);

  if (!rule_folder_token) {
    return null;
  }
  for (const address of conditions.flatMap(condition_exact_addresses)) {
    const delivery = alias_delivery.get(address.toLowerCase());

    if (!delivery) {
      continue;
    }
    const has_explicit_target =
      delivery.delivery_folder_token !== null || delivery.never_inbox;

    if (!has_explicit_target) {
      continue;
    }
    if (delivery.delivery_folder_token === rule_folder_token) {
      continue;
    }

    return {
      alias_address: address,
      alias_delivery: delivery,
      rule_folder_token,
    };
  }

  return null;
}

export function rule_alias_label_conflict(
  conditions: Condition[],
  actions: Action[],
  alias_delivery: Map<string, AliasDeliverySetting>,
): AliasLabelConflict | null {
  const rule_label_tokens = rule_apply_labels(actions);

  if (rule_label_tokens.length === 0) {
    return null;
  }
  for (const address of conditions.flatMap(condition_exact_addresses)) {
    const delivery = alias_delivery.get(address.toLowerCase());
    const alias_label_token = delivery?.delivery_label_token;

    if (!alias_label_token) {
      continue;
    }
    if (rule_label_tokens.includes(alias_label_token)) {
      continue;
    }

    return {
      alias_address: address,
      alias_label_token,
      rule_label_tokens,
    };
  }

  return null;
}
