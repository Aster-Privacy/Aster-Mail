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
export const ALIAS_LIMIT_UNLIMITED = -1;

export const ALIAS_USAGE_WARNING_RATIO = 0.8;

export type AliasUsageLevel = "normal" | "approaching" | "at_limit";

export interface AliasUsage {
  used: number;
  limit: number;
  is_unlimited: boolean;
  remaining: number;
  percent: number;
  level: AliasUsageLevel;
}

export interface AliasCapOffer {
  plan_code: string;
  alias_allowance: number;
  is_unlimited: boolean;
}

const ALIAS_CAP_OFFERS: Record<string, AliasCapOffer> = {
  free: { plan_code: "star", alias_allowance: 15, is_unlimited: false },
  star: {
    plan_code: "nova",
    alias_allowance: ALIAS_LIMIT_UNLIMITED,
    is_unlimited: true,
  },
};

export function compute_alias_usage(used: number, limit: number): AliasUsage {
  const safe_used = Number.isFinite(used) ? Math.max(0, Math.trunc(used)) : 0;
  const safe_limit = Number.isFinite(limit) ? Math.trunc(limit) : 0;
  const is_unlimited = safe_limit < 0;

  if (is_unlimited) {
    return {
      used: safe_used,
      limit: ALIAS_LIMIT_UNLIMITED,
      is_unlimited: true,
      remaining: Number.POSITIVE_INFINITY,
      percent: 0,
      level: "normal",
    };
  }

  const remaining = Math.max(0, safe_limit - safe_used);
  const percent =
    safe_limit === 0 ? 100 : Math.min(100, (safe_used / safe_limit) * 100);
  const level: AliasUsageLevel =
    remaining === 0
      ? "at_limit"
      : percent >= ALIAS_USAGE_WARNING_RATIO * 100
        ? "approaching"
        : "normal";

  return {
    used: safe_used,
    limit: safe_limit,
    is_unlimited: false,
    remaining,
    percent,
    level,
  };
}

export function alias_cap_offer_for_plan(
  plan_code: string | null,
): AliasCapOffer | null {
  const key = (plan_code ?? "free").toLowerCase();

  return ALIAS_CAP_OFFERS[key] ?? null;
}
