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
import { api_client, type ApiResponse } from "./client";

export type ConditionField =
  | "from"
  | "reply_to"
  | "to"
  | "cc"
  | "bcc"
  | "any_recipient"
  | "subject"
  | "body"
  | "header"
  | "list_id"
  | "attachment_name"
  | "has_attachment"
  | "is_reply"
  | "is_forward"
  | "is_auto_submitted"
  | "has_calendar_invite"
  | "has_list_id"
  | "attachment_size"
  | "total_size"
  | "recipient_count"
  | "spam_score"
  | "date_received"
  | "dkim_result"
  | "spf_result"
  | "dmarc_result";

export type AddressOperator =
  | "is"
  | "contains"
  | "is_not"
  | "matches_domain"
  | "matches_regex";

export type TextOperator =
  | "is"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "matches_regex";

export type NumericOperator = "greater_than" | "less_than" | "equals";
export type DateOperator = "older_than_days" | "newer_than_days";
export type AttachmentNameOperator = "contains" | "ends_with" | "matches_regex";
export type AuthResultValue = "pass" | "fail" | "none" | "missing";

export type CategoryValue =
  | "primary"
  | "important"
  | "promotions"
  | "social"
  | "updates"
  | "forums";

export type LeafCondition =
  | {
      type: "from" | "reply_to" | "to" | "cc" | "bcc" | "any_recipient";
      operator: AddressOperator;
      value: string;
      case_sensitive?: boolean;
    }
  | {
      type: "subject" | "body" | "list_id";
      operator: TextOperator;
      value: string;
      case_sensitive?: boolean;
    }
  | {
      type: "header";
      name: string;
      operator: TextOperator;
      value: string;
      case_sensitive?: boolean;
    }
  | {
      type: "attachment_name";
      operator: AttachmentNameOperator;
      value: string;
      case_sensitive?: boolean;
    }
  | {
      type:
        | "has_attachment"
        | "is_reply"
        | "is_forward"
        | "is_auto_submitted"
        | "has_calendar_invite"
        | "has_list_id";
      value: boolean;
    }
  | {
      type: "attachment_size" | "total_size" | "recipient_count";
      operator: NumericOperator;
      value: number;
    }
  | {
      type: "spam_score";
      operator: NumericOperator;
      value: number;
    }
  | {
      type: "date_received";
      operator: DateOperator;
      value: number;
    }
  | {
      type: "dkim_result" | "spf_result" | "dmarc_result";
      value: AuthResultValue;
    };

export type Condition =
  | LeafCondition
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition };

export type Action =
  | { type: "move_to"; folder_token: string | null }
  | { type: "apply_labels"; label_tokens: string[] }
  | { type: "mark_as"; state: "read" | "unread" }
  | { type: "star"; value: boolean }
  | { type: "skip_inbox"; value: boolean }
  | { type: "delete"; value: boolean }
  | { type: "forward"; to: string }
  | { type: "auto_reply"; template_id: string }
  | { type: "pin" }
  | { type: "snooze"; until_iso8601: string }
  | { type: "categorize"; category: CategoryValue }
  | { type: "notify"; enabled: boolean };

export type MatchMode = "all" | "any";

