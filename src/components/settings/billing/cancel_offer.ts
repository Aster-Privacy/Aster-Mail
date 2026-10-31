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
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  is_crypto_provider,
} from "@/components/settings/billing/billing_constants";

export type BillingInterval = "month" | "year" | "biennial";

export interface DowngradeOffer {
  plan_code: string;
  plan_name: string;
  is_family: boolean;
  monthly_cents: number;
}

export function read_billing_interval(
  billing_period: string | null | undefined,
): BillingInterval {
  if (!billing_period) return "month";
  if (billing_period.startsWith("bien")) return "biennial";
  if (billing_period.startsWith("two")) return "biennial";
  if (billing_period.startsWith("year")) return "year";

  return "month";
}

function monthly_equivalent_cents(
  tier: { monthly_cents: number; yearly_cents: number; biennial_cents: number },
  interval: BillingInterval,
): number {
  if (interval === "biennial") return Math.round(tier.biennial_cents / 24);
  if (interval === "year") return Math.round(tier.yearly_cents / 12);

  return tier.monthly_cents;
}

export function get_downgrade_offer(
  plan_code: string | null | undefined,
  interval: BillingInterval,
): DowngradeOffer | null {
  if (!plan_code) return null;

  const family_index = FAMILY_PLAN_TIERS.findIndex(
    (tier) => tier.id === plan_code,
  );

  if (family_index > 0) {
    const tier = FAMILY_PLAN_TIERS[family_index - 1];

    return {
      plan_code: tier.id,
      plan_name: tier.name,
      is_family: true,
      monthly_cents: monthly_equivalent_cents(tier, interval),
    };
  }

  if (family_index === 0) return null;

  const tier_index = PLAN_TIERS.findIndex((tier) => tier.id === plan_code);

  if (tier_index < 1) return null;

  const tier = PLAN_TIERS[tier_index - 1];

  return {
    plan_code: tier.id,
    plan_name: tier.name,
    is_family: false,
    monthly_cents: monthly_equivalent_cents(tier, interval),
  };
}

export interface YearlyOffer {
  plan_code: string;
  plan_name: string;
  is_family: boolean;
  yearly_monthly_cents: number;
  saving_cents: number;
}

export function get_yearly_offer(
  plan_code: string | null | undefined,
  interval: BillingInterval,
): YearlyOffer | null {
  if (!plan_code || interval !== "month") return null;

  const family_tier = FAMILY_PLAN_TIERS.find((tier) => tier.id === plan_code);
  const tier =
    family_tier ?? PLAN_TIERS.find((entry) => entry.id === plan_code);

  if (!tier) return null;

  const saving_cents = tier.monthly_cents * 12 - tier.yearly_cents;

  if (saving_cents <= 0) return null;

  return {
    plan_code: tier.id,
    plan_name: tier.name,
    is_family: !!family_tier,
    yearly_monthly_cents: Math.round(tier.yearly_cents / 12),
    saving_cents,
  };
}

export interface CancelOfferSubscription {
  cancel_at_period_end: boolean;
  has_stripe_subscription?: boolean;
  payment_provider?: string | null;
  is_lifetime?: boolean;
  plan: { code: string; billing_period?: string | null };
  yearly_switch_offer?: {
    plan_code: string;
    yearly_price_cents: number;
    saving_cents: number;
  } | null;
}

function yearly_offer_for(
  subscription: CancelOfferSubscription,
  interval: BillingInterval,
): YearlyOffer | null {
  const offer = get_yearly_offer(subscription.plan.code, interval);
  const server_offer = subscription.yearly_switch_offer;

  if (
    !offer ||
    !server_offer ||
    server_offer.plan_code !== offer.plan_code ||
    server_offer.saving_cents <= 0 ||
    server_offer.yearly_price_cents <= 0
  ) {
    return offer;
  }

  return {
    ...offer,
    yearly_monthly_cents: Math.round(server_offer.yearly_price_cents / 12),
    saving_cents: server_offer.saving_cents,
  };
}

export function get_cancel_offers(
  subscription: CancelOfferSubscription | null | undefined,
): { downgrade: DowngradeOffer | null; yearly: YearlyOffer | null } {
  if (
    !subscription ||
    subscription.cancel_at_period_end ||
    subscription.has_stripe_subscription === false ||
    is_crypto_provider(subscription.payment_provider)
  ) {
    return { downgrade: null, yearly: null };
  }

  const interval = read_billing_interval(subscription.plan.billing_period);

  return {
    downgrade: get_downgrade_offer(subscription.plan.code, interval),
    yearly: subscription.is_lifetime
      ? null
      : yearly_offer_for(subscription, interval),
  };
}
