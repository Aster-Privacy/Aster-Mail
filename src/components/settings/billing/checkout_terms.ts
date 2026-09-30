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
import type { PlanTier } from "@/components/settings/billing/billing_constants";

export type checkout_term = 1 | 3 | 6 | 12 | 24;

export type checkout_interval = "month" | "year" | "biennial";

export const CARD_TERMS: checkout_term[] = [12, 1];

export const CRYPTO_TERMS: checkout_term[] = [24, 12, 6, 3, 1];

export function interval_for_term(term: checkout_term): checkout_interval {
  if (term === 24) return "biennial";
  if (term === 12) return "year";

  return "month";
}

export function term_for_interval(interval: string): checkout_term {
  if (interval === "biennial") return 24;
  if (interval === "year") return 12;

  return 1;
}

export function term_price_cents(tier: PlanTier, term: checkout_term): number {
  if (term === 24) return tier.biennial_cents;
  if (term === 12) return tier.yearly_cents;

  return tier.monthly_cents * term;
}

export function term_monthly_cents(
  tier: PlanTier,
  term: checkout_term,
): number {
  return Math.round(term_price_cents(tier, term) / term);
}

export function term_savings_cents(
  tier: PlanTier,
  term: checkout_term,
): number {
  return Math.max(0, tier.monthly_cents * term - term_price_cents(tier, term));
}

export function term_savings_percent(
  tier: PlanTier,
  term: checkout_term,
): number {
  const full = tier.monthly_cents * term;

  if (full <= 0) return 0;

  return Math.round((term_savings_cents(tier, term) / full) * 100);
}

export function nearest_card_term(term: checkout_term): checkout_term {
  if (term === 1) return 1;

  return 12;
}