export interface Rule {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  match_mode: MatchMode;
  conditions: Condition[];
  actions: Action[];
  sort_order: number;
  applied_count: number;
  expression?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRuleRequest {
  name: string;
  color: string;
  enabled: boolean;
  match_mode: MatchMode;
  conditions: Condition[];
  actions: Action[];
  expression?: string | null;
}

export type UpdateRuleRequest = Partial<CreateRuleRequest> & {
  sort_order?: number;
};

export interface RulesListResponse {
  rules: Rule[];
}

export interface RunRuleResponse {
  matched: number;
  applied: number;
}

export const REGEX_MAX_LENGTH = 512;

export function validate_regex_pattern(pattern: string): string | null {
  if (!pattern) return "regex_empty";
  if (pattern.length > REGEX_MAX_LENGTH) return "regex_too_long";
  try {
    new RegExp(pattern);
    return null;
  } catch {
    return "regex_invalid";
  }
}

interface WireRule {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  priority: number;
  match_mode: MatchMode;
  conditions: unknown[];
  actions: unknown[];
  applied_count: number;
  expression?: string | null;
  created_at: string;
  updated_at: string;
}

interface WireRulesListResponse {
  rules: WireRule[];
}

interface WireCreateRuleResponse {
  id: string;
  success: boolean;
}

interface WireStatusResponse {
  status: string;
}

function condition_to_wire(c: Condition): Record<string, unknown> {
  switch (c.type) {
    case "from":
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient":
      return {
        field: c.type,
        op: c.operator,
        value: c.value,
        ...(c.case_sensitive !== undefined && { case_sensitive: c.case_sensitive }),
      };
    case "subject":
    case "body":
    case "list_id":
      return {
        field: c.type,
        op: c.operator,
        value: c.value,
        ...(c.case_sensitive !== undefined && { case_sensitive: c.case_sensitive }),
      };
    case "header":
      return {
        field: "header",
        name: c.name,
        op: c.operator,
        value: c.value,
        ...(c.case_sensitive !== undefined && { case_sensitive: c.case_sensitive }),
      };
    case "attachment_name":
      return {
        field: "attachment_name",
        op: c.operator,
        value: c.value,
        ...(c.case_sensitive !== undefined && { case_sensitive: c.case_sensitive }),
      };
    case "has_attachment":
    case "is_reply":
    case "is_forward":
    case "is_auto_submitted":
    case "has_calendar_invite":
    case "has_list_id":
      return { field: c.type, is: c.value };
    case "attachment_size":
    case "total_size":
    case "recipient_count":
      return { field: c.type, op: c.operator, value: c.value };
    case "spam_score":
      return { field: "spam_score", op: c.operator, value: c.value };
    case "date_received":
      return { field: "date_received", op: c.operator, value: c.value };
    case "dkim_result":
    case "spf_result":
    case "dmarc_result":
      return { field: c.type, value: c.value };
    case "and":
      return { field: "and", conditions: c.conditions.map(condition_to_wire) };
    case "or":
      return { field: "or", conditions: c.conditions.map(condition_to_wire) };
    case "not":
      return { field: "not", condition: condition_to_wire(c.condition) };
  }
}

function condition_from_wire(w: unknown): Condition | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const field = (o.field ?? o.type) as string;
  if (field === "and" || field === "or") {
    const list = Array.isArray(o.conditions) ? o.conditions : [];
    const parsed: Condition[] = [];
    for (const item of list) {
      const c = condition_from_wire(item);
      if (c) parsed.push(c);
    }
    return { type: field, conditions: parsed };
  }
  if (field === "not") {
    const inner = condition_from_wire(o.condition);
    if (!inner) return null;
    return { type: "not", condition: inner };
  }
  switch (field) {
    case "from":
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient":
      return {
        type: field,
        operator: o.op as AddressOperator,
        value: String(o.value ?? ""),
        ...(typeof o.case_sensitive === "boolean" && { case_sensitive: o.case_sensitive }),
      };
    case "subject":
    case "body":
    case "list_id":
      return {
        type: field,
        operator: o.op as TextOperator,
        value: String(o.value ?? ""),
        ...(typeof o.case_sensitive === "boolean" && { case_sensitive: o.case_sensitive }),
      };
    case "header":
      return {
        type: "header",
        name: String(o.name ?? ""),
        operator: o.op as TextOperator,
        value: String(o.value ?? ""),
        ...(typeof o.case_sensitive === "boolean" && { case_sensitive: o.case_sensitive }),
      };
    case "attachment_name":
      return {
        type: "attachment_name",
        operator: o.op as AttachmentNameOperator,
        value: String(o.value ?? ""),
        ...(typeof o.case_sensitive === "boolean" && { case_sensitive: o.case_sensitive }),
      };
    case "has_attachment":
    case "is_reply":
    case "is_forward":
    case "is_auto_submitted":
    case "has_calendar_invite":
    case "has_list_id":
      return { type: field, value: Boolean(o.is) };
    case "attachment_size":
    case "total_size":
    case "recipient_count":
      return {
        type: field,
        operator: o.op as NumericOperator,
        value: Number(o.value ?? 0),
      };
    case "spam_score":
      return {
        type: "spam_score",
        operator: o.op as NumericOperator,
        value: Number(o.value ?? 0),
      };
    case "date_received":
      return {
        type: "date_received",
        operator: o.op as DateOperator,
        value: Number(o.value ?? 0),
      };
    case "dkim_result":
    case "spf_result":
    case "dmarc_result":
      return { type: field, value: o.value as AuthResultValue };
    default:
      return null;
  }
}

function action_to_wire(a: Action): Record<string, unknown> | null {
  switch (a.type) {
    case "move_to":
      if (a.folder_token === null) return null;
      return { type: "move_to", folder_token: a.folder_token };
    case "apply_labels":
      return { type: "apply_labels", label_tokens: a.label_tokens };
    case "mark_as":
      return { type: "mark_as", value: a.state };
    case "star":
      return a.value ? { type: "star" } : null;
    case "skip_inbox":
      return a.value ? { type: "skip_inbox" } : null;
    case "delete":
      return a.value ? { type: "delete" } : null;
    case "forward":
      return { type: "forward", to: a.to };
    case "auto_reply":
      return { type: "auto_reply", template_id: a.template_id };
    case "pin":
      return { type: "pin" };
    case "snooze":
      return { type: "snooze", until_iso8601: a.until_iso8601 };
    case "categorize":
      return { type: "categorize", category: a.category };
    case "notify":
      return { type: "notify", enabled: a.enabled };
  }
}

