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
import { SparklesIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import {
  PlanCard,
  Segmented,
  type SegmentedProps,
} from "@/components/settings/billing/plan_card";
import {
  format_price,
  type AvailablePlan,
  type SubscriptionResponse,
} from "@/services/api/billing";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  FAMILY_PLAN_DUO_FEATURES,
  FAMILY_PLAN_FAMILY_FEATURES,
  SUPPORTED_CURRENCIES,
  convert_cents,
  is_crypto_provider,
  type FamilyPlanTier,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { create_family_group } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

function Tabs<T extends string>({ value, options, on_change }: SegmentedProps<T>) {
  return (
    <div className="max-w-full overflow-x-auto scrollbar-hide">
      <div className="inline-flex items-center gap-4 sm:gap-8 flex-wrap justify-center border-b border-edge-secondary">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => on_change(opt.id)}
            className={`relative shrink-0 px-4 pt-1 pb-2.5 text-sm font-semibold transition-colors focus:outline-none whitespace-nowrap ${
              active ? "text-txt-primary" : "text-txt-muted hover:text-txt-secondary"
            }`}
          >
            {opt.label}
            <span
              className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-opacity"
              style={{ backgroundColor: "var(--accent-blue)", opacity: active ? 1 : 0 }}
            />
          </button>
        );
      })}
      </div>
    </div>
  );
}

