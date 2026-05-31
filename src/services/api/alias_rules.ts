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

export type AliasRuleField = "all" | "from" | "to" | "subject";

export type AliasRuleOperator =
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "matches_regex";

export interface AliasRuleCondition {
  field: AliasRuleField;
  operator: AliasRuleOperator;
  value: string;
}

export interface AliasRuleActions {
  block?: boolean;
  to_trash?: boolean;
  label?: string;
  banner?: string;
  subject_mask?: string;
  auto_reply?: string;
}

export interface AliasRule {
  id: string;
  alias_id: string;
  priority: number;
  conditions: AliasRuleCondition[];
  actions: AliasRuleActions;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListAliasRulesResponse {
  rules: AliasRule[];
}

export interface CreateAliasRuleRequest {
  priority: number;
  conditions: AliasRuleCondition[];
  actions: AliasRuleActions;
  is_enabled: boolean;
}

export interface UpdateAliasRuleRequest {
  priority?: number;
  conditions?: AliasRuleCondition[];
  actions?: AliasRuleActions;
  is_enabled?: boolean;
}

export async function list_alias_rules(
  alias_id: string,
): Promise<ApiResponse<ListAliasRulesResponse>> {
  return api_client.get<ListAliasRulesResponse>(
    `/addresses/v1/aliases/${alias_id}/rules`,
  );
}

export async function create_alias_rule(
  alias_id: string,
  rule: CreateAliasRuleRequest,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  return api_client.post<{ id: string; success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/rules`,
    rule,
  );
}

export async function update_alias_rule(
  alias_id: string,
  rule_id: string,
  updates: UpdateAliasRuleRequest,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/rules/${rule_id}`,
    updates,
  );
}

export async function delete_alias_rule(
  alias_id: string,
  rule_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/rules/${rule_id}`,
  );
}
