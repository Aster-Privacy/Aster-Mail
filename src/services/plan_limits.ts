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
import { get_subscription } from "@/services/api/billing";

const ACCOUNT_LIMITS: Record<string, number> = {
  free: 1,
  star: 2,
  nova: 4,
  supernova: 6,
};

const DEFAULT_LIMIT = 1;
const CACHE_TTL_MS = 60_000;

let cached_plan_code: string | null = null;
let cached_at = 0;
let in_flight: Promise<string | null> | null = null;

async function fetch_plan_code(): Promise<string | null> {
  const res = await get_subscription();

  if (res.error || !res.data) return null;

  return res.data.plan?.code?.toLowerCase() ?? null;
}

export async function get_current_plan_code(): Promise<string | null> {
  const now = Date.now();

  if (cached_plan_code && now - cached_at < CACHE_TTL_MS) {
    return cached_plan_code;
  }

  if (in_flight) return in_flight;

  in_flight = fetch_plan_code()
    .then((code) => {
      if (code) {
        cached_plan_code = code;
        cached_at = Date.now();
      }

      return code;
    })
    .finally(() => {
      in_flight = null;
    });

  return in_flight;
}

export function max_accounts_for_plan(plan_code: string | null): number {
  if (!plan_code) return DEFAULT_LIMIT;

  return ACCOUNT_LIMITS[plan_code.toLowerCase()] ?? DEFAULT_LIMIT;
}

export function clear_plan_cache(): void {
  cached_plan_code = null;
  cached_at = 0;
}