interface AvailablePlansSectionProps {
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  billing_period: "monthly" | "yearly" | "biennial";
  set_billing_period: (value: "monthly" | "yearly" | "biennial") => void;
  preferred_currency: string;
  handle_currency_change: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  plan_features: Record<string, { label: string; on: boolean }[]>;
  is_action_loading: boolean;
  on_upgrade: (plan: AvailablePlan) => void;
  on_family_plan_change?: (plan_code: string, interval: "month" | "year") => void;
  on_tauri_checkout_opened?: () => void;
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
  on_family_plan_change,
  on_tauri_checkout_opened,
  current_billing_interval,
}: AvailablePlansSectionProps) {
  const { t } = use_i18n();

  use_currency_rates();

  const [plan_type, set_plan_type] = useState<"individual" | "family">("individual");
  const [family_loading, set_family_loading] = useState(false);
  const [pending_family_tier, set_pending_family_tier] = useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] = useState<FamilyPlanTier | null>(null);

  const handle_family_select = (tier: FamilyPlanTier) => {
    set_pending_family_tier(tier);
  };

  const handle_family_card = async () => {
    if (!pending_family_tier) return;
    const tier = pending_family_tier;
    const card_interval: "month" | "year" = billing_period === "yearly" ? "year" : "month";
    set_pending_family_tier(null);

    const has_existing_sub =
      !!subscription &&
      subscription.plan.code !== "free" &&
      !is_crypto_provider(subscription.payment_provider) &&
      subscription.has_stripe_subscription !== false;

    if (has_existing_sub && on_family_plan_change) {
      on_family_plan_change(tier.id, card_interval);
      return;
    }

    set_family_loading(true);
    try {
      const is_tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      const origin = is_tauri ? "https://app.astermail.org" : window.location.origin;
      const res = await create_family_group(
        tier.id,
        card_interval,
        `${origin}/?family=success`,
        `${origin}/?family=cancelled`,
      );
      if (res.data?.checkout_url) {
        const parsed = new URL(res.data.checkout_url);
        if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
        if (is_tauri) {
          const core = await import("@tauri-apps/api/core");
          await core.invoke("open_external_url", { url: parsed.toString() });
          on_tauri_checkout_opened?.();
        } else {
          window.location.href = parsed.toString();
        }
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

  const card_interval: "month" | "year" = billing_period === "yearly" ? "year" : "month";
  const period_label = t("settings.per_month_short");

  return (
    <div className="pt-4" id="available-plans">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <SparklesIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.available_plans")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <div className="flex flex-col items-center gap-4 mb-4">
        <Tabs
          value={plan_type}
          on_change={set_plan_type}
          options={[
            { id: "individual", label: t("settings.plan_type_individual") },
            { id: "family", label: t("settings.plan_type_family") },
          ]}
        />
        <Segmented
          value={billing_period === "yearly" ? "yearly" : "monthly"}
          on_change={(v) => set_billing_period(v)}
          options={[
            { id: "monthly", label: t("settings.billing_monthly") },
            { id: "yearly", label: t("settings.billing_yearly") },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <p className="text-xs text-txt-muted text-center max-w-md">
          {preferred_currency === "usd"
            ? t("settings.prices_in_usd_note")
            : t("settings.prices_converted_note")}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
          {FAMILY_PLAN_TIERS.map((tier) => {
            const is_same_plan = subscription?.plan.code === tier.id;
            const is_current = is_same_plan && current_billing_interval === card_interval;
            const is_interval_switch = is_same_plan && current_billing_interval !== card_interval;
            const price_cents =
              billing_period === "yearly" ? Math.round(tier.yearly_cents / 12) : tier.monthly_cents;
            const features = tier.max_members === 2 ? FAMILY_PLAN_DUO_FEATURES : FAMILY_PLAN_FAMILY_FEATURES;

            return (
              <PlanCard
                key={tier.id}
                name={tier.name}
                description={tier.description}
                price_label={format_price(convert_cents(price_cents, preferred_currency), preferred_currency)}
                period_label={period_label}
                anchor_label={billing_period === "yearly"
                  ? format_price(convert_cents(tier.monthly_cents, preferred_currency), preferred_currency)
                  : null}
                save_label={billing_period === "yearly"
                  ? t("settings.save_percent", { percent: Math.round((1 - tier.yearly_cents / (tier.monthly_cents * 12)) * 100) })
                  : null}
                billed_note={billing_period === "yearly" ? t("settings.billed_annually") : null}
                badge={!!tier.is_recommended && !is_current ? t("settings.plan_recommended") : null}
                featured={!!tier.is_recommended}
                is_current={is_current}
                cta_label={is_current
                  ? t("settings.current_plan")
                  : is_interval_switch
                    ? (card_interval === "year" ? t("settings.switch_to_yearly") : t("settings.switch_to_monthly"))
                    : t("settings.get_plan", { name: tier.name })}
                cta_disabled={is_action_loading || family_loading || is_current}
                on_cta={() => { if (!is_current) handle_family_select(tier); }}
                features={features}
              />
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
          on_checkout_opened={on_tauri_checkout_opened}
          on_close={() => set_crypto_family_tier(null)}
          plan_code={crypto_family_tier.id}
          plan_name={crypto_family_tier.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_family_tier.yearly_cents}
        />
      )}

      {plan_type === "individual" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
          {PLAN_TIERS.map((tier, tier_index) => {
            const current_plan_code = subscription?.plan.code;
            const current_tier_index = PLAN_TIERS.findIndex((p) => p.id === current_plan_code);
            const is_same_plan = current_plan_code === tier.id;
            const is_current = is_same_plan && current_billing_interval === card_interval;
            const is_interval_switch = is_same_plan && current_billing_interval !== card_interval;
            const is_downgrade =
              !is_same_plan && current_tier_index > -1 && tier_index < current_tier_index;

            return (
              <PlanCard
                key={tier.id}
                name={tier.name}
                description={tier.description}
                price_label={format_price(
                  convert_cents(
                    billing_period === "monthly"
                      ? tier.monthly_cents
                      : Math.round(tier.yearly_cents / 12),
                    preferred_currency,
                  ),
                  preferred_currency,
                )}
                period_label={period_label}
                anchor_label={billing_period === "yearly"
                  ? format_price(convert_cents(tier.monthly_cents, preferred_currency), preferred_currency)
                  : null}
                save_label={billing_period === "yearly"
                  ? t("settings.save_percent", { percent: Math.round((1 - tier.yearly_cents / (tier.monthly_cents * 12)) * 100) })
                  : null}
                billed_note={billing_period === "yearly" ? t("settings.billed_annually") : null}
                badge={!!tier.is_recommended && !is_current ? t("settings.plan_recommended") : null}
                featured={!!tier.is_recommended}
                is_current={is_current}
                cta_label={is_current
                  ? t("settings.current_plan")
                  : is_interval_switch
                    ? (card_interval === "year" ? t("settings.switch_to_yearly") : t("settings.switch_to_monthly"))
                    : is_downgrade ? t("settings.downgrade") : t("settings.get_plan", { name: tier.name })}
                cta_disabled={is_action_loading || is_current}
                on_cta={() => {
                  if (is_current) return;
                  const api_plan = plans.find((p) => p.code === tier.id);
                  if (api_plan) {
                    on_upgrade(api_plan);
                  } else {
                    show_toast(t("settings.plans_coming_soon"), "info");
                  }
                }}
                features={plan_features[tier.id] ?? []}
              />
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-txt-muted">
        <ShieldCheckIcon className="w-3.5 h-3.5 text-txt-muted" />
        <span>
          {t("settings.money_back_guarantee")} · {t("settings.cancel_anytime")}
        </span>
      </div>
    </div>
  );
}
