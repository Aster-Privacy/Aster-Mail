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
import type {
  Action,
  Condition,
  ConditionField,
  LeafCondition,
} from "@/services/api/mail_rules";
import type { AddableActionType } from "@/components/mail_rules/add_action_chip";

import {
  default_condition_for_field,
  field_kind,
} from "@/components/mail_rules/field_kind";

export type EditorTab = "visual" | "expression";

export function has_nested_logic(conditions: Condition[]): boolean {
  return conditions.some(
    (c) => c.type === "and" || c.type === "or" || c.type === "not",
  );
}

export function flatten_leaves(conditions: Condition[]): LeafCondition[] {
  const out: LeafCondition[] = [];

  for (const c of conditions) {
    if (c.type === "and" || c.type === "or") {
      out.push(...flatten_leaves(c.conditions));
    } else if (c.type === "not") {
      out.push(...flatten_leaves([c.condition]));
    } else {
      out.push(c);
    }
  }

  return out;
}

export const RULE_COLORS = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#3b82f6",
];

export const ADDABLE_ACTION_TYPES: AddableActionType[] = [
  "move_to",
  "apply_labels",
  "mark_as",
  "star",
  "skip_inbox",
  "delete",
  "forward",
  "auto_reply",
  "pin",
  "snooze",
  "categorize",
  "notify",
];

export const UNAVAILABLE_ACTION_TYPES = new Set<AddableActionType>([
  "forward",
  "auto_reply",
]);

export const strip_unavailable_actions = (list: Action[]): Action[] =>
  list.filter(
    (a) => !UNAVAILABLE_ACTION_TYPES.has(a.type as AddableActionType),
  );

export const keep_unavailable_actions = (list: Action[]): Action[] =>
  list.filter((a) => UNAVAILABLE_ACTION_TYPES.has(a.type as AddableActionType));

export const ACTION_LABEL_KEYS: Record<
  AddableActionType,
  "mail_rules.action_move_to"
> = {
  move_to: "mail_rules.action_move_to",
  apply_labels: "mail_rules.action_apply_labels" as "mail_rules.action_move_to",
  mark_as: "mail_rules.action_mark_as" as "mail_rules.action_move_to",
  star: "mail_rules.action_star" as "mail_rules.action_move_to",
  skip_inbox: "mail_rules.action_skip_inbox" as "mail_rules.action_move_to",
  delete: "mail_rules.action_delete" as "mail_rules.action_move_to",
  forward: "mail_rules.action_forward" as "mail_rules.action_move_to",
  auto_reply: "mail_rules.action_auto_reply" as "mail_rules.action_move_to",
  pin: "mail_rules.action_pin" as "mail_rules.action_move_to",
  snooze: "mail_rules.action_snooze" as "mail_rules.action_move_to",
  categorize: "mail_rules.action_categorize" as "mail_rules.action_move_to",
  notify: "mail_rules.action_notify" as "mail_rules.action_move_to",
};

export function default_action_for_type(type: AddableActionType): Action {
  switch (type) {
    case "move_to":
      return { type: "move_to", folder_token: null };
    case "apply_labels":
      return { type: "apply_labels", label_tokens: [] };
    case "mark_as":
      return { type: "mark_as", state: "read" };
    case "star":
      return { type: "star", value: true };
    case "skip_inbox":
      return { type: "skip_inbox", value: true };
    case "delete":
      return { type: "delete", value: true };
    case "forward":
      return { type: "forward", to: "" };
    case "auto_reply":
      return { type: "auto_reply", template_id: "" };
    case "pin":
      return { type: "pin" };
    case "snooze":
      return { type: "snooze", until_iso8601: "" };
    case "categorize":
      return { type: "categorize", category: "primary" };
    case "notify":
      return { type: "notify", enabled: true };
  }
}

export function default_condition(field: ConditionField): Condition {
  return default_condition_for_field(field);
}

export function condition_has_value(c: Condition): boolean {
  if (c.type === "and" || c.type === "or") {
    return c.conditions.every(condition_has_value);
  }
  if (c.type === "not") {
    return condition_has_value(c.condition);
  }
  const k = field_kind(c.type);

  if (k === "boolean" || k === "auth") return true;
  if (c.type === "header") {
    if (!c.name) return false;
  }
  if ("operator" in c && c.operator === "is_empty") return true;
  const v = (c as { value?: unknown }).value;

  if (typeof v === "string") return v.length > 0;
  if (typeof v === "number") {
    if (Number.isNaN(v)) return false;
    if (k === "numeric_size" || k === "numeric_plain") return v !== 0;

    return true;
  }

  return v !== undefined && v !== null;
}

export function condition_ready_to_save(c: Condition): boolean {
  if (c.type === "and" || c.type === "or") {
    return c.conditions.every(condition_ready_to_save);
  }
  if (c.type === "not") {
    return condition_ready_to_save(c.condition);
  }
  const v = (c as { value?: unknown }).value;

  if (typeof v === "number") return !Number.isNaN(v);

  return condition_has_value(c);
}

export function has_any_action_value(actions: Action[]): boolean {
  return actions.some((a) => {
    switch (a.type) {
      case "move_to":
        return a.folder_token !== null;
      case "apply_labels":
        return a.label_tokens.length > 0;
      case "mark_as":
        return true;
      case "star":
      case "skip_inbox":
      case "delete":
        return a.value;
      case "forward":
        return !!a.to;
      case "auto_reply":
        return !!a.template_id;
      case "pin":
        return true;
      case "snooze":
        return !!a.until_iso8601;
      case "categorize":
        return true;
      case "notify":
        return true;
      default:
        return false;
    }
  });
}
