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
export const INDIVIDUAL_PLAN_ORDER = ["free", "star", "nova", "supernova"];

export const FAMILY_PLAN_ORDER = ["duo", "family"];

export const STORAGE_TIGHT_PERCENT = 80;

export const DEFAULT_RECOMMENDED_PLAN = "nova";

export const DEFAULT_RECOMMENDED_FAMILY_PLAN = "family";

export type PlanLadder = "individual" | "family";

export interface PlanRecommendationInput {
  current_plan_code?: string | null;
  storage_used_bytes?: number | null;
  storage_limit_bytes?: number | null;
}

export interface PlanRecommendation {
  ladder: PlanLadder;
  current_plan_code: string | null;
  is_paid: boolean;
  is_top_tier: boolean;
  storage_is_tight: boolean;
  storage_percent: number;
  recommended_plan_code: string | null;
  recommended_family_plan_code: string | null;
  suggest_storage_addon: boolean;
}

export function plan_ladder(plan_code?: string | null): PlanLadder {
  return plan_code && FAMILY_PLAN_ORDER.includes(plan_code)
    ? "family"
    : "individual";
}

export function plan_rank(plan_code?: string | null): number {
  if (!plan_code) return -1;
  const family_index = FAMILY_PLAN_ORDER.indexOf(plan_code);

  if (family_index > -1) return family_index;

  return INDIVIDUAL_PLAN_ORDER.indexOf(plan_code);
}

export function storage_percent(
  used_bytes?: number | null,
  limit_bytes?: number | null,
): number {
  if (!limit_bytes || limit_bytes <= 0) return 0;

  return Math.min(100, ((used_bytes ?? 0) / limit_bytes) * 100);
}

export function compute_plan_recommendation({
  current_plan_code,
  storage_used_bytes,
  storage_limit_bytes,
}: PlanRecommendationInput): PlanRecommendation {
  const code = current_plan_code ?? null;
  const ladder = plan_ladder(code);
  const order = ladder === "family" ? FAMILY_PLAN_ORDER : INDIVIDUAL_PLAN_ORDER;
  const rank = plan_rank(code);
  const is_paid = !!code && code !== "free" && rank > -1;
  const percent = storage_percent(storage_used_bytes, storage_limit_bytes);
  const storage_is_tight = percent >= STORAGE_TIGHT_PERCENT;
  const is_top_tier = is_paid && rank === order.length - 1;

  if (!is_paid) {
    return {
      ladder,
      current_plan_code: code,
      is_paid,
      is_top_tier: false,
      storage_is_tight,
      storage_percent: percent,
      recommended_plan_code: DEFAULT_RECOMMENDED_PLAN,
      recommended_family_plan_code: DEFAULT_RECOMMENDED_FAMILY_PLAN,
      suggest_storage_addon: false,
    };
  }

  const next_plan_code =
    !is_top_tier && storage_is_tight ? (order[rank + 1] ?? null) : null;

  return {
    ladder,
    current_plan_code: code,
    is_paid,
    is_top_tier,
    storage_is_tight,
    storage_percent: percent,
    recommended_plan_code: ladder === "individual" ? next_plan_code : null,
    recommended_family_plan_code: ladder === "family" ? next_plan_code : null,
    suggest_storage_addon: is_top_tier,
  };
}
