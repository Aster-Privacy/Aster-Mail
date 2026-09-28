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
import { useEffect, useRef, useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js/pure";
import {
  ChatBubbleLeftRightIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import {
  Island,
  IslandDivider,
  IslandSection,
  IslandSections,
} from "@aster/ui";

import { checkout_error_text } from "./billing/checkout_error_text";

import { read_billing_interval } from "@/components/settings/billing/cancel_offer";
import {
  consume_payment_method_request,
  OPEN_PAYMENT_METHODS_EVENT,
} from "@/lib/payment_action";
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
  record_yearly_switch_click,
  read_checkout_target,
  clear_checkout_target,
  consume_addon_resume,
  consume_checkout_resume,
  BILLING_RESUME_EVENT,
  remember_addon_target,
  read_addon_target,
  clear_addon_target,
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
import { use_special_offer_checkout } from "@/hooks/use_special_offer_checkout";
import { special_offer_promo_code } from "@/lib/special_offer";
import { refresh_special_offer_status } from "@/stores/special_offer_status";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { addon_return_url } from "@/lib/addon_return_url";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { safe_local_set } from "@/lib/safe_storage";
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
import { DEFAULT_RECOMMENDED_PLAN } from "@/components/settings/billing/plan_recommendation";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import { BillingHeroCard } from "@/components/settings/billing/billing_hero_card";
import {
  read_billing_cache,
  write_billing_cache,
} from "@/components/settings/billing/billing_cache";
import { SpecialOfferBillingCard } from "@/components/settings/billing/special_offer_billing_card";
import { BillingAdvantagesCard } from "@/components/settings/billing/billing_advantages_card";
import { BillingNoticeStack } from "@/components/settings/billing/billing_notice_stack";
import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import { AvailablePlansSection } from "@/components/settings/billing/available_plans_section";
import { PlanComparisonSection } from "@/components/settings/billing/plan_comparison_section";
import { StorageAddonsSection } from "@/components/settings/billing/storage_addons_section";
import { CreditsSection } from "@/components/settings/billing/credits_section";
import { AcademicDiscountSection } from "@/components/settings/billing/academic_discount_section";
import { BillingHistorySection } from "@/components/settings/billing/billing_history_section";
import {
  BillingMoreRow,
  billing_row_icon,
} from "@/components/settings/billing/billing_more_section";
import { open_settings_target } from "@/lib/settings_links";
import { BillingDialogs } from "@/components/settings/billing/billing_dialogs";
import { type CancelReason } from "@/components/settings/billing/cancel_reason_step";
import {
  PlanPaymentMethodModal,
  type plan_choice_option,
  type plan_term_option,
} from "@/components/settings/billing/plan_payment_method_modal";
import { PlanChangeConfirmModal } from "@/components/settings/billing/plan_change_confirm_modal";
import { is_promo_code_rejection } from "@/components/settings/billing/plan_change_discount_text";
import { CryptoAddonTermModal } from "@/components/settings/billing/crypto_addon_term_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import {
  SKELETON_MIN_VISIBLE_MS,
  use_delayed_flag,
} from "@/hooks/use_delayed_flag";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  clear_cancel_password_cache,
  get_cancel_password_hash,
} from "@/components/settings/billing/cancel_password";
import { use_plan_features } from "@/components/settings/billing/use_plan_features";

interface BillingCache {
  user_id: string | null;
  subscription: SubscriptionResponse | null;
  plans: AvailablePlan[];
  history: BillingHistoryItem[];
  plan_limits: PlanLimitsResponse | null;
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  addon_promo: {
    eligible: boolean;
    percent_off: number;
    duration_months: number;
  };
  credit_balance: CreditBalanceResponse | null;
}

const FREE_ADVANTAGES_PLAN = "star";

let billing_cache: BillingCache | null = null;

export function invalidate_billing_cache() {
  billing_cache = null;
}

function request_billing_bundle() {
  return Promise.all([
    get_subscription(),
    get_available_plans(),
    get_billing_history(1, 10),
    get_plan_limits(),
    get_storage_addons(),
    get_credits(),
  ]);
}

type BillingBundle = Awaited<ReturnType<typeof request_billing_bundle>>;

let pending_billing_request: Promise<BillingBundle> | null = null;