function action_from_wire(w: unknown): Action | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const t = o.type as string;
  switch (t) {
    case "move_to":
      return { type: "move_to", folder_token: String(o.folder_token ?? "") };
    case "apply_labels":
      return {
        type: "apply_labels",
        label_tokens: Array.isArray(o.label_tokens)
          ? (o.label_tokens as string[])
          : [],
      };
    case "mark_as":
      return { type: "mark_as", state: o.value as "read" | "unread" };
    case "star":
      return { type: "star", value: true };
    case "skip_inbox":
      return { type: "skip_inbox", value: true };
    case "delete":
      return { type: "delete", value: true };
    case "forward":
      return { type: "forward", to: String(o.to ?? "") };
    case "auto_reply":
      return { type: "auto_reply", template_id: String(o.template_id ?? "") };
    case "pin":
      return { type: "pin" };
    case "snooze":
      return { type: "snooze", until_iso8601: String(o.until_iso8601 ?? "") };
    case "categorize":
      return { type: "categorize", category: o.category as CategoryValue };
    case "notify":
      return { type: "notify", enabled: Boolean(o.enabled) };
    default:
      return null;
  }
}

function rule_from_wire(w: WireRule): Rule {
  const conditions: Condition[] = [];
  for (const wc of w.conditions ?? []) {
    const c = condition_from_wire(wc);
    if (c) conditions.push(c);
  }
  const actions: Action[] = [];
  for (const wa of w.actions ?? []) {
    const a = action_from_wire(wa);
    if (a) actions.push(a);
  }
  return {
    id: w.id,
    name: w.name,
    color: w.color,
    enabled: w.enabled,
    match_mode: w.match_mode,
    conditions,
    actions,
    sort_order: w.priority ?? 0,
    applied_count: w.applied_count ?? 0,
    expression: w.expression ?? null,
    created_at: w.created_at,
    updated_at: w.updated_at,
  };
}

function create_request_to_wire(req: CreateRuleRequest): Record<string, unknown> {
  return {
    name: req.name,
    color: req.color,
    enabled: req.enabled,
    match_mode: req.match_mode,
    conditions: req.conditions.map(condition_to_wire),
    actions: req.actions.map(action_to_wire).filter((a) => a !== null),
    ...(req.expression !== undefined && { expression: req.expression }),
  };
}

function update_request_to_wire(patch: UpdateRuleRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.color !== undefined) out.color = patch.color;
  if (patch.enabled !== undefined) out.enabled = patch.enabled;
  if (patch.match_mode !== undefined) out.match_mode = patch.match_mode;
  if (patch.conditions !== undefined) {
    out.conditions = patch.conditions.map(condition_to_wire);
  }
  if (patch.actions !== undefined) {
    out.actions = patch.actions.map(action_to_wire).filter((a) => a !== null);
  }
  if (patch.expression !== undefined) out.expression = patch.expression;
  return out;
}

const BASE = "/mail/v1/mail-rules";

export async function list_rules(): Promise<ApiResponse<RulesListResponse>> {
  const response = await api_client.get<WireRulesListResponse>(BASE, {
    cache_ttl: 30_000,
  });
  if (response.data) {
    return {
      data: { rules: response.data.rules.map(rule_from_wire) },
    };
  }
  return { error: response.error, code: response.code };
}

export async function create_rule(
  req: CreateRuleRequest,
): Promise<ApiResponse<Rule>> {
  const wire = create_request_to_wire(req);
  const response = await api_client.post<WireCreateRuleResponse>(BASE, wire);
  if (response.data) {
    const synthesized: Rule = {
      id: response.data.id,
      name: req.name,
      color: req.color,
      enabled: req.enabled,
      match_mode: req.match_mode,
      conditions: req.conditions,
      actions: req.actions,
      sort_order: 0,
      applied_count: 0,
      expression: req.expression ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { data: synthesized };
  }
  return { error: response.error, code: response.code };
}

export async function update_rule(
  id: string,
  patch: UpdateRuleRequest,
): Promise<ApiResponse<Rule>> {
  const wire = update_request_to_wire(patch);
  const response = await api_client.patch<WireRule>(`${BASE}/${id}`, wire);
  if (response.data) {
    return { data: rule_from_wire(response.data) };
  }
  return { error: response.error, code: response.code };
}

export async function delete_rule(
  id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(`${BASE}/${id}`);
}

export async function reorder_rules(
  ordered_ids: string[],
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(`${BASE}/reorder`, {
    order: ordered_ids,
  });
}

export async function run_on_existing(
  id: string,
): Promise<ApiResponse<RunRuleResponse>> {
  const response = await api_client.post<WireStatusResponse>(
    `${BASE}/${id}/run-on-existing`,
    {},
  );
  if (response.data) {
    return { data: { matched: 0, applied: 0 } };
  }
  return { error: response.error, code: response.code };
}
