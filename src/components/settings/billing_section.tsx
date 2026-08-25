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
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { safe_local_set } from "@/lib/safe_storage";
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
  purchase_storage_addon,
  get_credits,
  get_stripe_config,
  start_hosted_checkout,
  change_plan,
  format_price,
  get_academic_discount_status,
  type SubscriptionResponse,
  type AvailablePlan,
  type BillingHistoryItem,
  type PlanLimitsResponse,
  type StorageAddonItem,
  type UserActiveAddon,
  type CreditBalanceResponse,
  type AcademicDiscountStatusResponse,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { use_mail_stats, invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  CURRENCY_STORAGE_KEY,
  detect_currency_from_locale,
  convert_cents,
  is_crypto_provider,
  take_crypto_resume,
  type CryptoResumeSelection,
} from "@/components/settings/billing/billing_constants";
import { CurrentPlanCard } from "@/components/settings/billing/current_plan_card";
import { CryptoResumeBanner } from "@/components/settings/billing/crypto_resume_banner";
import { AvailablePlansSection } from "@/components/settings/billing/available_plans_section";
import { StorageAddonsSection } from "@/components/settings/billing/storage_addons_section";
import { CreditsSection } from "@/components/settings/billing/credits_section";
import { AcademicDiscountSection } from "@/components/settings/billing/academic_discount_section";
import { BillingHistorySection } from "@/components/settings/billing/billing_history_section";
import { BillingDialogs } from "@/components/settings/billing/billing_dialogs";
import { type CancelReason } from "@/components/settings/billing/cancel_reason_step";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { PlanChangeConfirmModal } from "@/components/settings/billing/plan_change_confirm_modal";
import { CryptoAddonTermModal } from "@/components/settings/billing/crypto_addon_term_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  clear_cancel_password_cache,
  get_cancel_password_hash,
} from "@/components/settings/billing/cancel_password";

