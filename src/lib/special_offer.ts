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

const SPECIAL_OFFER_MIN_CHARGE_CENTS = 50;

export function special_offer_discounted_cents(total_cents: number): number {
  const total = Math.round(total_cents);
  const discount_cents = Math.floor(
    (total * SPECIAL_OFFER_PERCENT_OFF + 50) / 100,
  );

  return Math.max(total - discount_cents, SPECIAL_OFFER_MIN_CHARGE_CENTS);
}

export function special_offer_pricing(): SpecialOfferPricing | null {
  const tier = PLAN_TIERS.find((entry) => entry.id === SPECIAL_OFFER_PLAN_CODE);

  if (!tier || !Number.isFinite(tier.monthly_cents)) return null;

  const list_cents = tier.monthly_cents;

  if (list_cents <= 0) return null;

  return {
    list_cents,
    offer_cents: special_offer_discounted_cents(list_cents),
  };
}

export function special_offer_crypto_total_cents(
  plan_code: string,
  term_months: number,
  list_total_cents: number,
): number | null {
  if (plan_code !== SPECIAL_OFFER_PLAN_CODE) return null;
  if (term_months < 1 || term_months > SPECIAL_OFFER_DURATION_MONTHS) {
    return null;
  }

  return special_offer_discounted_cents(list_total_cents);
}

export type SpecialOfferPayMethod = "card" | "crypto";

export type SpecialOfferTermPrice = (
  term_months: number,
  list_total_cents: number,
) => number | null;

export interface SpecialOfferPlanPricing {
  percent_off: number;
  discounted_total_cents: (
    method: SpecialOfferPayMethod,
    term_id: string,
    list_total_cents: number,
  ) => number | null;
}

export interface SpecialOfferCheckout {
  percent_off: number | undefined;
  plan_pricing: (
    plan_code: string | null | undefined,
  ) => SpecialOfferPlanPricing | undefined;
  crypto_price: (
    plan_code: string | null | undefined,
  ) => SpecialOfferTermPrice | undefined;
}

const TERM_MONTHS_BY_ID: Record<string, number> = {
  monthly: 1,
  yearly: 12,
  biennial: 24,
};

export function special_offer_term_months(term_id: string): number | null {
  return TERM_MONTHS_BY_ID[term_id] ?? null;
}

export function special_offer_checkout_total_cents(
  method: SpecialOfferPayMethod,
  plan_code: string,
  term_months: number,
  list_total_cents: number,
): number | null {
  if (method === "card" && term_months !== 1) return null;

  return special_offer_crypto_total_cents(
    plan_code,
    term_months,
    list_total_cents,
  );
}

export function special_offer_checkout(
  is_available: boolean,
): SpecialOfferCheckout {
  const offer_plan = (plan_code: string | null | undefined) =>
    is_available && plan_code === SPECIAL_OFFER_PLAN_CODE ? plan_code : null;

  return {
    percent_off: is_available ? SPECIAL_OFFER_PERCENT_OFF : undefined,
    plan_pricing: (plan_code) => {
      const code = offer_plan(plan_code);

      if (!code) return undefined;

      return {
        percent_off: SPECIAL_OFFER_PERCENT_OFF,
        discounted_total_cents: (method, term_id, list_total_cents) => {
          const term_months = special_offer_term_months(term_id);

          if (term_months === null) return null;

          return special_offer_checkout_total_cents(
            method,
            code,
            term_months,
            list_total_cents,
          );
        },
      };
    },
    crypto_price: (plan_code) => {
      const code = offer_plan(plan_code);

      if (!code) return undefined;

      return (term_months, list_total_cents) =>
        special_offer_checkout_total_cents(
          "crypto",
          code,
          term_months,
          list_total_cents,
        );
    },
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