function take_billing_request(): Promise<BillingBundle> {
  const pending = pending_billing_request;

  pending_billing_request = null;

  return pending ?? request_billing_bundle();
}

function store_billing_cache(user_id: string | null, bundle: BillingBundle) {
  const [
    sub_response,
    plans_response,
    history_response,
    limits_response,
    addons_response,
    credits_response,
  ] = bundle;
  const percent_off = addons_response.data?.promo_percent_off ?? 0;
  const duration_months = addons_response.data?.promo_duration_months ?? 0;

  billing_cache = {
    user_id,
    subscription: sub_response.data ?? billing_cache?.subscription ?? null,
    plans: plans_response.data?.plans ?? billing_cache?.plans ?? [],
    history: history_response.data?.items ?? billing_cache?.history ?? [],
    plan_limits: limits_response.data ?? billing_cache?.plan_limits ?? null,
    available_addons:
      addons_response.data?.available_addons ??
      billing_cache?.available_addons ??
      [],
    active_addons:
      addons_response.data?.active_addons ?? billing_cache?.active_addons ?? [],
    addon_promo: addons_response.data
      ? {
          eligible:
            addons_response.data.promo_eligible === true &&
            percent_off > 0 &&
            duration_months > 0,
          percent_off,
          duration_months,
        }
      : (billing_cache?.addon_promo ?? {
          eligible: false,
          percent_off: 0,
          duration_months: 0,
        }),
    credit_balance:
      credits_response.data ?? billing_cache?.credit_balance ?? null,
  };
}

export function prefetch_billing_data(user_id: string | null) {
  if (!user_id || pending_billing_request) return;
  if (billing_cache && billing_cache.user_id === user_id) return;

  const request = request_billing_bundle();

  pending_billing_request = request;
  request
    .then((bundle) => {
      if (pending_billing_request === request) {
        pending_billing_request = null;
      }
      if (bundle[0].data) store_billing_cache(user_id, bundle);
    })
    .catch(() => {
      if (pending_billing_request === request) {
        pending_billing_request = null;
      }
    });
}

