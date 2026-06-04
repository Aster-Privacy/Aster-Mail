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
import { useState } from "react";
import { CheckIcon, SparklesIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  format_price,
  type AvailablePlan,
  type SubscriptionResponse,
} from "@/services/api/billing";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  SUPPORTED_CURRENCIES,
  convert_cents,
  type FamilyPlanTier,
} from "@/components/settings/billing/billing_constants";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { create_family_group } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface AvailablePlansSectionProps {
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  billing_period: "monthly" | "yearly" | "biennial";
  set_billing_period: (value: "monthly" | "yearly" | "biennial") => void;
  preferred_currency: string;
  handle_currency_change: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  plan_features: Record<string, string[]>;
  is_action_loading: boolean;
  on_upgrade: (plan: AvailablePlan) => void;
  current_billing_interval: "month" | "year";
}

export function AvailablePlansSection({
  subscription,
  plans,
  billing_period,
  set_billing_period,
  preferred_currency,
  handle_currency_change,
  plan_features,
  is_action_loading,
  on_upgrade,
  current_billing_interval,
}: AvailablePlansSectionProps) {
  const { t } = use_i18n();
  const [plan_type, set_plan_type] = useState<"individual" | "family">("individual");
  const [family_loading, set_family_loading] = useState(false);
  const [pending_family_tier, set_pending_family_tier] = useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] = useState<FamilyPlanTier | null>(null);

  const billing_interval: "month" | "year" = billing_period === "yearly" ? "year" : "month";

  const handle_family_select = (tier: FamilyPlanTier) => {
    set_pending_family_tier(tier);
  };

  const handle_family_card = async () => {
    if (!pending_family_tier) return;
    const tier = pending_family_tier;
    set_pending_family_tier(null);
    set_family_loading(true);
    try {
      const res = await create_family_group(tier.id, billing_interval);
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
      } else {
        show_toast(t("settings.failed_checkout"), "error");
      }
    } catch {
      show_toast(t("settings.failed_checkout"), "error");
    } finally {
      set_family_loading(false);
    }
  };

  const handle_family_crypto = () => {
    if (!pending_family_tier) return;
    set_crypto_family_tier(pending_family_tier);
    set_pending_family_tier(null);
  };

  return (
    <div className="pt-4" id="available-plans">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <SparklesIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.available_plans")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <div className="flex flex-col items-center gap-2 mb-4">
        <div
          className="inline-flex rounded-full p-1 gap-0.5"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-secondary)" }}
        >
          {(["individual", "family"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => set_plan_type(type)}
              className="px-5 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5"
              style={plan_type === type
                ? { background: "var(--accent-blue)", color: "#fff" }
                : { background: "transparent", color: "var(--txt-secondary)" }
              }
            >
              {type === "family" && <UserGroupIcon className="w-3.5 h-3.5" />}
              {type === "individual" ? t("settings.plan_type_individual") : t("settings.plan_type_family")}
            </button>
          ))}
        </div>

        <div
          className="inline-flex rounded-full p-0.5 gap-0.5"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
        >
          {(["monthly", "yearly"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => set_billing_period(period)}
              className="px-4 py-1 rounded-full text-xs font-medium transition-all"
              style={billing_period === period
                ? { background: "var(--accent-blue)", color: "#fff" }
                : { background: "transparent", color: "var(--txt-muted)" }
              }
            >
              {period === "monthly" ? t("settings.billing_monthly") : t("settings.billing_yearly")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-4">
        <p className="text-xs text-txt-muted">
          {t("settings.prices_in_usd_note")}
        </p>
        <select
          className="text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1 text-txt-secondary cursor-pointer outline-none focus:border-blue-500 transition-colors"
          value={preferred_currency}
          onChange={handle_currency_change}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {plan_type === "family" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FAMILY_PLAN_TIERS.map((tier) => {
            const current_plan_code = subscription?.plan.code;
            const is_current = current_plan_code === tier.id;
            const price_cents = billing_period === "yearly" ? tier.yearly_cents : tier.monthly_cents;
            const features = tier.max_members === 2
              ? [
                  "2 members, separate accounts",
                  "1 TB shared encrypted storage",
                  "Unlimited aliases per member",
                  "5 custom domains per member",
                  "Shared family aliases",
                  "End-to-end encryption",
                  "Zero-access architecture",
                  "Admin storage controls",
                  "Invite by email or link",
                  "Quantum-safe internal mail",
                  "Full IMAP/SMTP per member",
                  "Catch-all email address",
                  "Priority support",
                ]
              : [
                  "Up to 6 members, separate accounts",
                  "3 TB shared encrypted storage",
                  "Unlimited aliases per member",
                  "30 custom domains per member",
                  "Shared family aliases",
                  "End-to-end encryption",
                  "Zero-access architecture",
                  "Admin storage controls",
                  "Invite by email or link",
                  "Quantum-safe internal mail",
                  "Full IMAP/SMTP per member",
                  "Catch-all email address",
                  "Org filters & activity log",
                  "Data retention policies",
                  "Security policy controls",
                  "Priority support",
                ];

            return (
              <div
                key={tier.id}
                className="relative rounded-2xl border-2 overflow-hidden flex flex-col"
                style={{
                  borderColor: is_current ? "var(--accent-blue)" : "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
              >
                <div className="px-5 pt-5 pb-4 text-center" style={{ backgroundColor: "transparent" }}>
                  {is_current && (
                    <div className="inline-flex px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ backgroundColor: "#2563eb", color: "#fff" }}>
                      {t("settings.current_plan")}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <UserGroupIcon className="w-5 h-5 text-txt-primary" />
                    <h4 className="text-lg font-bold text-txt-primary">{tier.name}</h4>
                  </div>
                  <p className="text-xs text-txt-muted mb-3">
                    {tier.max_members === 2 ? t("settings.family_duo_tagline") : t("settings.family_plan_tagline")}
                  </p>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-txt-primary">
                      {format_price(convert_cents(price_cents, preferred_currency), preferred_currency)}
                    </span>
                    <span className="text-sm text-txt-muted">
                      {billing_period === "monthly" ? t("settings.per_month_short") : t("settings.per_year_short")}
                    </span>
                  </div>
                  {billing_period === "yearly" && (
                    <p className="text-xs font-medium mt-1.5" style={{ color: "var(--color-success)" }}>
                      {tier.savings_label}
                    </p>
                  )}
                  <Button
                    className="w-full mt-4"
                    disabled={is_action_loading || family_loading || is_current}
                    variant={is_current ? "outline" : "primary"}
                    onClick={() => { if (!is_current) handle_family_select(tier); }}
                  >
                    {is_current ? t("settings.current_plan") : t("settings.upgrade")}
                  </Button>
                </div>
                <div className="px-5 pb-5 flex-1" style={{ borderTop: "1px solid var(--border-secondary)" }}>
                  <div className="space-y-2.5 pt-4">
                    {features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckIcon className="w-3.5 h-3.5 flex-shrink-0 text-accent-blue" strokeWidth={2.5} />
                        <span className="text-xs text-txt-secondary">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending_family_tier && (
        <PlanPaymentMethodModal
          busy={family_loading}
          on_choose_card={handle_family_card}
          on_choose_crypto={handle_family_crypto}
          on_close={() => set_pending_family_tier(null)}
          open={!!pending_family_tier}
          plan_name={pending_family_tier.name}
        />
      )}

      {crypto_family_tier && (
        <CryptoTermModal
          is_open={!!crypto_family_tier}
          monthly_price_cents={crypto_family_tier.monthly_cents}
          on_close={() => set_crypto_family_tier(null)}
          plan_code={crypto_family_tier.id}
          plan_name={crypto_family_tier.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_family_tier.yearly_cents}
        />
      )}

      {plan_type === "individual" && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLAN_TIERS.map((tier, tier_index) => {
          const current_plan_code = subscription?.plan.code;
          const current_tier_index = PLAN_TIERS.findIndex(
            (t) => t.id === current_plan_code,
          );
          const card_interval: "month" | "year" =
            billing_period === "yearly" ? "year" : "month";
          const is_same_plan = current_plan_code === tier.id;
          const is_same_interval = current_billing_interval === card_interval;
          const is_current = is_same_plan && is_same_interval;
          const is_interval_switch = is_same_plan && !is_same_interval;
          const is_downgrade =
            !is_same_plan &&
            current_tier_index > -1 &&
            tier_index < current_tier_index;

          return (
            <div
              key={tier.id}
              className="relative rounded-2xl border-2 overflow-hidden flex flex-col"
              style={{
                borderColor: is_current
                  ? "var(--accent-blue)"
                  : "var(--border-secondary)",
                backgroundColor: "var(--bg-tertiary)",
              }}
            >
              <div
                className="px-5 pt-5 pb-4 text-center"
                style={{
                  backgroundColor: "transparent",
                }}
              >
                {is_current && (
                  <div
                    className="inline-flex px-3 py-1 rounded-full text-xs font-medium mb-3"
                    style={{
                      backgroundColor: "#2563eb",
                      color: "#fff",
                    }}
                  >
                    {t("settings.current_plan")}
                  </div>
                )}

                <h4 className="text-lg font-bold text-txt-primary">
                  {tier.name}
                </h4>

                <div className="mt-2">
                  <span className="text-3xl font-bold text-txt-primary">
                    {format_price(
                      convert_cents(
                        billing_period === "monthly"
                          ? tier.monthly_cents
                          : tier.yearly_cents,
                        preferred_currency,
                      ),
                      preferred_currency,
                    )}
                  </span>
                  <span className="text-sm text-txt-muted">
                    {billing_period === "monthly"
                      ? t("settings.per_month_short")
                      : t("settings.per_year_short")}
                  </span>
                </div>

                {billing_period === "yearly" && (
                  <p
                    className="text-xs font-medium mt-1.5"
                    style={{ color: "var(--color-success)" }}
                  >
                    {t("settings.save_yearly", {
                      amount: format_price(
                        convert_cents(tier.savings_cents, preferred_currency),
                        preferred_currency,
                      ),
                    })}
                  </p>
                )}

                <Button
                  className="w-full mt-4"
                  disabled={is_action_loading || is_current}
                  variant={is_current ? "outline" : "primary"}
                  onClick={() => {
                    if (is_current) return;
                    const api_plan = plans.find((p) => p.code === tier.id);

                    if (api_plan) {
                      on_upgrade(api_plan);
                    } else {
                      show_toast(t("settings.plans_coming_soon"), "info");
                    }
                  }}
                >
                  {is_current
                    ? t("settings.current_plan")
                    : is_interval_switch
                      ? card_interval === "year"
                        ? t("settings.switch_to_yearly")
                        : t("settings.switch_to_monthly")
                      : is_downgrade
                        ? t("settings.downgrade")
                        : t("settings.upgrade")}
                </Button>

              </div>

              <div
                className="px-5 pb-5 flex-1"
                style={{
                  borderTop: "1px solid var(--border-secondary)",
                }}
              >
                {tier.id !== "star" && (
                  <p
                    className="text-xs font-medium pt-4 pb-1"
                    style={{ color: "var(--accent-blue)" }}
                  >
                    {tier.id === "nova"
                      ? t("settings.all_star_features")
                      : t("settings.all_nova_features")}
                  </p>
                )}
                <div
                  className={`space-y-2.5 ${tier.id === "star" ? "pt-4" : "pt-2"}`}
                >
                  {plan_features[tier.id]?.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckIcon
                        className="w-3.5 h-3.5 flex-shrink-0"
                        strokeWidth={2.5}
                        style={{ color: "var(--accent-blue)" }}
                      />
                      <span className="text-xs text-txt-secondary">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
