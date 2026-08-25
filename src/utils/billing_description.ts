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
import type { TranslationKey } from "@/lib/i18n/types";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const DISPUTED_PREFIX = "Payment disputed: ";

const PLAN_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  free: "settings.free_plan_description",
  starter: "auth.plan_starter_description",
  pro: "auth.plan_pro_description",
  duo: "auth.plan_duo_description",
  family: "auth.plan_family_description",
  star: "auth.plan_star_description",
  nova: "auth.plan_nova_description",
  supernova: "auth.plan_supernova_description",
};

export function describe_plan(
  code: string | null | undefined,
  description: string | null | undefined,
  t: Translate,
): string {
  const key = PLAN_DESCRIPTION_KEYS[(code ?? "").trim().toLowerCase()];

  if (key) return t(key);

  return (description ?? "").trim();
}

const CRYPTO_PATTERN =
  /^Crypto (payment|manual credit) \(([^)]+) on ([^)]+)\) - (.+) (\d+)mo$/;

const CRYPTO_PREPAID_PATTERN = /^Crypto prepaid \((\d+) mo, (.+)\)$/;

export function describe_billing_entry(
  description: string | null | undefined,
  t: Translate,
): string {
  const raw = (description ?? "").trim();

  if (raw === "") return "";

  if (raw === "Payment failed")
    return t("settings.billing_desc_payment_failed");

  if (raw === "Refund processed") {
    return t("settings.billing_desc_refund_processed");
  }

  if (raw.startsWith(DISPUTED_PREFIX)) {
    return t("settings.billing_desc_payment_disputed", {
      reason: raw.slice(DISPUTED_PREFIX.length),
    });
  }

  const prepaid_match = CRYPTO_PREPAID_PATTERN.exec(raw);

  if (prepaid_match) {
    const [, months, plan] = prepaid_match;

    return t("settings.billing_desc_crypto_prepaid", { plan, months });
  }

  const crypto_match = CRYPTO_PATTERN.exec(raw);

  if (crypto_match) {
    const [, kind, currency, chain, plan, months] = crypto_match;

    return t(
      kind === "payment"
        ? "settings.billing_desc_crypto_payment"
        : "settings.billing_desc_crypto_credit",
      { plan, months, currency: currency.toUpperCase(), chain },
    );
  }

  return raw;
}

const CREDIT_FIXED: Record<string, TranslationKey> = {
  "Applied to invoice": "settings.credit_desc_applied_invoice",
  "Applied to storage addon checkout": "settings.credit_desc_applied_storage",
  "Applied to subscription checkout":
    "settings.credit_desc_applied_subscription_checkout",
  "Applied to subscription payment":
    "settings.credit_desc_applied_subscription_payment",
  "Credits returned - checkout could not be started":
    "settings.credit_desc_returned_checkout_not_started",
  "Credits returned - checkout not completed":
    "settings.credit_desc_returned_checkout_incomplete",
  "Credits returned - delayed payment failed":
    "settings.credit_desc_returned_payment_failed",
  "Credits reversed - invoice voided":
    "settings.credit_desc_reversed_invoice_voided",
  "Credits reversed - purchase refunded or disputed":
    "settings.credit_desc_reversed_refunded",
  "Referral commission - friend subscribed":
    "settings.credit_desc_referral_commission",
  "Reversal of crypto overpayment credit":
    "settings.credit_desc_reversal_crypto_overpayment",
  "Reversal of prepaid switch residual credit":
    "settings.credit_desc_reversal_prepaid_residual",
  "Unused prepaid time from previous plan":
    "settings.credit_desc_unused_prepaid",
  "Install bonus - desktop": "settings.credit_desc_install_bonus",
};

const PURCHASED_PATTERN = /^Purchased (\$[\d,]+\.\d{2}) in credits$/;

const REFERRAL_REVERSED_PREFIX = "Referral commission reversed - ";

const CRYPTO_OVERPAYMENT_PATTERN =
  /^Crypto overpayment credit \(([^)]+) on ([^)]+)\)$/;

export function describe_credit_entry(
  description: string | null | undefined,
  t: Translate,
): string {
  const raw = (description ?? "").trim();

  if (raw === "") return "";

  const fixed = CREDIT_FIXED[raw];

  if (fixed) return t(fixed);

  const purchased = PURCHASED_PATTERN.exec(raw);

  if (purchased) {
    return t("settings.credit_desc_purchased", { amount: purchased[1] });
  }

  if (raw.startsWith(REFERRAL_REVERSED_PREFIX)) {
    return t("settings.credit_desc_referral_reversed", {
      reason: raw.slice(REFERRAL_REVERSED_PREFIX.length),
    });
  }

  const overpayment = CRYPTO_OVERPAYMENT_PATTERN.exec(raw);

  if (overpayment) {
    return t("settings.credit_desc_crypto_overpayment", {
      currency: overpayment[1].toUpperCase(),
      chain: overpayment[2],
    });
  }

  return raw;
}
