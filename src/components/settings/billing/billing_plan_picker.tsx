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
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { checkout_error_text } from "./checkout_error_text";

import { BillingOptionRow } from "@/components/settings/billing/billing_option_row";
import { BillingSegmented } from "@/components/settings/billing/billing_segmented";
import { BILLING_CARD_CLASS } from "@/components/settings/billing/billing_skeleton";
import {
  BillingCompareModal,
  type BillingPlanType,
} from "@/components/settings/billing/billing_compare_modal";
import {
  convert_cents,
  FAMILY_PLAN_TIERS,
  is_crypto_provider,
  PLAN_TIERS,
  type FamilyPlanTier,
} from "@/components/settings/billing/billing_constants";
import {
  compute_plan_recommendation,
  DEFAULT_RECOMMENDED_FAMILY_PLAN,
  DEFAULT_RECOMMENDED_PLAN,
} from "@/components/settings/billing/plan_recommendation";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { create_family_group } from "@/services/api/family";
import {
  format_price,
  type AvailablePlan,
  type SubscriptionResponse,
} from "@/services/api/billing";
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

interface BillingPlanPickerProps {
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  plans_load_failed: boolean;
  on_reload_plans: () => void;
  billing_period: "monthly" | "yearly" | "biennial";
  set_billing_period: (value: "monthly" | "yearly" | "biennial") => void;
  preferred_currency: string;
  is_action_loading: boolean;
  on_upgrade: (plan: AvailablePlan) => void;
  on_family_plan_change: (
    plan_code: string,
    interval: "month" | "year",
  ) => void;
  on_tauri_checkout_opened: () => void;
}

