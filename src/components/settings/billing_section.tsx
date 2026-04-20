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
import { useEffect, useState, useCallback, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";

import {
  get_subscription,
  get_available_plans,
  get_billing_history,
  cancel_subscription,
  reactivate_subscription,
  switch_billing_interval,
  get_plan_limits,
  get_storage_addons,
  get_credits,
  get_stripe_config,
  format_price,
  type SubscriptionResponse,
  type AvailablePlan,
  type BillingHistoryItem,
  type PlanLimitsResponse,
  type StorageAddonItem,
  type UserActiveAddon,
  type CreditBalanceResponse,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { use_mail_stats, invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  PLAN_TIERS,
  CURRENCY_STORAGE_KEY,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { CurrentPlanCard } from "@/components/settings/billing/current_plan_card";
import { AvailablePlansSection } from "@/components/settings/billing/available_plans_section";
import { StorageAddonsSection } from "@/components/settings/billing/storage_addons_section";
import { CreditsSection } from "@/components/settings/billing/credits_section";
import { BillingHistorySection } from "@/components/settings/billing/billing_history_section";
import { BillingDialogs } from "@/components/settings/billing/billing_dialogs";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { use_auth } from "@/contexts/auth_context";
import { get_user_salt } from "@/services/api/auth";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

export function BillingSection() {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { stats } = use_mail_stats();
  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(null);
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [history, set_history] = useState<BillingHistoryItem[]>([]);
  const [is_action_loading, set_is_action_loading] = useState(false);
  const [show_cancel_dialog, set_show_cancel_dialog] = useState(false);
  const [show_checkout_modal, set_show_checkout_modal] = useState(false);
  const [selected_plan, set_selected_plan] = useState<AvailablePlan | null>(
    null,
  );
  const [selected_storage, set_selected_storage] = useState<string | null>(
    null,
  );
  const [available_addons, set_available_addons] = useState<StorageAddonItem[]>(
    [],
  );
  const [active_addons, set_active_addons] = useState<UserActiveAddon[]>([]);
  const [show_cancel_addon_dialog, set_show_cancel_addon_dialog] =
    useState(false);
  const [addon_to_cancel, set_addon_to_cancel] =
    useState<UserActiveAddon | null>(null);
  const [show_addon_checkout, set_show_addon_checkout] = useState(false);
  const [checkout_addon, set_checkout_addon] =
    useState<StorageAddonItem | null>(null);
  const [billing_period, set_billing_period] = useState<
    "monthly" | "yearly" | "biennial"
  >("monthly");
  const [, set_plan_limits] = useState<PlanLimitsResponse | null>(null);
  const [show_switch_billing_dialog, set_show_switch_billing_dialog] =
    useState(false);
  const [preferred_currency, set_preferred_currency] = useState(
    detect_currency_from_locale,
  );
  const [cancel_password, set_cancel_password] = useState("");
  const [cancel_password_error, set_cancel_password_error] = useState("");
  const [show_cancel_password, set_show_cancel_password] = useState(false);
  const [show_payment_methods, set_show_payment_methods] = useState(false);
  const [show_manage_plan, set_show_manage_plan] = useState(false);
  const [credit_balance, set_credit_balance] =
    useState<CreditBalanceResponse | null>(null);
  const [is_initial_load, set_is_initial_load] = useState(true);

  const handle_currency_change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const new_currency = e.target.value;

      set_preferred_currency(new_currency);
      localStorage.setItem(CURRENCY_STORAGE_KEY, new_currency);
    },
    [],
  );

  const plan_features: Record<string, string[]> = useMemo(
    () => ({
      star: [
        t("settings.plan_f_storage", { value: "15 GB" }),
        t("settings.plan_f_attachments", { value: "50 MB" }),
        t("settings.plan_f_aliases", { value: "15" }),
        t("settings.plan_f_domains", { value: "5" }),
        t("settings.plan_f_send_limit", { value: t("settings.unlimited") }),
        t("settings.plan_f_templates", { value: "10" }),
        t("settings.plan_f_vacation_reply"),
        t("settings.plan_f_catch_all"),
        t("settings.plan_f_auto_forwarding"),
        t("settings.plan_f_quiet_hours"),
        t("settings.plan_f_alias_avatars"),
        t("settings.plan_f_support_priority"),
      ],
      nova: [
        t("settings.plan_f_storage", { value: "500 GB" }),
        t("settings.plan_f_attachments", { value: "100 MB" }),
        t("settings.plan_f_aliases", { value: t("settings.unlimited") }),
        t("settings.plan_f_domains", { value: "30" }),
        t("settings.plan_f_send_limit", { value: t("settings.unlimited") }),
        t("settings.plan_f_templates", { value: t("settings.unlimited") }),
        t("settings.plan_f_signatures", { value: t("settings.unlimited") }),
        t("settings.plan_f_carddav_import"),
        t("settings.plan_f_contact_merge"),
        t("settings.plan_f_encrypted_export"),
        t("settings.plan_f_password_folders"),
        t("settings.plan_f_custom_key_rotation"),
      ],
      supernova: [
        t("settings.plan_f_storage", { value: "5 TB" }),
        t("settings.plan_f_attachments", { value: "250 MB" }),
        t("settings.plan_f_aliases", {
          value: t("settings.unlimited"),
        }),
        t("settings.plan_f_domains", {
          value: t("settings.unlimited"),
        }),
        t("settings.plan_f_send_limit", {
          value: t("settings.unlimited"),
        }),
        t("settings.plan_f_receipt_tracking"),
        t("settings.plan_f_support_dedicated"),
        t("settings.plan_f_early_access"),
      ],
    }),
    [t],
  );

  const storage_limit_bytes =
    stats.storage_total_bytes ||
    subscription?.storage.total_limit_bytes ||
    1024 * 1024 * 1024;
  const storage_used_bytes = stats.storage_used_bytes;
  const storage_percentage = Math.min(
    100,
    (storage_used_bytes / storage_limit_bytes) * 100,
  );
  const is_storage_over_limit = storage_used_bytes > storage_limit_bytes;

  const load_data = useCallback(async () => {
    try {
      get_stripe_config().then((r) => {
        if (r.data?.publishable_key && r.data.is_enabled) {
          loadStripe(r.data.publishable_key);
        }
      });

      const [
        sub_response,
        plans_response,
        history_response,
        limits_response,
        addons_response,
        credits_response,
      ] = await Promise.all([
        get_subscription(),
        get_available_plans(),
        get_billing_history(1, 10),
        get_plan_limits(),
        get_storage_addons(),
        get_credits(),
      ]);

      if (sub_response.data) {
        set_subscription(sub_response.data);
      }
      if (plans_response.data) {
        set_plans(plans_response.data.plans);
      }
      if (history_response.data) {
        set_history(history_response.data.items);
      }
      if (limits_response.data) {
        set_plan_limits(limits_response.data);
      }
      if (addons_response.data) {
        set_available_addons(addons_response.data.available_addons);
        set_active_addons(addons_response.data.active_addons);
      }
      if (credits_response.data) {
        set_credit_balance(credits_response.data);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    } finally {
      set_is_initial_load(false);
    }
  }, []);

  useEffect(() => {
    load_data();

    const params = new URLSearchParams(window.location.search);

    if (params.get("billing") === "success") {
      show_toast(t("settings.checkout_welcome"), "success");
      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      load_data();
      const url = new URL(window.location.href);

      url.searchParams.delete("billing");
      window.history.replaceState({}, "", url.toString());
    }
    if (params.get("addon_purchase") === "success") {
      show_toast(t("settings.addon_purchased"), "success");
      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      load_data();
      const url = new URL(window.location.href);

      url.searchParams.delete("addon_purchase");
      window.history.replaceState({}, "", url.toString());
    }
  }, [load_data, t]);

  const handle_upgrade = (plan: AvailablePlan) => {
    set_selected_plan(plan);
    set_show_checkout_modal(true);
  };

  const handle_downgrade = async () => {
    set_is_action_loading(true);
    try {
      const response = await switch_billing_interval(target_billing_interval);

      if (response.data) {
        show_toast(t("settings.downgrade_scheduled"), "success");
        request_cache.invalidate("/payments/v1");
        await load_data();
      } else {
        show_toast(t("settings.failed_switch_billing"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_switch_billing"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const handle_cancel = async () => {
    if (!cancel_password.trim()) {
      set_cancel_password_error(t("settings.cancel_password_required"));

      return;
    }
    if (!user?.email) {
      set_cancel_password_error(t("settings.cancel_password_error"));

      return;
    }
    set_cancel_password_error("");
    set_is_action_loading(true);
    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_cancel_password_error(t("settings.cancel_password_error"));

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        cancel_password,
        salt,
      );

      const response = await cancel_subscription(password_hash);

      if (response.data) {
        show_toast(t("settings.subscription_cancelled"), "success");
        set_cancel_password("");
        set_show_cancel_password(false);
        request_cache.invalidate("/payments/v1");
        await load_data();
      } else {
        set_cancel_password_error(t("settings.cancel_password_error"));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_cancel_password_error(t("settings.cancel_password_error"));
    } finally {
      set_is_action_loading(false);
      set_show_cancel_dialog(false);
    }
  };

  const handle_reactivate = async () => {
    set_is_action_loading(true);
    try {
      const response = await reactivate_subscription();

      if (response.data) {
        show_toast(t("settings.subscription_reactivated"), "success");
        request_cache.invalidate("/payments/v1");
        await load_data();
      } else {
        show_toast(t("settings.failed_reactivate"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_reactivate"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const current_billing_interval =
    subscription?.plan.billing_period?.startsWith("year") ? "year" : "month";
  const target_billing_interval =
    current_billing_interval === "year" ? "month" : "year";

  const current_tier = PLAN_TIERS.find(
    (tier) => tier.id === subscription?.plan.code,
  );
  const yearly_savings = current_tier
    ? format_price(current_tier.savings_cents)
    : null;

  const handle_switch_billing = async () => {
    set_is_action_loading(true);
    try {
      const response = await switch_billing_interval(target_billing_interval);

      if (response.data) {
        show_toast(t("settings.billing_switched"), "success");
        request_cache.invalidate("/payments/v1");
        await load_data();
      } else {
        show_toast(t("settings.failed_switch_billing"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_switch_billing"), "error");
    } finally {
      set_is_action_loading(false);
      set_show_switch_billing_dialog(false);
    }
  };

  const scroll_to_plans = () => {
    document
      .getElementById("available-plans")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const has_payment_failed = Boolean(subscription?.payment_failed_at);
  const grace_days_remaining = subscription?.grace_period_end
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.grace_period_end).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  if (is_initial_load) {
    return <SettingsSkeleton variant="billing" />;
  }

  return (
    <div className="space-y-6">
      <CurrentPlanCard
        current_billing_interval={current_billing_interval}
        grace_days_remaining={grace_days_remaining}
        has_payment_failed={has_payment_failed}
        is_action_loading={is_action_loading}
        is_over_limit={is_storage_over_limit}
        on_manage_billing={() => set_show_payment_methods(true)}
        on_manage_plan={() => set_show_manage_plan(true)}
        on_reactivate={handle_reactivate}
        on_scroll_to_plans={scroll_to_plans}
        storage_limit_bytes={storage_limit_bytes}
        storage_percentage={storage_percentage}
        storage_used_bytes={storage_used_bytes}
        subscription={subscription}
      />

      <AvailablePlansSection
        billing_period={billing_period}
        current_billing_interval={current_billing_interval}
        handle_currency_change={handle_currency_change}
        is_action_loading={is_action_loading}
        on_downgrade={handle_downgrade}
        on_upgrade={handle_upgrade}
        plan_features={plan_features}
        plans={plans}
        preferred_currency={preferred_currency}
        set_billing_period={set_billing_period}
        subscription={subscription}
      />

      <div className="flex justify-center mt-2 mb-4">
        <a
          className="text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors underline-offset-4 hover:underline"
          href="https://astermail.org/pricing#features"
          rel="noreferrer"
          target="_blank"
        >
          {t("settings.view_all_features")}
        </a>
      </div>

      <StorageAddonsSection
        active_addons={active_addons}
        available_addons={available_addons}
        is_action_loading={is_action_loading}
        on_cancel_addon={(addon) => {
          set_addon_to_cancel(addon);
          set_show_cancel_addon_dialog(true);
        }}
        on_purchase_addon={(addon) => {
          set_checkout_addon(addon);
          set_show_addon_checkout(true);
        }}
        selected_storage={selected_storage}
        set_selected_storage={set_selected_storage}
      />

      <BillingHistorySection history={history} />

      <CreditsSection
        credit_balance={credit_balance}
        set_credit_balance={set_credit_balance}
      />

      <BillingDialogs
        addon_to_cancel={addon_to_cancel}
        billing_period={billing_period}
        cancel_password={cancel_password}
        cancel_password_error={cancel_password_error}
        checkout_addon={checkout_addon}
        handle_cancel={handle_cancel}
        handle_switch_billing={handle_switch_billing}
        is_action_loading={is_action_loading}
        load_data={load_data}
        preferred_currency={preferred_currency}
        selected_plan={selected_plan}
        set_addon_to_cancel={set_addon_to_cancel}
        set_cancel_password={set_cancel_password}
        set_cancel_password_error={set_cancel_password_error}
        set_checkout_addon={set_checkout_addon}
        set_is_action_loading={set_is_action_loading}
        set_selected_plan={set_selected_plan}
        set_show_addon_checkout={set_show_addon_checkout}
        set_show_cancel_addon_dialog={set_show_cancel_addon_dialog}
        set_show_cancel_dialog={set_show_cancel_dialog}
        set_show_cancel_password={set_show_cancel_password}
        set_show_checkout_modal={set_show_checkout_modal}
        set_show_manage_plan={set_show_manage_plan}
        set_show_payment_methods={set_show_payment_methods}
        set_show_switch_billing_dialog={set_show_switch_billing_dialog}
        set_subscription={set_subscription}
        show_addon_checkout={show_addon_checkout}
        show_cancel_addon_dialog={show_cancel_addon_dialog}
        show_cancel_dialog={show_cancel_dialog}
        show_cancel_password={show_cancel_password}
        show_checkout_modal={show_checkout_modal}
        show_manage_plan={show_manage_plan}
        show_payment_methods={show_payment_methods}
        show_switch_billing_dialog={show_switch_billing_dialog}
        subscription={subscription}
        target_billing_interval={target_billing_interval}
        yearly_savings={yearly_savings}
      />
    </div>
  );
}
