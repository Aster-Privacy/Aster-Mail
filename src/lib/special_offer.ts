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
import { is_onion_host } from "@/lib/onion_host";
import { PLAN_TIERS } from "@/components/settings/billing/billing_constants";

export const SPECIAL_OFFER_PLAN_CODE = "nova";
export const SPECIAL_OFFER_INTERVAL = "month";
export const SPECIAL_OFFER_PERCENT_OFF = 50;
export const SPECIAL_OFFER_DURATION_MONTHS = 12;

const SPECIAL_OFFER_PROMO_CODE = "";
const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function special_offer_promo_code(): string | null {
  const code = SPECIAL_OFFER_PROMO_CODE.trim().toUpperCase();

  return PROMO_CODE_PATTERN.test(code) ? code : null;
}

export interface SpecialOfferPricing {
  list_cents: number;
  offer_cents: number;
}

export function special_offer_pricing(): SpecialOfferPricing | null {
  const tier = PLAN_TIERS.find((entry) => entry.id === SPECIAL_OFFER_PLAN_CODE);

  if (!tier || !Number.isFinite(tier.monthly_cents)) return null;

  const list_cents = tier.monthly_cents;

  if (list_cents <= 0) return null;

  return {
    list_cents,
    offer_cents: Math.round(
      (list_cents * (100 - SPECIAL_OFFER_PERCENT_OFF)) / 100,
    ),
  };
}

export interface SpecialOfferEligibility {
  plan_code: string | null;
  is_dismissed: boolean;
  is_onion?: boolean;
}

export function is_special_offer_available({
  plan_code,
  is_dismissed,
  is_onion,
}: SpecialOfferEligibility): boolean {
  if (plan_code !== "free") return false;
  if (is_dismissed) return false;
  if (is_onion ?? is_onion_host()) return false;

  return special_offer_pricing() !== null;
}
