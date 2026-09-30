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
  BillingHistoryItem,
  CreditBalanceResponse,
  PlanLimitsResponse,
  StorageAddonItem,
  SubscriptionResponse,
  UserActiveAddon,
  AvailablePlan,
} from "@/services/api/billing";

import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

export const BILLING_CACHE_PREFIX = "aster:billing_cache:";

const BILLING_CACHE_VERSION = 1;

export interface BillingAddonPromo {
  eligible: boolean;
  percent_off: number;
  duration_months: number;
}

export interface BillingSnapshot {
  version: number;
  saved_at: number;
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  history: BillingHistoryItem[];
  plan_limits: PlanLimitsResponse | null;
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  addon_promo: BillingAddonPromo;
  credit_balance: CreditBalanceResponse | null;
}

function cache_key(user_id: string): string {
  return `${BILLING_CACHE_PREFIX}${user_id}`;
}

export function read_billing_cache(
  user_id: string | null | undefined,
): BillingSnapshot | null {
  if (!user_id) return null;
  const raw = safe_local_get(cache_key(user_id));

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BillingSnapshot>;

    if (parsed.version !== BILLING_CACHE_VERSION || !parsed.subscription) {
      return null;
    }

    return {
      version: BILLING_CACHE_VERSION,
      saved_at: parsed.saved_at ?? 0,
      subscription: parsed.subscription,
      plans: parsed.plans ?? [],
      history: parsed.history ?? [],
      plan_limits: parsed.plan_limits ?? null,
      available_addons: parsed.available_addons ?? [],
      active_addons: parsed.active_addons ?? [],
      addon_promo: parsed.addon_promo ?? {
        eligible: false,
        percent_off: 0,
        duration_months: 0,
      },
      credit_balance: parsed.credit_balance ?? null,
    };
  } catch {
    return null;
  }
}

export function write_billing_cache(
  user_id: string | null | undefined,
  snapshot: Omit<BillingSnapshot, "version" | "saved_at">,
): void {
  if (!user_id || !snapshot.subscription) return;
  const payload: BillingSnapshot = {
    ...snapshot,
    version: BILLING_CACHE_VERSION,
    saved_at: Date.now(),
  };

  safe_local_set(cache_key(user_id), JSON.stringify(payload));
}

export function clear_billing_cache(): void {
  for (const key of safe_local_keys()) {
    if (key.startsWith(BILLING_CACHE_PREFIX)) safe_local_remove(key);
  }
}
