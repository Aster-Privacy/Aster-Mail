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
import { useCallback, useEffect, useState } from "react";

import { use_plan_features } from "@/components/settings/billing/use_plan_features";
import { CurrentPlanCard } from "@/components/settings/billing/current_plan_card";
import { AvailablePlansSection } from "@/components/settings/billing/available_plans_section";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { CryptoResumeBanner } from "@/components/settings/billing/crypto_resume_banner";
import { read_billing_interval } from "@/components/settings/billing/cancel_offer";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import { DEFAULT_RECOMMENDED_PLAN } from "@/components/settings/billing/plan_recommendation";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  CURRENCY_STORAGE_KEY,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  get_subscription,
  get_available_plans,
  reactivate_subscription,
  type AvailablePlan,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { use_mail_stats, invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { safe_local_set } from "@/lib/safe_storage";
import { use_i18n } from "@/lib/i18n/context";

function crypto_term_prices_for(plan_code: string) {
  return (
    PLAN_TIERS.find((tier) => tier.id === plan_code) ??
    FAMILY_PLAN_TIERS.find((tier) => tier.id === plan_code)
  );
}

export function OnionBillingSection() {
  const { t } = use_i18n();
  const { stats } = use_mail_stats();
  const plan_features = use_plan_features();

  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(null);
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [plans_load_failed, set_plans_load_failed] = useState(false);
  const [subscription_load_failed, set_subscription_load_failed] =
    useState(false);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [is_action_loading, set_is_action_loading] = useState(false);
  const [billing_period, set_billing_period] = useState<
    "monthly" | "yearly" | "biennial"
  >("monthly");
  const [preferred_currency, set_preferred_currency] = useState(
    detect_currency_from_locale,
  );
  const [crypto_plan, set_crypto_plan] = useState<AvailablePlan | null>(null);

  const load_data = useCallback(async () => {
    const [sub_response, plans_response] = await Promise.all([
      get_subscription(),
      get_available_plans(),
    ]);

    set_subscription_load_failed(!sub_response.data);
    if (sub_response.data) set_subscription(sub_response.data);

    set_plans_load_failed(!plans_response.data);
    if (plans_response.data) set_plans(plans_response.data.plans);

    set_is_initial_load(false);
  }, []);

  useEffect(() => {
    void load_data();
  }, [load_data]);

  const handle_currency_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const new_currency = e.target.value;

    set_preferred_currency(new_currency);
    safe_local_set(CURRENCY_STORAGE_KEY, new_currency);
  };

  const scroll_to_plans = () => {
    const target = document.getElementById("available-plans");

    if (!target) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const show_clearnet_notice = () => {
    show_toast(t("settings.billing_onion_card_notice"), "info");
  };

  const handle_reactivate = async () => {
    set_is_action_loading(true);
    try {
      const response = await reactivate_subscription();

      if (response.data) {
        show_toast(t("settings.subscription_reactivated"), "success");
        request_cache.invalidate("/payments/v1");
        invalidate_mail_stats();
        await load_data();
      } else {
        show_toast(
          server_error_text(response.error, t("settings.failed_reactivate")),
          "error",
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_reactivate"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const open_crypto_checkout = (plan: AvailablePlan) => {
    if (is_action_loading) return;
    if (!crypto_term_prices_for(plan.code)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    set_crypto_plan(plan);
  };

  const handle_crypto_renew = () => {
    if (!subscription) return;
    const matching = plans.find((plan) => plan.code === subscription.plan.code);

    if (!matching) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    open_crypto_checkout(matching);
  };

  const storage_limit_bytes =
    stats.storage_total_bytes ||
    subscription?.storage.total_limit_bytes ||
    1024 * 1024 * 1024;
  const storage_used_bytes = stats.storage_used_bytes;
  const storage_percentage = Math.min(
    100,
    (storage_used_bytes / storage_limit_bytes) * 100,
  );
  const current_billing_interval = read_billing_interval(
    subscription?.plan.billing_period,
  );
  const grace_days_remaining = subscription?.grace_period_end
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.grace_period_end).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;
  const crypto_tier = crypto_plan
    ? crypto_term_prices_for(crypto_plan.code)
    : null;

  if (is_initial_load) {
    return <SettingsSkeleton variant="billing" />;
  }

  if (subscription_load_failed && !subscription) {
    return (
      <LoadFailedNotice
        on_retry={() => {
          set_is_initial_load(true);
          void load_data();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CryptoResumeBanner />

      <p className="text-sm leading-relaxed text-txt-muted">
        {t("settings.billing_onion_card_notice")}
      </p>

      <CurrentPlanCard
        current_billing_interval={current_billing_interval}
        grace_days_remaining={grace_days_remaining}
        has_payment_failed={Boolean(subscription?.payment_failed_at)}
        is_action_loading={is_action_loading}
        is_over_limit={storage_used_bytes > storage_limit_bytes}
        on_manage_billing={show_clearnet_notice}
        on_manage_plan={show_clearnet_notice}
        on_reactivate={handle_reactivate}
        on_renew_with_crypto={handle_crypto_renew}
        on_scroll_to_plans={scroll_to_plans}
        preferred_currency={preferred_currency}
        storage_limit_bytes={storage_limit_bytes}
        storage_percentage={storage_percentage}
        storage_used_bytes={storage_used_bytes}
        subscription={subscription}
        upgrade_features={plan_features[DEFAULT_RECOMMENDED_PLAN]}
      />

      <AvailablePlansSection
        billing_period={billing_period}
        current_billing_interval={current_billing_interval}
        handle_currency_change={handle_currency_change}
        is_action_loading={is_action_loading}
        on_reload_plans={() => {
          void load_data();
        }}
        on_upgrade={open_crypto_checkout}
        plan_features={plan_features}
        plans={plans}
        plans_load_failed={plans_load_failed}
        preferred_currency={preferred_currency}
        set_billing_period={set_billing_period}
        subscription={subscription}
      />

      {crypto_plan && crypto_tier && (
        <CryptoTermModal
          is_open
          initial_term_months={billing_period === "monthly" ? 1 : 12}
          monthly_price_cents={crypto_tier.monthly_cents}
          on_close={() => set_crypto_plan(null)}
          plan_code={crypto_plan.code}
          plan_name={crypto_plan.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_tier.yearly_cents}
        />
      )}
    </div>
  );
}