export function BillingSection() {
  const { t } = use_i18n();
  const { stats } = use_mail_stats();
  const { user } = use_auth();
  const user_id = user?.id ?? null;
  const user_id_ref = useRef(user_id);

  user_id_ref.current = user_id;
  const [cached] = useState(() =>
    billing_cache && billing_cache.user_id === user_id
      ? billing_cache
      : read_billing_cache(user_id),
  );
  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(() => cached?.subscription ?? null);
  const offer_checkout = use_special_offer_checkout(subscription?.plan.code);
  const [plans, set_plans] = useState<AvailablePlan[]>(
    () => cached?.plans ?? [],
  );
  const [history, set_history] = useState<BillingHistoryItem[]>(
    () => cached?.history ?? [],
  );
  const [history_load_failed, set_history_load_failed] = useState(false);
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
    () => cached?.available_addons ?? [],
  );
  const [active_addons, set_active_addons] = useState<UserActiveAddon[]>(
    () => cached?.active_addons ?? [],
  );
  const [addon_promo, set_addon_promo] = useState(
    () =>
      cached?.addon_promo ?? {
        eligible: false,
        percent_off: 0,
        duration_months: 0,
      },
  );
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
  const [plan_limits, set_plan_limits] = useState<PlanLimitsResponse | null>(
    () => cached?.plan_limits ?? null,
  );
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
  const [auto_add_card, set_auto_add_card] = useState(false);
  const [show_plans, set_show_plans] = useState(false);
  const [credit_balance, set_credit_balance] =
    useState<CreditBalanceResponse | null>(
      () => cached?.credit_balance ?? null,
    );
  const [academic_status, set_academic_status] =
    useState<AcademicDiscountStatusResponse | null>(null);
  const [is_initial_load, set_is_initial_load] = useState(
    () => cached === null,
  );
  const skeleton_visible = use_delayed_flag(
    is_initial_load,
    0,
    SKELETON_MIN_VISIBLE_MS,
  );
  const [plans_load_failed, set_plans_load_failed] = useState(false);
  const [stripe_load_failed, set_stripe_load_failed] = useState(false);
  const [subscription_load_failed, set_subscription_load_failed] =
    useState(false);
  const [show_crypto_modal, set_show_crypto_modal] = useState(false);
  const [crypto_plan, set_crypto_plan] = useState<AvailablePlan | null>(null);
  const [crypto_resume, set_crypto_resume] =
    useState<CryptoResumeSelection | null>(null);
  const [resume_tick, set_resume_tick] = useState(0);
  const [pending_addon_resume, set_pending_addon_resume] = useState<
    string | null
  >(null);
  const [plan_method_target, set_plan_method_target] =
    useState<AvailablePlan | null>(null);
  const [crypto_back_plan, set_crypto_back_plan] =
    useState<AvailablePlan | null>(null);
  const [crypto_back_addon, set_crypto_back_addon] =
    useState<StorageAddonItem | null>(null);

  useEffect(() => {
    const open_payment_methods = () => {
      set_auto_add_card(true);
      set_show_payment_methods(true);
    };

    if (consume_payment_method_request()) open_payment_methods();

    const handle_request = () => {
      consume_payment_method_request();
      open_payment_methods();
    };

    window.addEventListener(OPEN_PAYMENT_METHODS_EVENT, handle_request);

    return () => {
      window.removeEventListener(OPEN_PAYMENT_METHODS_EVENT, handle_request);
    };
  }, []);

  useEffect(() => {
    if (!show_payment_methods) set_auto_add_card(false);
  }, [show_payment_methods]);

  useEffect(() => {
    const handle_resume = () => set_resume_tick((tick) => tick + 1);

    window.addEventListener(BILLING_RESUME_EVENT, handle_resume);

    return () =>
      window.removeEventListener(BILLING_RESUME_EVENT, handle_resume);
  }, []);

  useEffect(() => {
    if (plans.length === 0) return;
    if (!consume_checkout_resume()) return;

    const target = read_checkout_target();

    clear_checkout_target();
    if (!target) return;

    const plan = plans.find((entry) => entry.code === target.plan_code);

    if (!plan) return;

    set_billing_period(
      target.billing_interval === "month"
        ? "monthly"
        : target.billing_interval === "biennial"
          ? "biennial"
          : "yearly",
    );
    set_plan_method_target(plan);
  }, [plans, resume_tick]);

  useEffect(() => {
    if (!window.location.pathname.endsWith("/settings/credits")) return;

    let frame = 0;

    const attempt = (tries: number) => {
      const target = document.getElementById("credits_section");

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });

        return;
      }

      if (tries > 0) frame = requestAnimationFrame(() => attempt(tries - 1));
    };

    frame = requestAnimationFrame(() => attempt(30));

    return () => cancelAnimationFrame(frame);
  }, []);

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
  const [crypto_initial_term, set_crypto_initial_term] = useState<
    number | undefined
  >(undefined);
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
  const plan_before_checkout_ref = useRef<string | null>(null);

  const handle_currency_change = useCallback((new_currency: string) => {
    set_preferred_currency(new_currency);
    safe_local_set(CURRENCY_STORAGE_KEY, new_currency);
  }, []);

  const refresh_academic_status = useCallback(async () => {
    const res = await get_academic_discount_status();

    if (res.data) set_academic_status(res.data);
  }, []);

  useEffect(() => {
    refresh_academic_status();
  }, [refresh_academic_status]);

  const plan_features = use_plan_features();

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
      set_stripe_load_failed(false);
      get_stripe_config()
        .then((r) => {
          if (r.data?.publishable_key && r.data.is_enabled) {
            return loadStripe(r.data.publishable_key);
          }

          return null;
        })
        .catch(() => set_stripe_load_failed(true));

      const responses = await take_billing_request();
      const [
        sub_response,
        plans_response,
        history_response,
        limits_response,
        addons_response,
        credits_response,
      ] = responses;

      const snapshot = read_billing_cache(user_id_ref.current);
      const next = {
        subscription: snapshot?.subscription ?? null,
        plans: snapshot?.plans ?? [],
        history: snapshot?.history ?? [],
        plan_limits: snapshot?.plan_limits ?? null,
        available_addons: snapshot?.available_addons ?? [],
        active_addons: snapshot?.active_addons ?? [],
        addon_promo: snapshot?.addon_promo ?? {
          eligible: false,
          percent_off: 0,
          duration_months: 0,
        },
        credit_balance: snapshot?.credit_balance ?? null,
      };

      if (sub_response.data) {
        next.subscription = sub_response.data;
        set_subscription(sub_response.data);
        set_subscription_load_failed(false);
      } else {
        set_subscription_load_failed(true);
      }
      if (plans_response.data) {
        next.plans = plans_response.data.plans;
        set_plans(plans_response.data.plans);
        set_plans_load_failed(false);
      } else {
        set_plans_load_failed(true);
      }
      if (history_response.data) {
        next.history = history_response.data.items;
        set_history(history_response.data.items);
        set_history_load_failed(false);
      } else {
        set_history_load_failed(true);
      }
      if (limits_response.data) {
        next.plan_limits = limits_response.data;
        set_plan_limits(limits_response.data);
      }
      if (addons_response.data) {
        next.available_addons = addons_response.data.available_addons;
        next.active_addons = addons_response.data.active_addons;
        set_available_addons(addons_response.data.available_addons);
        set_active_addons(addons_response.data.active_addons);

        const percent_off = addons_response.data.promo_percent_off ?? 0;
        const duration_months = addons_response.data.promo_duration_months ?? 0;

        next.addon_promo = {
          eligible:
            addons_response.data.promo_eligible === true &&
            percent_off > 0 &&
            duration_months > 0,
          percent_off,
          duration_months,
        };
        set_addon_promo(next.addon_promo);
      }
      if (credits_response.data) {
        next.credit_balance = credits_response.data;
        set_credit_balance(credits_response.data);
      }
      write_billing_cache(user_id_ref.current, next);
      store_billing_cache(user_id, responses);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_subscription_load_failed(true);
      set_plans_load_failed(true);

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
      if (!pending_tauri_checkout_ref.current) return;

      pending_tauri_checkout_ref.current = false;

      const before = plan_before_checkout_ref.current;

      plan_before_checkout_ref.current = null;

      void (async () => {
        for (let attempt = 0; attempt < 6; attempt++) {
          request_cache.invalidate("/payments/v1");

          const response = await get_subscription();
          const live = response.data?.plan.code;

          if (live && live !== before) break;

          await new Promise((resolve) =>
            setTimeout(resolve, attempt === 0 ? 800 : 1500),
          );
        }

        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        load_data();
      })();
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
      show_toast(
        t("settings.crypto_cancelled_toast"),
        "info",
        TOAST_DURATION_BILLING_MS,
      );
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
    }
    if (params.get("addon_purchase")) {
      const url = new URL(window.location.href);

      url.searchParams.delete("addon_purchase");
      window.history.replaceState({}, "", url.toString());
    }
  }, [load_data, t]);

  useEffect(() => {
    if (!consume_addon_resume()) return;

    set_pending_addon_resume(read_addon_target());
    clear_addon_target();
  }, [resume_tick]);

  useEffect(() => {
    if (!pending_addon_resume) return;
    if (available_addons.length === 0) return;

    const addon = available_addons.find(
      (entry) => entry.id === pending_addon_resume,
    );

    set_pending_addon_resume(null);
    if (!addon) {
      show_toast(
        t("settings.billing_checkout_cancelled"),
        "info",
        TOAST_DURATION_BILLING_MS,
      );

      return;
    }

    set_addon_method_target(addon);
    set_show_addon_method_modal(true);
  }, [available_addons, pending_addon_resume, t]);

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
      },
    );
    set_show_crypto_modal(true);
  };

  const handle_family_plan_change = async (
    plan_code: string,
    interval: "month" | "year" | "biennial",
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
          show_toast(
            checkout_error_text(t, result.server_code),
            "error",
            TOAST_DURATION_BILLING_MS,
          );
        } else {
          plan_before_checkout_ref.current = subscription?.plan.code ?? null;
          pending_tauri_checkout_ref.current = true;
        }
      } catch {
        show_toast(
          t("settings.failed_checkout"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
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
      } as AvailablePlan);

    set_plan_change_confirm_target({ plan, interval });
    set_show_plan_change_confirm(true);
  };

  const handle_pay_with_card = async (
    plan: AvailablePlan,
    term_id?: string,
  ) => {
    if (is_action_loading) return;

    const term = term_id ?? billing_period;
    const checkout_interval =
      term === "yearly" ? "year" : term === "biennial" ? "biennial" : "month";

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
      const offer_applies =
        (checkout_interval === "month" || checkout_interval === "year") &&
        !!offer_checkout.plan_pricing(plan.code);
      const result = await start_hosted_checkout(
        plan.code,
        checkout_interval,
        preferred_currency,
        credit_balance?.balance_cents,
        offer_applies ? (special_offer_promo_code() ?? undefined) : undefined,
        offer_applies || undefined,
      );

      if (!result.ok) {
        if (result.server_code === "SPECIAL_OFFER_UNAVAILABLE") {
          void refresh_special_offer_status();
        }
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_is_action_loading(false);
      } else if (is_tauri) {
        plan_before_checkout_ref.current = subscription?.plan.code ?? null;
        pending_tauri_checkout_ref.current = true;
        set_is_action_loading(false);
      }
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_action_loading(false);
    }
  };

  const handle_select_plan = (plan: AvailablePlan) => {
    if (is_action_loading) return;

    set_plan_method_target(plan);
  };

  const plan_choices_for_modal = (plan_code: string): plan_choice_option[] => {
    const is_family = FAMILY_PLAN_TIERS.some((tier) => tier.id === plan_code);
    const family = is_family
      ? FAMILY_PLAN_TIERS.map((tier) => tier.id)
      : PLAN_TIERS.map((tier) => tier.id);

    return plans
      .filter((plan) => family.includes(plan.code))
      .map((plan) => {
        const tier = crypto_term_prices_for(plan.code);
        const cents =
          billing_period === "monthly"
            ? (tier?.monthly_cents ?? 0)
            : Math.round((tier?.yearly_cents ?? 0) / 12);

        return {
          id: plan.code,
          name: plan.name,
          is_recommended: !is_family && plan.code === DEFAULT_RECOMMENDED_PLAN,
          price_label: `${format_price(
            convert_cents(cents, preferred_currency),
            preferred_currency,
          )}${t("settings.per_month_short")}`,
        };
      });
  };

  const plan_term_options_for = (plan_code: string): plan_term_option[] => {
    const tier = crypto_term_prices_for(plan_code);

    if (!tier) return [];

    const biennial_cents =
      "biennial_cents" in tier ? tier.biennial_cents : undefined;

    const options: plan_term_option[] = [
      {
        id: "monthly",
        label: t("settings.billing_monthly"),
        per_month_cents: tier.monthly_cents,
        total_cents: tier.monthly_cents,
        save_cents: 0,
      },
      {
        id: "yearly",
        label: t("settings.billing_yearly"),
        per_month_cents: Math.round(tier.yearly_cents / 12),
        total_cents: tier.yearly_cents,
        save_cents: tier.monthly_cents * 12 - tier.yearly_cents,
      },
    ];

    if (biennial_cents) {
      options.push({
        id: "biennial",
        label: t("settings.biennial"),
        per_month_cents: Math.round(biennial_cents / 24),
        total_cents: biennial_cents,
        save_cents: tier.monthly_cents * 24 - biennial_cents,
        crypto_only: true,
      });
    }

    return options;
  };

  const handle_switch_to_yearly = (plan_code: string) => {
    const plan = plans.find((p) => p.code === plan_code);

    if (!plan) return;

    void record_yearly_switch_click();
    set_plan_change_confirm_target({ plan, interval: "year" });
    set_show_plan_change_confirm(true);
  };

  const handle_confirm_plan_change = async (promo_code?: string) => {
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
            promo_code,
          )
        : await change_plan(
            plan.code,
            interval,
            undefined,
            undefined,
            promo_code,
          );

      if (!result.ok) {
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        if (!is_promo_code_rejection(result.server_code)) {
          set_show_payment_methods(true);
        }

        return;
      }

      if (result.requires_checkout) {
        if (is_tauri) {
          plan_before_checkout_ref.current = subscription?.plan.code ?? null;
          pending_tauri_checkout_ref.current = true;
        }

        return;
      }

      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      const sub_response = await get_subscription();

      if (sub_response.data) set_subscription(sub_response.data);
      await load_data();
      show_toast(t("settings.payment_success"), "success");
    } catch {
      show_toast(
        t("settings.payment_failed"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_show_plan_change_confirm(false);
      set_plan_change_confirm_target(null);
      set_is_action_loading(false);
    }
  };

  const handle_pay_with_crypto = (plan: AvailablePlan, term_months: number) => {
    if (!crypto_term_prices_for(plan.code)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    set_crypto_resume(null);
    set_crypto_initial_term(term_months);
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
        addon_return_url("success"),
        addon_return_url("cancelled"),
      );
      const url = response.data?.url;

      if (url) {
        remember_addon_target(addon.id);
        const is_tauri =
          typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

        if (is_tauri) {
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url });
          plan_before_checkout_ref.current = subscription?.plan.code ?? null;
          pending_tauri_checkout_ref.current = true;
          set_is_action_loading(false);
        } else {
          window.location.assign(url);
        }
      } else {
        show_toast(
          server_error_text(
            response.error,
            t("settings.addon_purchase_failed"),
          ),
          "error",
        );
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

      show_toast(
        server_error_text(response.error, t("settings.cancel_failed")),
        "error",
      );
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
        request_cache.invalidate("/sync/v1");
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

  const current_billing_interval = read_billing_interval(
    subscription?.plan.billing_period,
  );
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
    set_show_plans(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById("available-plans")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const has_payment_failed = Boolean(subscription?.payment_failed_at);
  const is_paid_plan = !!subscription && subscription.plan.code !== "free";
  const current_tier_index = PLAN_TIERS.findIndex(
    (entry) => entry.id === subscription?.plan.code,
  );
  const next_tier =
    has_payment_failed ||
    subscription?.cancel_at_period_end ||
    (is_paid_plan && current_tier_index === -1)
      ? null
      : (PLAN_TIERS[current_tier_index + 1] ?? null);
  const next_tier_highlights = next_tier
    ? (plan_features[next_tier.id] ?? [])
        .filter((feature) => feature.on)
        .slice(0, 3)
        .map((feature) => feature.label)
    : [];
  const handle_upgrade_next = () => {
    const target = next_tier
      ? plans.find((plan) => plan.code === next_tier.id)
      : undefined;

    if (!target) {
      scroll_to_plans();

      return;
    }
    set_billing_period("yearly");
    handle_select_plan(target);
  };
  const advantages_plan_code = is_paid_plan
    ? subscription.plan.code
    : FREE_ADVANTAGES_PLAN;
  const advantages_plan_name = is_paid_plan
    ? subscription.plan.name
    : (PLAN_TIERS.find((entry) => entry.id === FREE_ADVANTAGES_PLAN)?.name ??
      FREE_ADVANTAGES_PLAN);
  const grace_days_remaining = subscription?.grace_period_end
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.grace_period_end).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  if (is_initial_load || skeleton_visible) {
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
    <IslandSections>
      <BillingNoticeStack
        grace_days_remaining={grace_days_remaining}
        has_payment_failed={has_payment_failed}
        is_action_loading={is_action_loading}
        is_over_limit={is_storage_over_limit}
        on_add_storage={scroll_to_storage_addons}
        on_choose_plan={scroll_to_plans}
        on_manage_billing={() => set_show_payment_methods(true)}
        on_reactivate={handle_reactivate}
        on_renew_with_crypto={handle_crypto_renew}
        on_switch_to_yearly={handle_switch_to_yearly}
        preferred_currency={preferred_currency}
        subscription={subscription}
      />

      <SpecialOfferBillingCard plan_code={subscription?.plan.code ?? null} />

      <BillingHeroCard
        current_billing_interval={current_billing_interval}
        has_payment_failed={has_payment_failed}
        is_action_loading={is_action_loading}
        is_over_limit={is_storage_over_limit}
        next_tier={next_tier}
        next_tier_highlights={next_tier_highlights}
        on_add_storage={scroll_to_storage_addons}
        on_cancel_plan={() => {
          set_cancel_password("");
          set_cancel_password_error("");
          set_show_cancel_password(false);
          set_show_cancel_dialog(true);
        }}
        on_manage_payment={() => set_show_payment_methods(true)}
        on_renew_with_crypto={handle_crypto_renew}
        on_show_plans={scroll_to_plans}
        on_switch_billing={() => set_show_switch_billing_dialog(true)}
        on_toggle_plans={() => {
          if (show_plans) {
            set_show_plans(false);
          } else {
            scroll_to_plans();
          }
        }}
        plan_limits={plan_limits}
        plans_open={show_plans}
        preferred_currency={preferred_currency}
        storage_limit_bytes={storage_limit_bytes}
        storage_percentage={storage_percentage}
        storage_used_bytes={storage_used_bytes}
        subscription={subscription}
        on_upgrade_next={handle_upgrade_next}
      />

      <BillingAdvantagesCard
        features={plan_features[advantages_plan_code] ?? []}
        is_paid_plan={is_paid_plan}
        plan_code={advantages_plan_code}
        plan_name={advantages_plan_name}
      />

      <IslandSection bare title={t("settings.available_plans")}>
        <Island padding="none">
          <BillingMoreRow
            description={t("settings.billing_compare_all_plans_subtitle")}
            icon={billing_row_icon(Squares2X2Icon)}
            label={t("settings.compare_plans")}
            on_toggle={() => set_show_plans((value) => !value)}
            open={show_plans}
          >
            <IslandSections>
              <AvailablePlansSection
                embedded
                billing_period={billing_period}
                current_billing_interval={current_billing_interval}
                handle_currency_change={handle_currency_change}
                is_action_loading={is_action_loading}
                on_family_plan_change={handle_family_plan_change}
                on_reload_plans={() => {
                  void load_data();
                }}
                on_tauri_checkout_opened={() => {
                  plan_before_checkout_ref.current =
                    subscription?.plan.code ?? null;
                  pending_tauri_checkout_ref.current = true;
                }}
                on_upgrade={handle_select_plan}
                plan_features={plan_features}
                plans={plans}
                plans_load_failed={plans_load_failed}
                preferred_currency={preferred_currency}
                set_billing_period={set_billing_period}
                subscription={subscription}
              />

              <PlanComparisonSection
                current_plan_code={subscription?.plan.code}
              />
            </IslandSections>
          </BillingMoreRow>
        </Island>
      </IslandSection>

      <IslandSection bare title={t("common.more")}>
        <Island padding="none">
          <StorageAddonsSection
            embedded
            active_addons={active_addons}
            available_addons={available_addons}
            is_action_loading={is_action_loading}
            is_over_limit={is_storage_over_limit}
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
          <IslandDivider />
          <BillingHistorySection
            embedded
            history={history}
            load_failed={history_load_failed}
            on_retry={() => void load_data()}
          />
          <IslandDivider />
          <CreditsSection
            embedded
            credit_balance={credit_balance}
            preferred_currency={preferred_currency}
            set_credit_balance={set_credit_balance}
          />
          <IslandDivider />
          <AcademicDiscountSection
            embedded
            academic_status={academic_status}
            refresh_academic_status={refresh_academic_status}
          />
          <IslandDivider />
          <BillingMoreRow
            description={t("settings.billing_support_subtitle")}
            icon={billing_row_icon(ChatBubbleLeftRightIcon)}
            label={t("common.contact_support")}
            on_press={() => open_settings_target({ section: "feedback" })}
          />
        </Island>
      </IslandSection>

      {stripe_load_failed && (
        <p
          className="text-sm"
          role="alert"
          style={{ color: "var(--color-danger)" }}
        >
          {t("settings.failed_checkout")}
        </p>
      )}

      {crypto_plan &&
        (() => {
          const tier = crypto_term_prices_for(crypto_plan.code);

          if (!tier) return null;

          return (
            <CryptoTermModal
              discount_percent_off={offer_checkout.percent_off}
              discounted_price_cents={offer_checkout.crypto_price(
                crypto_plan.code,
              )}
              initial_coin_key={
                crypto_resume
                  ? `${crypto_resume.currency}:${crypto_resume.chain}`
                  : undefined
              }
              initial_invoice_id={crypto_resume?.invoice_id}
              initial_term_months={
                crypto_resume?.term_months ?? crypto_initial_term
              }
              is_open={show_crypto_modal}
              monthly_price_cents={tier.monthly_cents}
              on_checkout_opened={() => {
                plan_before_checkout_ref.current =
                  subscription?.plan.code ?? null;
                pending_tauri_checkout_ref.current = true;
                set_crypto_back_plan(null);
              }}
              on_close={() => {
                set_show_crypto_modal(false);
                set_crypto_plan(null);
                set_crypto_resume(null);
                if (crypto_back_plan) {
                  set_plan_method_target(crypto_back_plan);
                  set_crypto_back_plan(null);
                }
              }}
              on_finished={() => {
                set_show_crypto_modal(false);
                set_crypto_plan(null);
                set_crypto_resume(null);
                set_crypto_back_plan(null);
              }}
              plan_code={crypto_plan.code}
              plan_name={crypto_plan.name}
              preferred_currency={preferred_currency}
              promo_code={
                offer_checkout.crypto_price(crypto_plan.code)
                  ? special_offer_promo_code()
                  : undefined
              }
              special_offer={!!offer_checkout.crypto_price(crypto_plan.code)}
              yearly_price_cents={tier.yearly_cents}
            />
          );
        })()}

      {plan_method_target && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          credit_balance_cents={credit_balance?.balance_cents}
          features={(plan_features[plan_method_target.code] ?? [])
            .filter((entry) => entry.on)
            .map((entry) => ({ label: entry.label }))}
          on_choose_card={(term_id) => {
            const plan = plan_method_target;

            set_plan_method_target(null);
            if (plan) void handle_pay_with_card(plan, term_id);
          }}
          on_choose_crypto={(term_id) => {
            const plan = plan_method_target;

            set_plan_method_target(null);
            set_crypto_back_plan(plan);
            if (plan) {
              handle_pay_with_crypto(
                plan,
                term_id === "yearly" ? 12 : term_id === "biennial" ? 24 : 1,
              );
            }
          }}
          on_close={() => {
            if (is_action_loading) return;
            set_plan_method_target(null);
          }}
          on_select_plan={(id) => {
            const next = plans.find((plan) => plan.code === id);

            if (next) set_plan_method_target(next);
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
          open={!!plan_method_target}
          plan_choices={plan_choices_for_modal(plan_method_target.code)}
          plan_name={plan_method_target.name}
          selected_plan_id={plan_method_target.code}
          selected_term={billing_period}
          special_offer={offer_checkout.plan_pricing(plan_method_target.code)}
          term_options={plan_term_options_for(plan_method_target.code)}
        />
      )}

      {addon_method_target && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          credit_balance_cents={Math.min(
            credit_balance?.balance_cents ?? 0,
            addon_method_target.price_cents,
          )}
          discount_duration_months={
            addon_promo.eligible ? addon_promo.duration_months : undefined
          }
          discount_percent_off={
            addon_promo.eligible ? addon_promo.percent_off : undefined
          }
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
            set_crypto_back_addon(addon);
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
            plan_before_checkout_ref.current = subscription?.plan.code ?? null;
            pending_tauri_checkout_ref.current = true;
            set_crypto_back_addon(null);
          }}
          on_close={() => {
            set_show_crypto_addon_modal(false);
            set_crypto_addon(null);
            if (crypto_back_addon) {
              set_addon_method_target(crypto_back_addon);
              set_show_addon_method_modal(true);
              set_crypto_back_addon(null);
            }
          }}
          on_finished={() => {
            set_show_crypto_addon_modal(false);
            set_crypto_addon(null);
            set_crypto_back_addon(null);
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
        auto_add_card={auto_add_card}
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
        on_plan_choose_crypto={handle_pay_with_crypto}
        on_switch_plan={(offer) => {
          if (offer.is_family) {
            handle_family_plan_change(
              offer.plan_code,
              current_billing_interval,
            );

            return;
          }

          const api_plan = plans.find((plan) => plan.code === offer.plan_code);

          if (api_plan) {
            handle_select_plan(api_plan);
          } else {
            show_toast(
              t("settings.plans_coming_soon"),
              "info",
              TOAST_DURATION_BILLING_MS,
            );
          }
        }}
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
        set_show_payment_methods={set_show_payment_methods}
        set_show_switch_billing_dialog={set_show_switch_billing_dialog}
        set_subscription={set_subscription}
        show_addon_checkout={show_addon_checkout}
        show_cancel_addon_dialog={show_cancel_addon_dialog}
        show_cancel_dialog={show_cancel_dialog}
        show_cancel_password={show_cancel_password}
        show_checkout_modal={show_checkout_modal}
        show_payment_methods={show_payment_methods}
        show_switch_billing_dialog={show_switch_billing_dialog}
        subscription={subscription}
        target_billing_interval={target_billing_interval}
        yearly_savings={yearly_savings}
      />
    </IslandSections>
  );
}
