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
import type { SpecialOfferStatus } from "@/services/api/offers";

import { is_onion_host } from "@/lib/onion_host";
import { PLAN_TIERS } from "@/components/settings/billing/billing_constants";

export const SPECIAL_OFFER_PLAN_CODE = "nova";
export const SPECIAL_OFFER_INTERVAL = "month";
export const SPECIAL_OFFER_PERCENT_OFF = 50;
export const SPECIAL_OFFER_DURATION_MONTHS = 12;

export type SpecialOfferInterval = "month" | "year";

export const SPECIAL_OFFER_INTERVALS: SpecialOfferInterval[] = ["month", "year"];

export function special_offer_interval_months(
  interval: SpecialOfferInterval,
): number {
  return interval === "year" ? 12 : 1;
}

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

const LEGACY_ELIGIBLE_TERMS = ["nova:month", "nova:year"];

const LEGACY_STATUS: SpecialOfferStatus = {
  available: true,
  auto_show: false,
  shown: false,
  dismissed: false,
  plan_code: SPECIAL_OFFER_PLAN_CODE,
  percent_off: SPECIAL_OFFER_PERCENT_OFF,
  duration_months: SPECIAL_OFFER_DURATION_MONTHS,
};

export function offer_price_cents(
  list_cents: number,
  percent_off: number,
): number {
  const cents = Math.round(list_cents);

  return cents - Math.floor((cents * percent_off + 50) / 100);
}

export function special_offer_discounted_cents(
  total_cents: number,
  percent_off: number = SPECIAL_OFFER_PERCENT_OFF,
): number {
  return Math.max(
    offer_price_cents(total_cents, percent_off),
    SPECIAL_OFFER_MIN_CHARGE_CENTS,
  );
}

export function offer_covers(
  status: SpecialOfferStatus | null,
  plan_code: string,
  interval: SpecialOfferInterval,
): boolean {
  if (!status) return false;

  const terms = status.eligible_terms ?? LEGACY_ELIGIBLE_TERMS;

  return terms.includes(`${plan_code}:${interval}`);
}

export function offer_covers_crypto_term(
  status: SpecialOfferStatus | null,
  plan_code: string,
  term_months: number,
): boolean {
  if (term_months === 12) return offer_covers(status, plan_code, "year");
  if (Number.isInteger(term_months) && term_months >= 1 && term_months <= 11) {
    return offer_covers(status, plan_code, "month");
  }

  return false;
}

export function offer_is_live(
  status: SpecialOfferStatus | null,
  now: Date,
): boolean {
  if (!status) return false;
  if (!status.ends_at) return true;

  const ends_at = Date.parse(status.ends_at);

  return Number.isNaN(ends_at) || now.getTime() <= ends_at;
}

export function special_offer_pricing(
  interval: SpecialOfferInterval = "month",
  plan_code: string = SPECIAL_OFFER_PLAN_CODE,
  percent_off: number = SPECIAL_OFFER_PERCENT_OFF,
): SpecialOfferPricing | null {
  const tier = PLAN_TIERS.find((entry) => entry.id === plan_code);

  if (!tier) return null;

  const list_cents =
    interval === "year" ? tier.yearly_cents : tier.monthly_cents;

  if (!Number.isFinite(list_cents) || list_cents <= 0) return null;

  return {
    list_cents,
    offer_cents: special_offer_discounted_cents(list_cents, percent_off),
  };
}

export function special_offer_crypto_total_cents(
  plan_code: string,
  term_months: number,
  list_total_cents: number,
  status: SpecialOfferStatus | null = LEGACY_STATUS,
): number | null {
  if (!offer_covers_crypto_term(status, plan_code, term_months)) return null;

  return special_offer_discounted_cents(
    list_total_cents,
    status?.percent_off ?? SPECIAL_OFFER_PERCENT_OFF,
  );
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
  status: SpecialOfferStatus | null = LEGACY_STATUS,
): number | null {
  if (method === "card" && term_months !== 1 && term_months !== 12) {
    return null;
  }

  return special_offer_crypto_total_cents(
    plan_code,
    term_months,
    list_total_cents,
    status,
  );
}

export function special_offer_checkout(
  is_available: boolean,
  status: SpecialOfferStatus | null = LEGACY_STATUS,
): SpecialOfferCheckout {
  const percent_off = status?.percent_off ?? SPECIAL_OFFER_PERCENT_OFF;
  const offer_plan = (plan_code: string | null | undefined) =>
    is_available &&
    plan_code &&
    (offer_covers(status, plan_code, "month") ||
      offer_covers(status, plan_code, "year"))
      ? plan_code
      : null;

  return {
    percent_off: is_available ? percent_off : undefined,
    plan_pricing: (plan_code) => {
      const code = offer_plan(plan_code);

      if (!code) return undefined;

      return {
        percent_off,
        discounted_total_cents: (method, term_id, list_total_cents) => {
          const term_months = special_offer_term_months(term_id);

          if (term_months === null) return null;

          return special_offer_checkout_total_cents(
            method,
            code,
            term_months,
            list_total_cents,
            status,
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
          status,
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

function offer_has_ended(ends_at: string | null | undefined): boolean {
  if (!ends_at) return false;

  const end = Date.parse(ends_at);

  return !Number.isNaN(end) && Date.now() > end;
}

export interface SpecialOfferStatusSnapshot {
  status: Pick<
    SpecialOfferStatus,
    "available" | "auto_show" | "dismissed" | "ends_at"
  > | null;
  is_loaded: boolean;
  plan_code: string | null;
}

export function is_special_offer_active({
  status,
  is_loaded,
  plan_code,
}: SpecialOfferStatusSnapshot): boolean {
  return (
    is_loaded &&
    !!status?.available &&
    !offer_has_ended(status.ends_at) &&
    is_special_offer_available({
      plan_code,
      is_dismissed: status?.dismissed ?? false,
    })
  );
}

export function special_offer_can_auto_show(
  snapshot: SpecialOfferStatusSnapshot,
): boolean {
  return is_special_offer_active(snapshot) && !!snapshot.status?.auto_show;
}