export function BillingPlanPicker({
  subscription,
  plans,
  plans_load_failed,
  on_reload_plans,
  billing_period,
  set_billing_period,
  preferred_currency,
  is_action_loading,
  on_upgrade,
  on_family_plan_change,
  on_tauri_checkout_opened,
}: BillingPlanPickerProps) {
  const { t } = use_i18n();

  use_currency_rates();

  const current_code = subscription?.plan.code ?? null;
  const current_is_family = FAMILY_PLAN_TIERS.some(
    (tier) => tier.id === current_code,
  );
  const recommendation = compute_plan_recommendation({
    current_plan_code: current_code ?? undefined,
    storage_used_bytes: subscription?.storage?.used_bytes,
    storage_limit_bytes: subscription?.storage?.total_limit_bytes,
  });
  const individual_current_index = PLAN_TIERS.findIndex(
    (tier) => tier.id === current_code,
  );
  const family_current_index = FAMILY_PLAN_TIERS.findIndex(
    (tier) => tier.id === current_code,
  );
  const individual_recommended =
    recommendation.recommended_plan_code ??
    (individual_current_index > -1
      ? (PLAN_TIERS[individual_current_index + 1]?.id ?? null)
      : DEFAULT_RECOMMENDED_PLAN);
  const family_recommended =
    recommendation.recommended_family_plan_code ??
    (family_current_index > -1
      ? (FAMILY_PLAN_TIERS[family_current_index + 1]?.id ?? null)
      : DEFAULT_RECOMMENDED_FAMILY_PLAN);

  const [plan_type, set_plan_type] = useState<BillingPlanType>(
    current_is_family ? "family" : "individual",
  );
  const [selected_individual, set_selected_individual] = useState<string>(
    individual_recommended ?? current_code ?? PLAN_TIERS[0].id,
  );
  const [selected_family, set_selected_family] = useState<string>(
    family_recommended ?? current_code ?? FAMILY_PLAN_TIERS[0].id,
  );
  const [show_compare, set_show_compare] = useState(false);
  const [family_loading, set_family_loading] = useState(false);
  const [pending_family_tier, set_pending_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [crypto_family_term, set_crypto_family_term] = useState(12);

  const tiers = plan_type === "family" ? FAMILY_PLAN_TIERS : PLAN_TIERS;
  const selected_code =
    plan_type === "family" ? selected_family : selected_individual;
  const set_selected_code =
    plan_type === "family" ? set_selected_family : set_selected_individual;
  const recommended_code =
    plan_type === "family" ? family_recommended : individual_recommended;
  const selected_tier =
    tiers.find((tier) => tier.id === selected_code) ?? tiers[0];
  const selected_is_current = selected_tier.id === current_code;
  const yearly_percent = Math.round(
    (1 - selected_tier.yearly_cents / (selected_tier.monthly_cents * 12)) * 100,
  );
  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  const choose_individual = (plan_code: string) => {
    const api_plan = plans.find((plan) => plan.code === plan_code);

    if (api_plan) {
      on_upgrade(api_plan);

      return;
    }
    if (plans_load_failed) {
      on_reload_plans();
      show_toast(t("settings.failed_checkout"), "error");

      return;
    }
    show_toast(
      t("settings.plans_coming_soon"),
      "info",
      TOAST_DURATION_BILLING_MS,
    );
  };

  const choose = (plan_code: string, type: BillingPlanType) => {
    if (is_action_loading || family_loading) return;
    if (type === "family") {
      const tier = FAMILY_PLAN_TIERS.find((entry) => entry.id === plan_code);

      if (tier) set_pending_family_tier(tier);

      return;
    }
    choose_individual(plan_code);
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

    if (has_existing_sub) {
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
          on_tauri_checkout_opened();
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

  return (
    <div className="space-y-3" id="available-plans">
      <h3 className="text-base font-semibold text-txt-primary">
        {t("settings.bill_plans")}
      </h3>

      <BillingSegmented
        aria_label={t("settings.bill_plans")}
        on_change={set_plan_type}
        options={[
          { id: "individual", label: t("settings.bill_individual") },
          { id: "family", label: t("settings.bill_family") },
        ]}
        value={plan_type}
      />

      <div
        aria-label={t("settings.bill_plans")}
        className={`${BILLING_CARD_CLASS} p-1`}
        role="radiogroup"
      >
        {tiers.map((tier) => {
          const is_current = tier.id === current_code;
          const is_recommended = !is_current && tier.id === recommended_code;
          const description_key = TIER_DESCRIPTION_KEYS[tier.id];
          const per_month =
            billing_period === "monthly"
              ? tier.monthly_cents
              : Math.round(tier.yearly_cents / 12);

          return (
            <BillingOptionRow
              key={tier.id}
              note={
                is_current
                  ? t("settings.bill_current_plan")
                  : is_recommended
                    ? t("settings.bill_recommended")
                    : undefined
              }
              note_tone={is_current ? "muted" : "accent"}
              on_select={() => set_selected_code(tier.id)}
              selected={tier.id === selected_code}
              subtitle={description_key ? t(description_key) : tier.description}
              title={tier.name}
              trailing_amount={money(per_month)}
              trailing_unit={t("settings.per_month_short")}
            />
          );
        })}
      </div>

      <div
        aria-label={t("settings.current_billing_interval")}
        className={`${BILLING_CARD_CLASS} p-1`}
        role="radiogroup"
      >
        <BillingOptionRow
          note={
            yearly_percent > 0
              ? t("settings.bill_save_percent", { percent: yearly_percent })
              : undefined
          }
          note_tone="success"
          on_select={() => set_billing_period("yearly")}
          selected={billing_period !== "monthly"}
          subtitle={t("settings.bill_billed_yearly", {
            total: money(selected_tier.yearly_cents),
          })}
          title={t("settings.bill_pay_yearly")}
        />
        <BillingOptionRow
          on_select={() => set_billing_period("monthly")}
          selected={billing_period === "monthly"}
          subtitle={t("settings.bill_billed_monthly")}
          title={t("settings.bill_pay_monthly")}
        />
      </div>

      <Button
        className="w-full"
        disabled={selected_is_current || is_action_loading || family_loading}
        size="md"
        variant="depth"
        onClick={() => choose(selected_tier.id, plan_type)}
      >
        {selected_is_current
          ? t("settings.bill_current_plan")
          : t("settings.get_plan", { name: selected_tier.name })}
      </Button>

      <button
        className="flex w-full items-center justify-center gap-0.5 py-1 text-sm font-semibold hover:underline"
        style={{ color: "var(--accent-blue)" }}
        type="button"
        onClick={() => set_show_compare(true)}
      >
        {t("settings.bill_compare_plans")}
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      <BillingCompareModal
        billing_period={billing_period}
        current_plan_code={current_code}
        initial_plan_code={selected_code}
        on_choose={(plan_code, type) => {
          set_show_compare(false);
          if (type === "family") set_selected_family(plan_code);
          else set_selected_individual(plan_code);
          choose(plan_code, type);
        }}
        on_close={() => set_show_compare(false)}
        on_plan_type_change={set_plan_type}
        open={show_compare}
        plan_type={plan_type}
        preferred_currency={preferred_currency}
      />

      {pending_family_tier && (
        <PlanPaymentMethodModal
          busy={family_loading}
          on_choose_card={handle_family_card}
          on_choose_crypto={handle_family_crypto}
          on_close={() => {
            if (family_loading) return;
            set_pending_family_tier(null);
          }}
          on_select_term={(id) =>
            set_billing_period(
              id === "monthly"
                ? "monthly"
                : id === "biennial"
                  ? "biennial"
                  : "yearly",
            )
          }
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
          on_close={() => set_crypto_family_tier(null)}
          plan_code={crypto_family_tier.id}
          plan_name={crypto_family_tier.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_family_tier.yearly_cents}
        />
      )}
    </div>
  );
}