export function BillingSection() {
  const { t } = use_i18n();
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
  >("yearly");
  const [, set_plan_limits] = useState<PlanLimitsResponse | null>(null);
  const [show_switch_billing_dialog, set_show_switch_billing_dialog] =
    useState(false);
  const [preferred_currency, set_preferred_currency] = useState(
    detect_currency_from_locale,
  );
  const [cancel_password, set_cancel_password] = useState("");
  const [cancel_password_error, set_cancel_password_error] = useState("");
  const [show_cancel_password, set_show_cancel_password] = useState(false);
  const [cancel_reason, set_cancel_reason] = useState<CancelReason | null>(
    null,
  );
  const [cancel_reason_text, set_cancel_reason_text] = useState("");
  const [show_payment_methods, set_show_payment_methods] = useState(false);
  const [show_manage_plan, set_show_manage_plan] = useState(false);
  const [credit_balance, set_credit_balance] =
    useState<CreditBalanceResponse | null>(null);
  const [academic_status, set_academic_status] =
    useState<AcademicDiscountStatusResponse | null>(null);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [subscription_load_failed, set_subscription_load_failed] =
    useState(false);
  const [show_crypto_modal, set_show_crypto_modal] = useState(false);
  const [crypto_plan, set_crypto_plan] = useState<AvailablePlan | null>(null);
  const [crypto_resume, set_crypto_resume] =
    useState<CryptoResumeSelection | null>(null);

  useEffect(() => {
    if (plans.length === 0) return;

    const resume = take_crypto_resume();

    if (!resume) return;

    const matching = plans.find((plan) => plan.code === resume.plan_code);

    if (!matching) return;

    set_crypto_resume(resume);
    set_crypto_plan(matching);
    set_show_crypto_modal(true);
  }, [plans]);
  const [show_method_modal, set_show_method_modal] = useState(false);
  const [method_modal_plan, set_method_modal_plan] =
    useState<AvailablePlan | null>(null);
  const [show_addon_method_modal, set_show_addon_method_modal] =
    useState(false);
  const [addon_method_target, set_addon_method_target] =
    useState<StorageAddonItem | null>(null);
  const [show_crypto_addon_modal, set_show_crypto_addon_modal] =
    useState(false);
  const [crypto_addon, set_crypto_addon] = useState<StorageAddonItem | null>(
    null,
  );
  const [show_plan_change_confirm, set_show_plan_change_confirm] =
    useState(false);
  const [plan_change_confirm_target, set_plan_change_confirm_target] =
    useState<{ plan: AvailablePlan; interval: string } | null>(null);
  const pending_tauri_checkout_ref = useRef(false);

  const handle_currency_change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const new_currency = e.target.value;

      set_preferred_currency(new_currency);
      safe_local_set(CURRENCY_STORAGE_KEY, new_currency);
    },
    [],
  );

  const refresh_academic_status = useCallback(async () => {
    const res = await get_academic_discount_status();

    if (res.data) set_academic_status(res.data);
  }, []);

  useEffect(() => {
    refresh_academic_status();
  }, [refresh_academic_status]);

  const plan_features: Record<string, { label: string; on: boolean }[]> =
    useMemo(
      () => ({
        star: [
          { label: t("settings.plan_feat_storage_50"), on: true },
          { label: t("settings.plan_feat_aliases_15"), on: true },
          { label: t("settings.plan_feat_domains_5"), on: true },
          { label: t("settings.plan_feat_attachments_50"), on: true },
          { label: t("settings.plan_feat_mail_rules_unlimited"), on: true },
          { label: t("settings.plan_feat_e2ee"), on: true },
          { label: t("settings.plan_feat_zero_knowledge"), on: true },
          { label: t("settings.plan_feat_tracker"), on: true },
          { label: t("settings.plan_feat_advanced_aliases"), on: true },
          { label: t("settings.plan_feat_catch_all"), on: true },
          { label: t("settings.plan_feat_auto_forward"), on: true },
          { label: t("settings.plan_feat_priority_support"), on: true },
          { label: t("settings.plan_feat_imap_smtp"), on: true },
          { label: t("settings.plan_feat_folder_lock"), on: false },
          { label: t("settings.plan_feat_smart_folders"), on: false },
          { label: t("settings.plan_feat_vanguard"), on: false },
          { label: t("settings.lockdown_title"), on: false },
        ],
        nova: [
          { label: t("settings.plan_feat_storage_500"), on: true },
          { label: t("settings.plan_feat_aliases_unlimited"), on: true },
          { label: t("settings.plan_feat_domains_30"), on: true },
          { label: t("settings.plan_feat_attachments_100"), on: true },
          { label: t("settings.plan_feat_mail_rules_unlimited"), on: true },
          { label: t("settings.plan_feat_e2ee"), on: true },
          { label: t("settings.plan_feat_zero_knowledge"), on: true },
          { label: t("settings.plan_feat_tracker"), on: true },
          { label: t("settings.plan_feat_advanced_aliases"), on: true },
          { label: t("settings.plan_feat_catch_all"), on: true },
          { label: t("settings.plan_feat_auto_forward"), on: true },
          { label: t("settings.plan_feat_priority_support"), on: true },
          { label: t("settings.plan_feat_imap_smtp"), on: true },
          { label: t("settings.plan_feat_folder_lock"), on: true },
          { label: t("settings.plan_feat_smart_folders"), on: true },
          { label: t("settings.plan_feat_vanguard"), on: true },
          { label: t("settings.lockdown_title"), on: true },
        ],
        supernova: [
          { label: t("settings.plan_feat_storage_5tb"), on: true },
          { label: t("settings.plan_feat_aliases_unlimited"), on: true },
          { label: t("settings.plan_feat_domains_unlimited"), on: true },
          { label: t("settings.plan_feat_attachments_250"), on: true },
          { label: t("settings.plan_feat_mail_rules_unlimited"), on: true },
          { label: t("settings.plan_feat_e2ee"), on: true },
          { label: t("settings.plan_feat_zero_knowledge"), on: true },
          { label: t("settings.plan_feat_tracker"), on: true },
          { label: t("settings.plan_feat_advanced_aliases"), on: true },
          { label: t("settings.plan_feat_catch_all"), on: true },
          { label: t("settings.plan_feat_auto_forward"), on: true },
          { label: t("settings.plan_feat_priority_support"), on: true },
          { label: t("settings.plan_feat_imap_smtp"), on: true },
          { label: t("settings.plan_feat_folder_lock"), on: true },
          { label: t("settings.plan_feat_smart_folders"), on: true },
          { label: t("settings.plan_feat_vanguard"), on: true },
          { label: t("settings.lockdown_title"), on: true },
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
        set_subscription_load_failed(false);
      } else {
        set_subscription_load_failed(true);
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
      set_subscription_load_failed(true);

      return;
    } finally {
      set_is_initial_load(false);
    }
  }, []);

  useEffect(() => {
    const handle_page_show = (e: PageTransitionEvent) => {
      if (e.persisted) {
        set_is_action_loading(false);
      }
    };

    window.addEventListener("pageshow", handle_page_show);

    return () => window.removeEventListener("pageshow", handle_page_show);
  }, []);

  useEffect(() => {
    const handle_focus = () => {
      if (pending_tauri_checkout_ref.current) {
        pending_tauri_checkout_ref.current = false;
        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        load_data();
      }
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [load_data]);

  useEffect(() => {
    load_data();

    const params = new URLSearchParams(window.location.search);

    if (params.get("crypto") === "success") {
      show_toast(t("settings.crypto_success_toast"), "success");
      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      load_data();
      const url = new URL(window.location.href);

      url.searchParams.delete("crypto");
      window.history.replaceState({}, "", url.toString());
    }
    if (params.get("crypto") === "cancelled") {
      show_toast(t("settings.crypto_cancelled_toast"), "info");
      const url = new URL(window.location.href);

      url.searchParams.delete("crypto");
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

  const crypto_term_prices_for = (plan_code: string) =>
    PLAN_TIERS.find((p) => p.id === plan_code) ??
    FAMILY_PLAN_TIERS.find((p) => p.id === plan_code);

  const handle_crypto_renew = () => {
    if (!subscription) return;
    if (!crypto_term_prices_for(subscription.plan.code)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    const matching = plans.find((p) => p.code === subscription.plan.code);

    set_crypto_plan(
      matching ?? {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
        description: subscription.plan.description,
        storage_limit_bytes: subscription.plan.storage_limit_bytes,
        max_attachment_size_bytes: 0,
        max_email_aliases: 0,
        max_custom_domains: 0,
        price_cents: subscription.plan.price_cents,
        billing_period: subscription.plan.billing_period,
        stripe_price_id: null,
        is_current: true,
      },
    );
    set_show_crypto_modal(true);
  };

  const handle_select_plan = (plan: AvailablePlan) => {
    set_method_modal_plan(plan);
    set_show_method_modal(true);
  };

  const handle_family_plan_change = async (
    plan_code: string,
    interval: "month" | "year",
  ) => {
    const is_tauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (is_tauri) {
      set_is_action_loading(true);
      try {
        const result = await start_hosted_checkout(
          plan_code,
          interval,
          preferred_currency,
          credit_balance?.balance_cents,
        );

        if (!result.ok) {
          show_toast(t("settings.failed_checkout"), "error");
        } else {
          pending_tauri_checkout_ref.current = true;
        }
      } catch {
        show_toast(t("settings.failed_checkout"), "error");
      }
      set_is_action_loading(false);

      return;
    }

    const plan =
      plans.find((p) => p.code === plan_code) ??
      ({
        id: plan_code,
        code: plan_code,
        name: plan_code,
        description: null,
        storage_limit_bytes: 0,
        max_attachment_size_bytes: 0,
        max_email_aliases: 0,
        max_custom_domains: 0,
        price_cents: 0,
        billing_period: interval,
        stripe_price_id: null,
        is_current: false,
      } as AvailablePlan);

    set_plan_change_confirm_target({ plan, interval });
    set_show_plan_change_confirm(true);
  };

  const handle_pay_with_card = async (plan: AvailablePlan) => {
    if (is_action_loading) return;

    const checkout_interval =
      billing_period === "yearly"
        ? "year"
        : billing_period === "biennial"
          ? "biennial"
          : "month";

    const is_tauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    const has_card_sub =
      !!subscription &&
      subscription.plan.code !== "free" &&
      !is_crypto_provider(subscription.payment_provider) &&
      subscription.has_stripe_subscription !== false;

    if (has_card_sub && !is_tauri) {
      set_plan_change_confirm_target({ plan, interval: checkout_interval });
      set_show_plan_change_confirm(true);

      return;
    }

    set_is_action_loading(true);
    try {
      const result = await start_hosted_checkout(
        plan.code,
        checkout_interval,
        preferred_currency,
        credit_balance?.balance_cents,
      );

      if (!result.ok) {
        show_toast(t("settings.failed_checkout"), "error");
        set_is_action_loading(false);
      } else if (is_tauri) {
        pending_tauri_checkout_ref.current = true;
        set_is_action_loading(false);
      }
    } catch {
      show_toast(t("settings.failed_checkout"), "error");
      set_is_action_loading(false);
    }
  };

  const handle_confirm_plan_change = async () => {
    if (!plan_change_confirm_target) return;
    const { plan, interval } = plan_change_confirm_target;

    const is_tauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    set_is_action_loading(true);
    try {
      const result = is_tauri
        ? await change_plan(
            plan.code,
            interval,
            "https://app.astermail.org/?plan_change=success",
            "https://app.astermail.org/?plan_change=cancelled",
          )
        : await change_plan(plan.code, interval);

      if (!result.ok) {
        show_toast(t("settings.payment_failed"), "error");
        set_show_payment_methods(true);

        return;
      }

      if (result.requires_checkout) {
        if (is_tauri) pending_tauri_checkout_ref.current = true;

        return;
      }

      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
      const sub_response = await get_subscription();

      if (sub_response.data) set_subscription(sub_response.data);
      await load_data();
      show_toast(t("settings.payment_success"), "success");
    } catch {
      show_toast(t("settings.payment_failed"), "error");
    } finally {
      set_show_plan_change_confirm(false);
      set_plan_change_confirm_target(null);
      set_is_action_loading(false);
    }
  };

  const handle_pay_with_crypto = (plan: AvailablePlan) => {
    if (!crypto_term_prices_for(plan.code)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    set_crypto_resume(null);
    set_crypto_plan(plan);
    set_show_crypto_modal(true);
  };

  const handle_addon_pay_card = async (addon: StorageAddonItem) => {
    if (is_action_loading) return;

    set_is_action_loading(true);
    try {
      const response = await purchase_storage_addon(
        addon.id,
        credit_balance?.balance_cents,
      );
      const url = response.data?.url;

      if (url) {
        const is_tauri =
          typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

        if (is_tauri) {
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url });
          pending_tauri_checkout_ref.current = true;
          set_is_action_loading(false);
        } else {
          window.location.assign(url);
        }
      } else {
        show_toast(t("settings.addon_purchase_failed"), "error");
        set_is_action_loading(false);
      }
    } catch {
      show_toast(t("settings.addon_purchase_failed"), "error");
      set_is_action_loading(false);
    }
  };

  const handle_addon_pay_crypto = (addon: StorageAddonItem) => {
    set_crypto_addon(addon);
    set_show_crypto_addon_modal(true);
  };

  const handle_cancel = async () => {
    if (!cancel_password.trim()) {
      set_cancel_password_error(t("settings.cancel_password_required"));

      return;
    }
    set_cancel_password_error("");
    set_is_action_loading(true);
    try {
      const password_hash = await get_cancel_password_hash(cancel_password);

      if (!password_hash) {
        set_cancel_password_error(t("settings.cancel_password_error"));
        show_toast(t("settings.cancel_password_error"), "error");

        return;
      }

      const response = await cancel_subscription(
        password_hash,
        cancel_reason ?? undefined,
        cancel_reason_text.trim() || undefined,
      );

      if (response.data) {
        show_toast(t("settings.subscription_cancelled"), "success");
        set_cancel_password("");
        set_show_cancel_password(false);
        set_cancel_reason(null);
        set_cancel_reason_text("");
        set_show_cancel_dialog(false);
        request_cache.invalidate("/payments/v1");
        await load_data();

        return;
      }

      if (response.server_code === "SUBSCRIPTION_NOT_CANCELLABLE") {
        show_toast(t("settings.cancel_not_cancellable"), "error");
        set_cancel_password("");
        set_show_cancel_dialog(false);

        return;
      }

      if (response.code === "UNAUTHORIZED") {
        set_cancel_password_error(t("settings.cancel_password_error"));
        show_toast(t("settings.cancel_password_error"), "error");

        return;
      }

      show_toast(t("settings.cancel_failed"), "error");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.cancel_failed"), "error");
    } finally {
      clear_cancel_password_cache();
      set_is_action_loading(false);
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
    ? format_price(
        convert_cents(current_tier.savings_cents, preferred_currency),
        preferred_currency,
      )
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
    const target = document.getElementById("available-plans");

    if (!target) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
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

  if (subscription_load_failed && !subscription) {
    return (
      <LoadFailedNotice
        on_retry={() => {
          set_is_initial_load(true);
          load_data();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CryptoResumeBanner />

      <CurrentPlanCard
        current_billing_interval={current_billing_interval}
        grace_days_remaining={grace_days_remaining}
        has_payment_failed={has_payment_failed}
        is_action_loading={is_action_loading}
        is_over_limit={is_storage_over_limit}
        on_manage_billing={() => set_show_payment_methods(true)}
        on_manage_plan={() => set_show_manage_plan(true)}
        on_reactivate={handle_reactivate}
        on_renew_with_crypto={handle_crypto_renew}
        on_scroll_to_plans={scroll_to_plans}
        preferred_currency={preferred_currency}
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
        on_family_plan_change={handle_family_plan_change}
        on_tauri_checkout_opened={() => {
          pending_tauri_checkout_ref.current = true;
        }}
        on_upgrade={handle_select_plan}
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
          rel="noopener noreferrer"
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
          set_addon_method_target(addon);
          set_show_addon_method_modal(true);
        }}
        preferred_currency={preferred_currency}
        selected_storage={selected_storage}
        set_selected_storage={set_selected_storage}
      />

      <BillingHistorySection history={history} />

      <CreditsSection
        credit_balance={credit_balance}
        preferred_currency={preferred_currency}
        set_credit_balance={set_credit_balance}
      />

      <AcademicDiscountSection
        academic_status={academic_status}
        refresh_academic_status={refresh_academic_status}
      />

      {crypto_plan &&
        (() => {
          const tier = crypto_term_prices_for(crypto_plan.code);

          if (!tier) return null;

          return (
            <CryptoTermModal
              initial_coin_key={
                crypto_resume
                  ? `${crypto_resume.currency}:${crypto_resume.chain}`
                  : undefined
              }
              initial_invoice_id={crypto_resume?.invoice_id}
              initial_term_months={crypto_resume?.term_months}
              is_open={show_crypto_modal}
              monthly_price_cents={tier.monthly_cents}
              on_checkout_opened={() => {
                pending_tauri_checkout_ref.current = true;
              }}
              on_close={() => {
                set_show_crypto_modal(false);
                set_crypto_plan(null);
                set_crypto_resume(null);
              }}
              plan_code={crypto_plan.code}
              plan_name={crypto_plan.name}
              preferred_currency={preferred_currency}
              yearly_price_cents={tier.yearly_cents}
            />
          );
        })()}

      {method_modal_plan && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          credit_balance_cents={Math.min(
            credit_balance?.balance_cents ?? 0,
            (billing_period === "yearly"
              ? PLAN_TIERS.find((p) => p.id === method_modal_plan.code)
                  ?.yearly_cents
              : billing_period === "biennial"
                ? PLAN_TIERS.find((p) => p.id === method_modal_plan.code)
                    ?.biennial_cents
                : PLAN_TIERS.find((p) => p.id === method_modal_plan.code)
                    ?.monthly_cents) ?? method_modal_plan.price_cents,
          )}
          credits_apply_to_card={
            !(
              !!subscription &&
              subscription.plan.code !== "free" &&
              !is_crypto_provider(subscription.payment_provider) &&
              subscription.has_stripe_subscription !== false &&
              !(
                typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
              )
            )
          }
          on_choose_card={() => {
            const plan = method_modal_plan;

            set_show_method_modal(false);
            set_method_modal_plan(null);
            if (plan) handle_pay_with_card(plan);
          }}
          on_choose_crypto={() => {
            const plan = method_modal_plan;

            set_show_method_modal(false);
            set_method_modal_plan(null);
            if (plan) handle_pay_with_crypto(plan);
          }}
          on_close={() => {
            set_show_method_modal(false);
            set_method_modal_plan(null);
          }}
          open={show_method_modal}
          plan_name={method_modal_plan.name}
        />
      )}

      {addon_method_target && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          credit_balance_cents={Math.min(
            credit_balance?.balance_cents ?? 0,
            addon_method_target.price_cents,
          )}
          on_choose_card={() => {
            const addon = addon_method_target;

            set_show_addon_method_modal(false);
            set_addon_method_target(null);
            if (addon) handle_addon_pay_card(addon);
          }}
          on_choose_crypto={() => {
            const addon = addon_method_target;

            set_show_addon_method_modal(false);
            set_addon_method_target(null);
            if (addon) handle_addon_pay_crypto(addon);
          }}
          on_close={() => {
            set_show_addon_method_modal(false);
            set_addon_method_target(null);
          }}
          open={show_addon_method_modal}
          plan_name={addon_method_target.name}
        />
      )}

      {crypto_addon && (
        <CryptoAddonTermModal
          addon_id={crypto_addon.id}
          addon_name={crypto_addon.name}
          is_open={show_crypto_addon_modal}
          on_checkout_opened={() => {
            pending_tauri_checkout_ref.current = true;
          }}
          on_close={() => {
            set_show_crypto_addon_modal(false);
            set_crypto_addon(null);
          }}
          preferred_currency={preferred_currency}
          price_cents={crypto_addon.price_cents}
        />
      )}

      {plan_change_confirm_target && (
        <PlanChangeConfirmModal
          billing_interval={plan_change_confirm_target.interval}
          is_confirming={is_action_loading}
          on_close={() => {
            set_show_plan_change_confirm(false);
            set_plan_change_confirm_target(null);
          }}
          on_confirm={handle_confirm_plan_change}
          open={show_plan_change_confirm}
          plan_code={plan_change_confirm_target.plan.code}
          plan_name={plan_change_confirm_target.plan.name}
        />
      )}

      <BillingDialogs
        academic_promo_code={academic_status?.promo_code ?? null}
        addon_to_cancel={addon_to_cancel}
        billing_period={billing_period}
        cancel_password={cancel_password}
        cancel_password_error={cancel_password_error}
        cancel_reason={cancel_reason}
        cancel_reason_text={cancel_reason_text}
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
        set_cancel_reason={set_cancel_reason}
        set_cancel_reason_text={set_cancel_reason_text}
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
