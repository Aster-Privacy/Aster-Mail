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
import type { ReactNode } from "react";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState } from "react";
import { CheckIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import {
  Button,
  IslandSection,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aster/ui";

import { checkout_error_text } from "./checkout_error_text";

import { CrownIcon } from "@/components/ui/crown_icon";
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

function yearly_save_percent(tier: {
  monthly_cents: number;
  yearly_cents: number;
}): number {
  return Math.round((1 - tier.yearly_cents / (tier.monthly_cents * 12)) * 100);
}

interface AvailablePlansSectionProps {
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  plans_load_failed?: boolean;
  on_reload_plans?: () => void;
  billing_period: "monthly" | "yearly" | "biennial";
  set_billing_period: (value: "monthly" | "yearly" | "biennial") => void;
  preferred_currency: string;
  handle_currency_change: (currency: string) => void;
  plan_features: Record<string, { label: string; on: boolean }[]>;
  is_action_loading: boolean;
  on_upgrade: (plan: AvailablePlan) => void;
  on_family_plan_change?: (
    plan_code: string,
    interval: "month" | "year",
  ) => void;
  on_tauri_checkout_opened?: () => void;
  current_billing_interval: "month" | "year" | "biennial";
  embedded?: boolean;
}

function EmbeddedPlansWrapper({ children }: { children?: ReactNode }) {
  return <div id="available-plans">{children}</div>;
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
  is_action_loading,
  on_upgrade,
  on_family_plan_change,
  on_tauri_checkout_opened,
  current_billing_interval,
  plan_features,
  embedded = false,
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
  const [crypto_family_term, set_crypto_family_term] = useState(12);

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

  const handle_family_crypto = (term_id?: string) => {
    if (!pending_family_tier || family_loading) return;
    set_crypto_family_term(
      term_id === "monthly" ? 1 : term_id === "biennial" ? 24 : 12,
    );
    set_crypto_family_tier(pending_family_tier);
    set_pending_family_tier(null);
  };

  const card_interval: "month" | "year" =
    billing_period === "monthly" ? "month" : "year";
  const family_features = (tier: FamilyPlanTier) =>
    (tier.max_members === 2
      ? FAMILY_PLAN_DUO_FEATURES
      : FAMILY_PLAN_FAMILY_FEATURES
    ).map((feature) => ({ label: t(feature.label_key), on: feature.on }));
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

  const is_family_view = plan_type === "family";
  const tiers = is_family_view ? FAMILY_PLAN_TIERS : PLAN_TIERS;
  const recommended_code = is_family_view
    ? family_recommended_code
    : individual_recommended_code;
  const current_plan_code = subscription?.plan.code;
  const current_tier_index = tiers.findIndex(
    (tier) => tier.id === current_plan_code,
  );
  const is_yearly = billing_period !== "monthly";

  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  const tier_action = (tier: (typeof tiers)[number], index: number) => {
    const is_same_plan = tier.id === current_plan_code;
    const is_current =
      is_same_plan && current_billing_interval === card_interval;
    const is_interval_switch =
      is_same_plan && current_billing_interval !== card_interval;
    const is_downgrade =
      !is_same_plan && current_tier_index > -1 && index < current_tier_index;
    const label = is_current
      ? t("settings.current_plan")
      : is_interval_switch
        ? card_interval === "year"
          ? t("settings.switch_to_yearly")
          : t("settings.switch_to_monthly")
        : is_downgrade
          ? t("settings.downgrade")
          : t("settings.get_plan", { name: tier.name });

    return { is_current, label };
  };

  const handle_cta = (tier: (typeof tiers)[number]) => {
    if (is_family_view) {
      handle_family_select(tier as FamilyPlanTier);

      return;
    }
    const api_plan = plans.find((plan) => plan.code === tier.id);

    if (api_plan) {
      on_upgrade(api_plan);

      return;
    }
    if (plans_load_failed) {
      show_toast(t("common.something_went_wrong_try_again"), "error");
      on_reload_plans?.();

      return;
    }
    show_toast(
      t("settings.plans_coming_soon"),
      "info",
      TOAST_DURATION_BILLING_MS,
    );
  };

  const plan_type_switch = (
    <div
      aria-label={t("settings.available_plans")}
      className="aster_segmented"
      role="group"
    >
      {(["individual", "family"] as const).map((type) => (
        <button
          key={type}
          aria-pressed={plan_type === type}
          className="aster_segmented_option"
          type="button"
          onClick={() => set_plan_type(type)}
        >
          {type === "individual"
            ? t("settings.plan_type_individual")
            : t("settings.plan_type_family")}
        </button>
      ))}
    </div>
  );

  const max_yearly_save = Math.max(
    0,
    ...tiers.map((tier) => yearly_save_percent(tier)),
  );

  const period_switch = (
    <div
      aria-label={t("settings.billing_term_heading")}
      className="aster_segmented"
      role="group"
    >
      {(["monthly", "yearly"] as const).map((period) => (
        <button
          key={period}
          aria-pressed={period === "yearly" ? is_yearly : !is_yearly}
          className="aster_segmented_option"
          type="button"
          onClick={() => set_billing_period(period)}
        >
          {period === "yearly"
            ? t("settings.billing_yearly")
            : t("settings.billing_monthly")}
          {period === "yearly" && max_yearly_save > 0 && (
            <span
              className="ms-1.5 text-[11.5px] font-semibold"
              style={{
                color: is_yearly ? "inherit" : "var(--color-success)",
              }}
            >
              {t("settings.billing_save_percent", {
                percent: max_yearly_save,
              })}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const Wrapper = embedded ? EmbeddedPlansWrapper : IslandSection;
  const wrapper_props = embedded
    ? {}
    : {
        bare: true,
        icon: <CrownIcon className="flex-shrink-0" />,
        id: "available-plans",
        title: t("settings.available_plans"),
      };

  return (
    <Wrapper {...wrapper_props}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {plan_type_switch}
            {period_switch}
          </div>
          <Select
            value={preferred_currency}
            onValueChange={handle_currency_change}
          >
            <SelectTrigger
              aria-label={t("settings.currency")}
              className="h-9 w-auto flex-shrink-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recommendation.is_paid && current_plan_name && (
          <p className="text-[13px] leading-5 text-txt-secondary">
            {recommendation.is_top_tier
              ? t("settings.plan_top_tier_note", { plan: current_plan_name })
              : recommendation.storage_is_tight && recommended_tier_name
                ? t("settings.plan_storage_tight_note", {
                    percent: Math.round(recommendation.storage_percent),
                    plan: recommended_tier_name,
                  })
                : t("settings.plan_current_note", {
                    percent: Math.round(recommendation.storage_percent),
                  })}{" "}
            <button
              className="font-medium hover:underline"
              style={{ color: "var(--accent-color)" }}
              type="button"
              onClick={scroll_to_storage_addons}
            >
              {t("settings.plan_add_storage_link")}
            </button>
          </p>
        )}

        <div
          className={`grid grid-cols-1 gap-3 ${
            tiers.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          {tiers.map((tier, index) => {
            const action = tier_action(tier, index);
            const is_recommended =
              recommended_code === tier.id && !action.is_current;
            const per_month = is_yearly
              ? Math.round(tier.yearly_cents / 12)
              : tier.monthly_cents;
            const features = (
              is_family_view
                ? family_features(tier as FamilyPlanTier)
                : (plan_features[tier.id] ?? [])
            )
              .filter((feature) => feature.on)
              .slice(0, 5);

            return (
              <div
                key={tier.id}
                className="flex flex-col gap-4 rounded-[var(--aster-radius-control)] p-4"
                data-featured={is_recommended}
                data-plan={tier.name}
                style={{
                  backgroundColor: "var(--aster-field-bg)",
                  boxShadow: is_recommended
                    ? "inset 0 0 0 2px var(--accent-color)"
                    : "none",
                }}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex min-h-[22px] items-center justify-between gap-2">
                    <h5 className="text-[17px] font-semibold leading-6 text-txt-primary">
                      {tier.name}
                    </h5>
                    {(action.is_current || is_recommended) && (
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-4"
                        style={
                          action.is_current
                            ? {
                                color: "var(--text-secondary)",
                                backgroundColor:
                                  "color-mix(in srgb, var(--text-primary) 8%, transparent)",
                              }
                            : {
                                color: "var(--accent-color)",
                                backgroundColor:
                                  "color-mix(in srgb, var(--accent-color) 14%, transparent)",
                              }
                        }
                      >
                        {action.is_current
                          ? t("settings.current_plan")
                          : t("settings.plan_recommended")}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-5 text-txt-muted">
                    {tier_description(tier, t)}
                  </p>
                </div>

                <div>
                  <p className="flex items-baseline gap-1">
                    <span className="text-[26px] font-semibold tabular-nums leading-8 tracking-tight text-txt-primary">
                      {money(per_month)}
                    </span>
                    <span className="text-[13px] text-txt-muted">
                      {t("settings.per_month_short")}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-txt-muted">
                    <span>
                      {is_yearly
                        ? t("settings.billing_billed_yearly_total", {
                            amount: money(tier.yearly_cents),
                          })
                        : t("settings.billing_billed_monthly")}
                    </span>
                    {is_yearly && (
                      <span
                        className="font-medium"
                        style={{ color: "var(--color-success)" }}
                      >
                        {t("settings.billing_save_percent", {
                          percent: yearly_save_percent(tier),
                        })}
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  className="w-full"
                  disabled={
                    action.is_current || is_action_loading || family_loading
                  }
                  size="lg"
                  type="button"
                  variant={
                    is_recommended
                      ? "primary"
                      : action.is_current
                        ? "ghost"
                        : "secondary"
                  }
                  onClick={() => handle_cta(tier)}
                >
                  {action.label}
                </Button>

                {features.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {features.map((feature) => (
                      <li
                        key={feature.label}
                        className="flex items-start gap-2 text-[13px] leading-5 text-txt-secondary"
                      >
                        <CheckIcon
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 flex-shrink-0"
                          style={{ color: "var(--accent-color)" }}
                        />
                        <span>{feature.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-txt-muted">
          <ShieldCheckIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {t("settings.money_back_guarantee")} ·{" "}
            {t("settings.cancel_anytime")}
          </span>
        </p>
      </div>

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
          initial_term_months={crypto_family_term}
          is_open={!!crypto_family_tier}
          monthly_price_cents={crypto_family_tier.monthly_cents}
          on_checkout_opened={on_tauri_checkout_opened}
          on_close={() => {
            const tier = crypto_family_tier;

            set_crypto_family_tier(null);
            set_pending_family_tier(tier);
          }}
          on_finished={() => set_crypto_family_tier(null)}
          plan_code={crypto_family_tier.id}
          plan_name={crypto_family_tier.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_family_tier.yearly_cents}
        />
      )}
    </Wrapper>
  );
}
