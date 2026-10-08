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
import type { Condition, MatchMode } from "@/services/api/mail_rules";

import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import {
  address_matches,
  any_address_matches,
  text_matches,
} from "@/lib/mail_rules/address_match";

export interface LocalRuleInput {
  from: string;
  reply_to: string[];
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_text: string;
  headers: Map<string, string>;
  has_attachment: boolean;
  total_size: number;
}

export interface LocalRuleShape {
  match_mode: MatchMode;
  conditions: Condition[];
}

export function condition_supports_local_evaluation(
  condition: Condition,
): boolean {
  switch (condition.type) {
    case "and":
    case "or":
      return condition.conditions.every(condition_supports_local_evaluation);
    case "not":
      return condition_supports_local_evaluation(condition.condition);
    case "from":
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient":
    case "subject":
    case "body":
    case "header":
    case "list_id":
      return condition.operator !== "matches_regex";
    case "has_attachment":
    case "has_list_id":
    case "is_reply":
    case "is_auto_submitted":
    case "total_size":
      return true;
    default:
      return false;
  }
}

export function rule_supports_local_evaluation(rule: LocalRuleShape): boolean {
  return (
    rule.conditions.length > 0 &&
    rule.conditions.every(condition_supports_local_evaluation)
  );
}

function header_value(input: LocalRuleInput, name: string): string {
  return input.headers.get(name.toLowerCase()) ?? "";
}

function numeric_matches(
  actual: number,
  operator: "greater_than" | "less_than" | "equals",
  value: number,
): boolean {
  if (operator === "greater_than") return actual > value;
  if (operator === "less_than") return actual < value;

  return actual === value;
}

export function local_condition_matches(
  condition: Condition,
  input: LocalRuleInput,
): boolean {
  switch (condition.type) {
    case "and":
      return condition.conditions.every((c) =>
        local_condition_matches(c, input),
      );
    case "or":
      return condition.conditions.some((c) =>
        local_condition_matches(c, input),
      );
    case "not":
      return !local_condition_matches(condition.condition, input);
    case "from":
      if (condition.operator === "matches_regex") return false;

      return address_matches(
        input.from,
        condition.operator,
        condition.value,
        condition.case_sensitive ?? false,
      );
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient": {
      if (condition.operator === "matches_regex") return false;
      const addresses =
        condition.type === "any_recipient"
          ? [...input.to, ...input.cc, ...input.bcc]
          : input[condition.type];

      return any_address_matches(
        addresses,
        condition.operator,
        condition.value,
        condition.case_sensitive ?? false,
      );
    }
    case "subject":
    case "body":
    case "list_id": {
      if (condition.operator === "matches_regex") return false;
      const text =
        condition.type === "subject"
          ? input.subject
          : condition.type === "body"
            ? input.body_text
            : header_value(input, "list-id");

      return text_matches(
        text,
        condition.operator,
        condition.value,
        condition.case_sensitive ?? false,
      );
    }
    case "header":
      if (condition.operator === "matches_regex") return false;

      return text_matches(
        header_value(input, condition.name),
        condition.operator,
        condition.value,
        condition.case_sensitive ?? false,
      );
    case "has_attachment":
      return input.has_attachment === condition.value;
    case "has_list_id":
      return (
        header_value(input, "list-id").trim().length > 0 === condition.value
      );
    case "is_reply": {
      const present =
        header_value(input, "in-reply-to").trim().length > 0 ||
        header_value(input, "references").trim().length > 0;

      return present === condition.value;
    }
    case "is_auto_submitted": {
      const value = header_value(input, "auto-submitted").trim().toLowerCase();

      return (value.length > 0 && value !== "no") === condition.value;
    }
    case "total_size":
      return numeric_matches(
        input.total_size,
        condition.operator,
        condition.value,
      );
    default:
      return false;
  }
}

export function evaluate_rule_locally(
  rule: LocalRuleShape,
  input: LocalRuleInput,
): boolean {
  if (rule.conditions.length === 0) return false;
  if (rule.match_mode === "any") {
    return rule.conditions.some((c) => local_condition_matches(c, input));
  }

  return rule.conditions.every((c) => local_condition_matches(c, input));
}

function envelope_string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function recipient_addresses(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];

  return normalize_envelope_recipients(list).map((r) => r.email.trim());
}

export function local_input_from_envelope(
  envelope: Record<string, unknown>,
  item: { has_attachments?: boolean; size_bytes?: number | null },
): LocalRuleInput {
  const from_entry =
    normalize_envelope_from(envelope.from) ??
    normalize_envelope_from(envelope.from_email);
  const from = from_entry?.email?.trim() ?? "";

  const headers = new Map<string, string>();

  if (Array.isArray(envelope.raw_headers)) {
    for (const header of envelope.raw_headers as Array<{
      name?: unknown;
      value?: unknown;
    }>) {
      const name = envelope_string(header?.name).toLowerCase();

      if (name && !headers.has(name)) {
        headers.set(name, envelope_string(header?.value));
      }
    }
  }

  const reply_to_raw = headers.get("reply-to") ?? "";
  const reply_to = reply_to_raw.trim()
    ? reply_to_raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : from
      ? [from]
      : [];

  return {
    from,
    reply_to,
    to: recipient_addresses(envelope.to),
    cc: recipient_addresses(envelope.cc),
    bcc: recipient_addresses(envelope.bcc),
    subject: envelope_string(envelope.subject),
    body_text:
      envelope_string(envelope.body_text) ||
      envelope_string(envelope.text_body),
    headers,
    has_attachment: item.has_attachments ?? false,
    total_size: item.size_bytes ?? 0,
  };
}
