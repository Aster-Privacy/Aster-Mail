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

export type ForwardingField = "from" | "to" | "subject" | "all";
export type ForwardingOperator =
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "matches_regex";

export interface ForwardingCondition {
  field: ForwardingField;
  operator: ForwardingOperator;
  value: string;
}

export interface ForwardingRuleResponse {
  id: string;
  name: string;
  is_enabled: boolean;
  priority: number;
  forward_to: string[];
  keep_copy: boolean;
  conditions: ForwardingCondition[];
  forwarded_count: number;
  last_forwarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardingRulesListResponse {
  rules: ForwardingRuleResponse[];
  total: number;
}

export async function list_forwarding_rules(): Promise<
  ApiResponse<ForwardingRuleResponse[]>
> {
  try {
    const response = await api_client.get<ForwardingRulesListResponse>(
      "/mail/v1/auto_forward",
    );

    if (response.error) {
      return { error: response.error };
    }

    return { data: response.data?.rules ?? [] };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to list forwarding rules",
    };
  }
}

export async function create_forwarding_rule(
  name: string,
  forward_to: string[],
  conditions: ForwardingCondition[],
  keep_copy: boolean = true,
  priority: number = 0,
): Promise<ApiResponse<ForwardingRuleResponse>> {
  try {
    const response = await api_client.post<ForwardingRuleResponse>(
      "/mail/v1/auto_forward",
      {
        name,
        forward_to: forward_to.map((e) => e.toLowerCase().trim()),
        conditions,
        keep_copy,
        priority,
      },
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to create forwarding rule",
    };
  }
}

export async function update_forwarding_rule(
  id: string,
  name?: string,
  forward_to?: string[],
  conditions?: ForwardingCondition[],
  keep_copy?: boolean,
  priority?: number,
  is_enabled?: boolean,
): Promise<ApiResponse<ForwardingRuleResponse>> {
  try {
    const body: Record<string, unknown> = { id };

    if (name !== undefined) body.name = name;
    if (forward_to !== undefined)
      body.forward_to = forward_to.map((e) => e.toLowerCase().trim());
    if (conditions !== undefined) body.conditions = conditions;
    if (keep_copy !== undefined) body.keep_copy = keep_copy;
    if (priority !== undefined) body.priority = priority;
    if (is_enabled !== undefined) body.is_enabled = is_enabled;

    const response = await api_client.put<ForwardingRuleResponse>(
      "/mail/v1/auto_forward/update",
      body,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to update forwarding rule",
    };
  }
}

export async function toggle_forwarding_rule(
  id: string,
  is_enabled: boolean,
): Promise<ApiResponse<ForwardingRuleResponse>> {
  try {
    const response = await api_client.patch<ForwardingRuleResponse>(
      "/mail/v1/auto_forward/toggle",
      { id, is_enabled },
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to toggle forwarding rule",
    };
  }
}

export async function delete_forwarding_rule(
  id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      `/mail/v1/auto_forward?id=${encodeURIComponent(id)}`,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to delete forwarding rule",
    };
  }
}

export async function bulk_delete_forwarding_rules(
  ids: string[],
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  try {
    const response = await api_client.delete<{
      success: boolean;
      deleted_count: number;
    }>("/mail/v1/auto_forward/bulk", {
      body: JSON.stringify({ ids }),
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to bulk delete forwarding rules",
    };
  }
}
