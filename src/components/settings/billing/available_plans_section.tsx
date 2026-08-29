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

import { useState } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

import { CrownIcon } from "@/components/ui/crown_icon";
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
import {
  compute_plan_recommendation,
  DEFAULT_RECOMMENDED_PLAN,
  DEFAULT_RECOMMENDED_FAMILY_PLAN,
} from "@/components/settings/billing/plan_recommendation";
import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { create_family_group } from "@/services/api/family";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { checkout_error_text } from "./checkout_error_text";

const TIER_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  star: "auth.plan_star_description",
  nova: "auth.plan_nova_description",
  supernova: "auth.plan_supernova_description",
  duo: "auth.plan_duo_description",
  family: "auth.plan_family_description",
};

function tier_description(
  tier: { id: string; description: string },
  t: (key: TranslationKey) => string,
): string {
  const key = TIER_DESCRIPTION_KEYS[tier.id];

  return key ? t(key) : tier.description;
}

function Tabs<T extends string>({
  value,
  options,
  on_change,
}: SegmentedProps<T>) {
  return (
    <div className="w-full max-w-xs">
      <div
        className="grid w-full border-b border-edge-secondary"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((opt) => {
          const active = value === opt.id;

          return (
            <button
              key={opt.id}
              className={`relative px-4 pt-1 pb-2.5 text-sm font-semibold transition-colors focus:outline-none whitespace-nowrap ${
                active
                  ? "text-txt-primary"
                  : "text-txt-muted hover:text-txt-secondary"
              }`}
              type="button"
              onClick={() => on_change(opt.id)}
            >
              {opt.label}
              <span
                className="absolute start-0 end-0 -bottom-px h-0.5 rounded-full transition-opacity"
                style={{
                  backgroundColor: "var(--accent-blue)",
                  opacity: active ? 1 : 0,
                }}
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
  plans_load_failed?: boolean;
  on_reload_plans?: () => void;
  billing_period: "monthly" | "yearly" | "biennial";
  set_billing_period: (value: "monthly" | "yearly" | "biennial") => void;
  preferred_currency: string;
  handle_currency_change: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  plan_features: Record<string, { label: string; on: boolean }[]>;
  is_action_loading: boolean;
  on_upgrade: (plan: AvailablePlan) => void;
  on_family_plan_change?: (
    plan_code: string,
    interval: "month" | "year",
  ) => void;
  on_tauri_checkout_opened?: () => void;
  current_billing_interval: "month" | "year";
}

export function AvailablePlansSection({
  subscription,
  plans,
  plans_load_failed,
  on_reload_plans,
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

  const [plan_type, set_plan_type] = useState<"individual" | "family">(
    "individual",
  );
  const [family_loading, set_family_loading] = useState(false);
  const [pending_family_tier, set_pending_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] =
    useState<FamilyPlanTier | null>(null);

  const handle_family_select = (tier: FamilyPlanTier) => {
    set_pending_family_tier(tier);
  };

  const handle_family_card = async (term_id?: string) => {
    if (!pending_family_tier || family_loading) return;
    const tier = pending_family_tier;
    const card_interval: "month" | "year" =
      term_id === "monthly"
        ? "month"
        : term_id === "yearly"
          ? "year"
          : billing_period === "yearly"
            ? "year"
            : "month";

    const has_existing_sub =
      !!subscription &&
      subscription.plan.code !== "free" &&
      !is_crypto_provider(subscription.payment_provider) &&
      subscription.has_stripe_subscription !== false;

    if (has_existing_sub && on_family_plan_change) {
      set_pending_family_tier(null);
      on_family_plan_change(tier.id, card_interval);

      return;
    }

    set_family_loading(true);
    try {
      const is_tauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      const origin = is_tauri
        ? "https://app.astermail.org"
        : window.location.origin;
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
        show_toast(
          checkout_error_text(t, res.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      }
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_family_loading(false);
      set_pending_family_tier(null);
    }
  };

  const handle_family_crypto = () => {
    if (!pending_family_tier || family_loading) return;
    set_crypto_family_tier(pending_family_tier);
    set_pending_family_tier(null);
  };

  const card_interval: "month" | "year" =
    billing_period === "yearly" ? "year" : "month";
  const period_label = t("settings.per_month_short");
  const recommendation = compute_plan_recommendation({
    current_plan_code: subscription?.plan.code,
    storage_used_bytes: subscription?.storage?.used_bytes,
    storage_limit_bytes: subscription?.storage?.total_limit_bytes,
  });
  const individual_current_index = PLAN_TIERS.findIndex(
    (tier) => tier.id === subscription?.plan.code,
  );
  const family_current_index = FAMILY_PLAN_TIERS.findIndex(
    (tier) => tier.id === subscription?.plan.code,
  );
  const individual_top_tier =
    recommendation.ladder === "individual" &&
    recommendation.is_top_tier &&
    individual_current_index === PLAN_TIERS.length - 1;
  const family_top_tier =
    recommendation.ladder === "family" &&
    recommendation.is_top_tier &&
    family_current_index === FAMILY_PLAN_TIERS.length - 1;
  const individual_recommended_code =
    recommendation.recommended_plan_code ??
    (individual_current_index > -1
      ? (PLAN_TIERS[individual_current_index + 1]?.id ?? null)
      : DEFAULT_RECOMMENDED_PLAN);
  const family_recommended_code =
    recommendation.recommended_family_plan_code ??
    (family_current_index > -1
      ? (FAMILY_PLAN_TIERS[family_current_index + 1]?.id ?? null)
      : DEFAULT_RECOMMENDED_FAMILY_PLAN);
  const visible_individual_tiers = individual_top_tier
    ? PLAN_TIERS.filter((tier) => tier.id === subscription?.plan.code)
    : PLAN_TIERS;
  const visible_family_tiers = family_top_tier
    ? FAMILY_PLAN_TIERS.filter((tier) => tier.id === subscription?.plan.code)
    : FAMILY_PLAN_TIERS;
  const current_plan_name =
    [...PLAN_TIERS, ...FAMILY_PLAN_TIERS].find(
      (tier) => tier.id === subscription?.plan.code,
    )?.name ??
    subscription?.plan.name ??
    null;
  const recommended_tier_name =
    [...PLAN_TIERS, ...FAMILY_PLAN_TIERS].find(
      (tier) =>
        tier.id ===
        (recommendation.recommended_plan_code ??
          recommendation.recommended_family_plan_code),
    )?.name ?? null;

  return (
    <div className="pt-4" id="available-plans">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <CrownIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.available_plans")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <div className="flex flex-col items-center gap-4 mb-4">
        <Tabs
          on_change={set_plan_type}
          options={[
            { id: "individual", label: t("settings.plan_type_individual") },
            { id: "family", label: t("settings.plan_type_family") },
          ]}
          value={plan_type}
        />
        <Segmented
          on_change={(v) => set_billing_period(v)}
          options={[
            { id: "monthly", label: t("settings.billing_monthly") },
            { id: "yearly", label: t("settings.billing_yearly") },
          ]}
          value={billing_period === "yearly" ? "yearly" : "monthly"}
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

      {recommendation.is_paid && current_plan_name && (
        <div className="mb-5 rounded-xl border border-edge-secondary bg-surf-tertiary px-4 py-3">
          <div className="flex items-start gap-3">
            <CrownIcon className="w-5 h-5 mt-0.5 flex-shrink-0 text-txt-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-txt-primary">
                {recommendation.is_top_tier
                  ? t("settings.plan_top_tier_title")
                  : t("settings.plan_current_title", {
                      plan: current_plan_name,
                    })}
              </p>
              <p className="mt-1 text-xs text-txt-secondary">
                {recommendation.is_top_tier
                  ? t("settings.plan_top_tier_note", {
                      plan: current_plan_name,
                    })
                  : recommendation.storage_is_tight && recommended_tier_name
                    ? t("settings.plan_storage_tight_note", {
                        percent: Math.round(recommendation.storage_percent),
                        plan: recommended_tier_name,
                      })
                    : t("settings.plan_current_note", {
                        percent: Math.round(recommendation.storage_percent),
                      })}
              </p>
              <button
                className="mt-2 text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
                type="button"
                onClick={scroll_to_storage_addons}
              >
                {t("settings.plan_add_storage_link")}
              </button>
            </div>
          </div>
        </div>
      )}

      {plan_type === "family" && (
        <div
          className={`grid gap-4 pt-3 ${
            family_top_tier
              ? "grid-cols-1 max-w-sm mx-auto"
              : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {visible_family_tiers.map((tier) => {
            const is_same_plan = subscription?.plan.code === tier.id;
            const is_current =
              is_same_plan && current_billing_interval === card_interval;
            const is_interval_switch =
              is_same_plan && current_billing_interval !== card_interval;
            const price_cents =
              billing_period === "yearly"
                ? Math.round(tier.yearly_cents / 12)
                : tier.monthly_cents;
            const features = (
              tier.max_members === 2
                ? FAMILY_PLAN_DUO_FEATURES
                : FAMILY_PLAN_FAMILY_FEATURES
            ).map((feature) => ({
              label: t(feature.label_key),
              on: feature.on,
              icon: feature.icon,
            }));

            return (
              <PlanCard
                key={tier.id}
                anchor_label={
                  billing_period === "yearly"
                    ? format_price(
                        convert_cents(tier.monthly_cents, preferred_currency),
                        preferred_currency,
                      )
                    : null
                }
                badge={
                  is_current
                    ? t("settings.current_plan")
                    : family_recommended_code === tier.id
                      ? t("settings.plan_recommended")
                      : null
                }
                billed_note={
                  billing_period === "yearly"
                    ? t("settings.billed_annually")
                    : null
                }
                cta_disabled={is_action_loading || family_loading || is_current}
                cta_label={
                  is_current
                    ? t("settings.current_plan")
                    : is_interval_switch
                      ? card_interval === "year"
                        ? t("settings.switch_to_yearly")
                        : t("settings.switch_to_monthly")
                      : t("settings.get_plan", { name: tier.name })
                }
                description={tier_description(tier, t)}
                featured={family_recommended_code === tier.id}
                features={features}
                is_current={is_current}
                lead_in={
                  tier.max_members === 2
                    ? null
                    : t("settings.plan_everything_in", {
                        plan: FAMILY_PLAN_TIERS[0].name,
                      })
                }
                name={tier.name}
                on_cta={() => {
                  if (!is_current) handle_family_select(tier);
                }}
                period_label={period_label}
                price_label={format_price(
                  convert_cents(price_cents, preferred_currency),
                  preferred_currency,
                )}
                save_label={
                  billing_period === "yearly"
                    ? t("settings.save_percent", {
                        percent: Math.round(
                          (1 - tier.yearly_cents / (tier.monthly_cents * 12)) *
                            100,
                        ),
                      })
                    : null
                }
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
          on_close={() => {
            if (family_loading) return;
            set_pending_family_tier(null);
          }}
          open={!!pending_family_tier}
          plan_name={pending_family_tier.name}
          selected_term={
            billing_period === "monthly"
              ? "monthly"
              : billing_period === "yearly"
                ? "yearly"
                : "biennial"
          }
          term_options={[
            {
              id: "monthly",
              label: t("settings.billing_monthly"),
              per_month_cents: pending_family_tier.monthly_cents,
              total_cents: pending_family_tier.monthly_cents,
              save_cents: 0,
            },
            {
              id: "yearly",
              label: t("settings.billing_yearly"),
              per_month_cents: Math.round(
                pending_family_tier.yearly_cents / 12,
              ),
              total_cents: pending_family_tier.yearly_cents,
              save_cents:
                pending_family_tier.monthly_cents * 12 -
                pending_family_tier.yearly_cents,
            },
            {
              id: "biennial",
              label: t("settings.biennial"),
              per_month_cents: Math.round(
                pending_family_tier.biennial_cents / 24,
              ),
              total_cents: pending_family_tier.biennial_cents,
              save_cents:
                pending_family_tier.monthly_cents * 24 -
                pending_family_tier.biennial_cents,
              crypto_only: true,
            },
          ]}
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
        <div
          className={`grid gap-4 pt-3 ${
            individual_top_tier
              ? "grid-cols-1 max-w-sm mx-auto"
              : "grid-cols-1 sm:grid-cols-3"
          }`}
        >
          {visible_individual_tiers.map((tier) => {
            const tier_index = PLAN_TIERS.findIndex((p) => p.id === tier.id);
            const current_plan_code = subscription?.plan.code;
            const current_tier_index = PLAN_TIERS.findIndex(
              (p) => p.id === current_plan_code,
            );
            const is_same_plan = current_plan_code === tier.id;
            const is_current =
              is_same_plan && current_billing_interval === card_interval;
            const is_interval_switch =
              is_same_plan && current_billing_interval !== card_interval;
            const is_downgrade =
              !is_same_plan &&
              current_tier_index > -1 &&
              tier_index < current_tier_index;

            return (
              <PlanCard
                key={tier.id}
                anchor_label={
                  billing_period === "yearly"
                    ? format_price(
                        convert_cents(tier.monthly_cents, preferred_currency),
                        preferred_currency,
                      )
                    : null
                }
                badge={
                  is_current
                    ? t("settings.current_plan")
                    : individual_recommended_code === tier.id
                      ? t("settings.plan_recommended")
                      : null
                }
                billed_note={
                  billing_period === "yearly"
                    ? t("settings.billed_annually")
                    : null
                }
                cta_disabled={is_action_loading || is_current}
                cta_label={
                  is_current
                    ? t("settings.current_plan")
                    : is_interval_switch
                      ? card_interval === "year"
                        ? t("settings.switch_to_yearly")
                        : t("settings.switch_to_monthly")
                      : is_downgrade
                        ? t("settings.downgrade")
                        : t("settings.get_plan", { name: tier.name })
                }
                description={tier_description(tier, t)}
                featured={individual_recommended_code === tier.id}
                features={plan_features[tier.id] ?? []}
                is_current={is_current}
                lead_in={t("settings.plan_everything_in", {
                  plan:
                    tier_index === 0
                      ? t("settings.plan_free")
                      : PLAN_TIERS[tier_index - 1].name,
                })}
                name={tier.name}
                on_cta={() => {
                  if (is_current) return;
                  const api_plan = plans.find((p) => p.code === tier.id);

                  if (api_plan) {
                    on_upgrade(api_plan);

                    return;
                  }
                  if (plans_load_failed) {
                    show_toast(
                      t("common.something_went_wrong_try_again"),
                      "error",
                    );
                    on_reload_plans?.();

                    return;
                  }
                  show_toast(
                    t("settings.plans_coming_soon"),
                    "info",
                    TOAST_DURATION_BILLING_MS,
                  );
                }}
                period_label={period_label}
                price_label={format_price(
                  convert_cents(
                    billing_period === "monthly"
                      ? tier.monthly_cents
                      : Math.round(tier.yearly_cents / 12),
                    preferred_currency,
                  ),
                  preferred_currency,
                )}
                save_label={
                  billing_period === "yearly"
                    ? t("settings.save_percent", {
                        percent: Math.round(
                          (1 - tier.yearly_cents / (tier.monthly_cents * 12)) *
                            100,
                        ),
                      })
                    : null
                }
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
