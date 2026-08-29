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
import type {
  SubscriptionResponse,
  BillingHistoryItem,
  AvailablePlan,
} from "@/services/api/billing";
import { server_error_text } from "@/components/settings/billing/server_error_text";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  CURRENCY_STORAGE_KEY,
  SUPPORTED_CURRENCIES,
  detect_currency_from_locale,
  is_crypto_provider,
  take_crypto_resume,
  type CryptoResumeSelection,
  type FamilyPlanTier,
} from "@/components/settings/billing/billing_constants";
import { create_family_group } from "@/services/api/family";
import { use_i18n } from "@/lib/i18n/context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { type CancelReason } from "@/components/settings/billing/cancel_reason_step";
import { type CancelStep } from "@/components/settings/billing/cancel_impact_step";
import {
  clear_cancel_password_cache,
  get_cancel_password_hash,
  verify_cancel_password,
} from "@/components/settings/billing/cancel_password";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { addon_return_url } from "@/lib/addon_return_url";
import { ignore_error } from "@/lib/ignore_error";
import {
  get_subscription,
  get_billing_history,
  get_available_plans,
  cancel_subscription,
  reactivate_subscription,
  activate_subscription,
  start_hosted_checkout,
  change_plan,
  get_storage_addons,
  purchase_storage_addon,
  cancel_storage_addon,
  get_referral_info,
  get_referral_history,
  get_credits,
  get_academic_discount_status,
  build_referral_invite_url,
  get_cancel_impact,
  format_date,
  open_payment_url,
  type ReferralInfo,
  type ReferralHistoryItem,
  type CreditBalanceResponse,
  type StorageAddonItem,
  type UserActiveAddon,
  type AcademicDiscountStatusResponse,
  type CancelImpactResponse,
} from "@/services/api/billing";
import { checkout_error_text } from "@/components/settings/billing/checkout_error_text";

export function use_billing_section() {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { stats } = use_mail_stats();
  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(null);
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [history, set_history] = useState<BillingHistoryItem[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_action_loading, set_is_action_loading] = useState(false);
  const [show_cancel_dialog, set_show_cancel_dialog] = useState(false);
  const [cancel_password, set_cancel_password] = useState("");
  const [cancel_password_error, set_cancel_password_error] = useState("");
  const [show_cancel_password, set_show_cancel_password] = useState(false);
  const [cancel_reason, set_cancel_reason] = useState<CancelReason | null>(
    null,
  );
  const [cancel_reason_text, set_cancel_reason_text] = useState("");
  const [cancel_step, set_cancel_step] = useState<CancelStep>("reason");
  const [is_verifying_password, set_is_verifying_password] = useState(false);
  const [cancel_totp_code, set_cancel_totp_code] = useState("");
  const [cancel_totp_required, set_cancel_totp_required] = useState(false);
  const [cancel_impact, set_cancel_impact] =
    useState<CancelImpactResponse | null>(null);
  const [is_impact_loading, set_is_impact_loading] = useState(false);

  useEffect(() => {
    if (!show_cancel_dialog) return;
    set_cancel_password("");
    set_cancel_password_error("");
    set_show_cancel_password(false);
    set_cancel_reason(null);
    set_cancel_reason_text("");
    set_cancel_step("reason");
    set_cancel_totp_code("");
    set_cancel_totp_required(false);
    set_cancel_impact(null);
    set_is_verifying_password(false);
    clear_cancel_password_cache();
  }, [show_cancel_dialog]);

  useEffect(() => {
    if (!show_cancel_dialog || cancel_step !== "impact" || cancel_impact)
      return;
    let cancelled = false;

    set_is_impact_loading(true);
    (async () => {
      try {
        const response = await get_cancel_impact();

        if (!cancelled && response.data) set_cancel_impact(response.data);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      } finally {
        if (!cancelled) set_is_impact_loading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show_cancel_dialog, cancel_step, cancel_impact]);

  const cancel_effective_date = cancel_impact?.effective_at
    ? format_date(cancel_impact.effective_at)
    : subscription?.current_period_end
      ? format_date(subscription.current_period_end)
      : null;

  const handle_password_continue = async () => {
    if (!cancel_password.trim() || is_verifying_password) return;
    set_is_verifying_password(true);
    set_cancel_password_error("");
    const outcome = await verify_cancel_password(
      cancel_password,
      cancel_totp_code,
    );

    set_is_verifying_password(false);

    if (outcome === "verified") {
      set_cancel_step("confirm");

      return;
    }

    if (outcome === "totp_required") {
      set_cancel_totp_required(true);
      set_cancel_password_error(t("settings.please_enter_2fa_code"));

      return;
    }
    set_cancel_password_error(
      outcome === "invalid"
        ? t("settings.incorrect_password_error")
        : t("settings.cancel_password_error"),
    );
  };

  const [selected_storage, set_selected_storage] = useState<string | null>(
    null,
  );
  const [show_payment_methods, set_show_payment_methods] = useState(false);
  const [available_addons, set_available_addons] = useState<StorageAddonItem[]>(
    [],
  );
  const [show_method_modal, set_show_method_modal] = useState(false);
  const [method_modal_plan, set_method_modal_plan] =
    useState<AvailablePlan | null>(null);
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
  const [preferred_currency, set_preferred_currency] = useState(
    detect_currency_from_locale,
  );
  const [active_addons, set_active_addons] = useState<UserActiveAddon[]>([]);
  const [academic_status, set_academic_status] =
    useState<AcademicDiscountStatusResponse | null>(null);
  const [plan_type, set_plan_type] = useState<"individual" | "family">(
    "individual",
  );
  const [pending_family_tier, set_pending_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [addon_to_cancel, set_addon_to_cancel] =
    useState<UserActiveAddon | null>(null);
  const [billing_period, set_billing_period] = useState<
    "monthly" | "yearly" | "biennial"
  >("yearly");
  const [referral_load_failed, set_referral_load_failed] = useState(false);
  const [plans_load_failed, set_plans_load_failed] = useState(false);
  const [addons_load_failed, set_addons_load_failed] = useState(false);
  const [history_load_failed, set_history_load_failed] = useState(false);
  const [referral_history_load_failed, set_referral_history_load_failed] =
    useState(false);
  const [subscription_load_failed, set_subscription_load_failed] =
    useState(false);
  const [referral_info, set_referral_info] = useState<ReferralInfo | null>(
    null,
  );
  const [referral_history_list, set_referral_history_list] = useState<
    ReferralHistoryItem[]
  >([]);
  const [is_sending_referral, set_is_sending_referral] = useState(false);
  const [credit_balance, set_credit_balance] =
    useState<CreditBalanceResponse | null>(null);
  const [credits_load_failed, set_credits_load_failed] = useState(false);

  const resolve_credit_cents = useCallback(async (): Promise<number | null> => {
    if (!credits_load_failed) return credit_balance?.balance_cents ?? 0;

    const retry = await get_credits();

    if (!retry.data) return null;

    set_credit_balance(retry.data);
    set_credits_load_failed(false);

    return retry.data.balance_cents ?? 0;
  }, [credit_balance, credits_load_failed]);

  const handle_send_referral = useCallback(async () => {
    if (!referral_info) return;

    set_is_sending_referral(true);

    try {
      const all_emails: string[] = [];
      let cursor: string | undefined;
      let has_more = true;

      while (has_more) {
        const res = await list_contacts({ limit: 100, cursor });

        if (!res.data) throw new Error("list_contacts failed");

        if (!res.data.items?.length) break;

        const decrypted = await decrypt_contacts(res.data.items);

        for (const contact of decrypted) {
          if (contact.emails) {
            all_emails.push(...contact.emails);
          }
        }

        has_more = res.data.has_more;
        cursor = res.data.next_cursor || undefined;
      }

      if (all_emails.length === 0) {
        show_toast(t("settings.referral_no_contacts"), "error");

        return;
      }

      const body_text = t("settings.referral_email_body", {
        referral_link: build_referral_invite_url(referral_info.referral_code),
      });

      const body_html = body_text
        .split("\n")
        .map((line: string) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
        .join("");

      window.dispatchEvent(
        new CustomEvent("aster:open-compose-prefilled", {
          detail: {
            to: user?.email ? [user.email] : [],
            bcc: all_emails,
            subject: t("settings.referral_email_subject"),
            body: body_html,
          },
        }),
      );
    } catch {
      show_toast(t("common.something_went_wrong_try_again"), "error");
    } finally {
      set_is_sending_referral(false);
    }
  }, [referral_info, t, user]);

  const plan_features: Record<string, string[]> = useMemo(
    () => ({
      star: [
        t("settings.plan_f_storage", { value: "50 GB" }),
        t("settings.plan_f_attachments", { value: "50 MB" }),
        t("settings.plan_f_aliases", { value: "15" }),
        t("settings.plan_f_domains", { value: "5" }),
        t("settings.plan_f_send_limit", { value: t("settings.unlimited") }),
        t("settings.plan_f_templates", { value: "10" }),
        t("settings.plan_f_vacation_reply"),
        t("settings.plan_f_catch_all"),
        t("settings.plan_f_auto_forwarding"),
        t("settings.plan_f_quiet_hours"),
        t("settings.plan_f_external_accounts"),
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
        t("settings.plan_f_contact_merge"),
        t("settings.plan_f_encrypted_export"),
        t("settings.plan_f_password_folders"),
        t("settings.plan_f_custom_key_rotation"),
        t("settings.plan_f_external_accounts"),
        t("settings.vanguard_title"),
      ],
      supernova: [
        t("settings.plan_f_storage", { value: "5 TB" }),
        t("settings.plan_f_attachments", { value: "250 MB" }),
        t("settings.plan_f_aliases", { value: t("settings.unlimited") }),
        t("settings.plan_f_domains", { value: t("settings.unlimited") }),
        t("settings.plan_f_send_limit", { value: t("settings.unlimited") }),
        t("settings.plan_f_receipt_tracking"),
        t("settings.plan_f_external_accounts"),
        t("settings.plan_f_support_dedicated"),
        t("settings.plan_f_early_access"),
        t("settings.vanguard_title"),
      ],
    }),
    [t],
  );

  const storage_limit_bytes =
    stats.storage_total_bytes ||
    subscription?.storage?.total_limit_bytes ||
    1024 * 1024 * 1024;
  const storage_used_bytes = stats.storage_used_bytes;
  const storage_percentage = Math.min(
    100,
    (storage_used_bytes / storage_limit_bytes) * 100,
  );
  const is_storage_over_limit = storage_used_bytes > storage_limit_bytes;

  const load_data = useCallback(async () => {
    try {
      const [
        sub_res,
        plans_res,
        hist_res,
        addons_res,
        ref_res,
        ref_hist_res,
        credits_res,
      ] = await Promise.all([
        get_subscription(),
        get_available_plans(),
        get_billing_history(1, 10),
        get_storage_addons(),
        get_referral_info(),
        get_referral_history(),
        get_credits(),
      ]);

      if (sub_res.data) {
        set_subscription(sub_res.data);
        set_subscription_load_failed(false);
      } else {
        set_subscription_load_failed(true);
      }
      if (plans_res.data) {
        set_plans(plans_res.data.plans);
        set_plans_load_failed(false);
      } else {
        set_plans_load_failed(true);
      }
      if (hist_res.data) {
        set_history(hist_res.data.items);
        set_history_load_failed(false);
      } else {
        set_history_load_failed(true);
      }
      if (addons_res.data) {
        set_available_addons(addons_res.data.available_addons);
        set_active_addons(addons_res.data.active_addons ?? []);
        set_addons_load_failed(false);
      } else {
        set_addons_load_failed(true);
      }
      if (ref_res.data) {
        set_referral_info(ref_res.data);
        set_referral_load_failed(false);
      } else {
        set_referral_load_failed(true);
      }
      if (ref_hist_res.data) {
        set_referral_history_list(ref_hist_res.data.referrals);
        set_referral_history_load_failed(false);
      } else {
        set_referral_history_load_failed(true);
      }
      if (credits_res.data) {
        set_credit_balance(credits_res.data);
        set_credits_load_failed(false);
      } else {
        set_credits_load_failed(true);
      }
    } catch (caught) {
      ignore_error(
        "pages/mobile/settings/use_billing_section:handle_password_continue",
        caught,
      );
      set_subscription_load_failed(true);
      set_plans_load_failed(true);
      set_addons_load_failed(true);
      set_history_load_failed(true);
      set_referral_history_load_failed(true);
    } finally {
      set_is_loading(false);
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

    if (params.get("stripe_redirect") && params.get("redirect_status")) {
      const redirect_status = params.get("redirect_status");

      window.history.replaceState({}, "", window.location.pathname);

      if (redirect_status === "succeeded") {
        (async () => {
          try {
            const result = await activate_subscription();

            if (result.data?.activated) {
              show_toast(t("settings.payment_success"), "success");
              request_cache.invalidate("/payments/v1");
              request_cache.invalidate("/sync/v1");
              invalidate_mail_stats();
              await load_data();
            } else {
              for (let attempt = 0; attempt < 8; attempt++) {
                await new Promise((r) => setTimeout(r, 3000));
                const retry = await activate_subscription();

                if (retry.data?.activated) {
                  show_toast(t("settings.payment_success"), "success");
                  request_cache.invalidate("/payments/v1");
                  request_cache.invalidate("/sync/v1");
                  invalidate_mail_stats();
                  await load_data();

                  return;
                }
              }
              show_toast(
                t("settings.payment_processing_delayed"),
                "info",
                TOAST_DURATION_BILLING_MS,
              );
              request_cache.invalidate("/payments/v1");
              await load_data();
            }
          } catch {
            show_toast(
              t("settings.payment_processing_delayed"),
              "info",
              TOAST_DURATION_BILLING_MS,
            );
            request_cache.invalidate("/payments/v1");
          }
        })();
      } else {
        show_toast(
          t("settings.payment_failed"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      }
    }
  }, [load_data, t]);

  const handle_manage_billing = () => {
    set_show_payment_methods(true);
  };

  const refresh_academic_status = useCallback(async () => {
    const res = await get_academic_discount_status();

    if (res.data) set_academic_status(res.data);
  }, []);

  useEffect(() => {
    refresh_academic_status();
  }, [refresh_academic_status]);

  const handle_currency_change = useCallback((value: string) => {
    if (!SUPPORTED_CURRENCIES.some((c) => c.code === value)) return;

    set_preferred_currency(value);

    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, value);
    } catch (caught) {
      ignore_error(
        "pages/mobile/settings/use_billing_section:handle_currency_change",
        caught,
      );
    }
  }, []);

  const handle_cancel_addon = async () => {
    if (!addon_to_cancel) return;

    set_is_action_loading(true);

    try {
      const response = await cancel_storage_addon(
        addon_to_cancel.user_addon_id,
      );

      if (response.data?.success) {
        show_toast(t("settings.addon_cancelled"), "success");
        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        await load_data();
      } else {
        show_toast(
          t("settings.addon_cancel_failed"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      }
    } catch (caught) {
      ignore_error(
        "pages/mobile/settings/use_billing_section:handle_cancel_addon",
        caught,
      );
      show_toast(
        t("settings.addon_cancel_failed"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_is_action_loading(false);
      set_addon_to_cancel(null);
    }
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
        show_toast(t("settings.failed_cancel_subscription"), "error");

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
        request_cache.invalidate("/sync/v1");
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
    } catch {
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
    } catch {
      show_toast(t("settings.failed_reactivate"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const handle_select_plan = (plan: AvailablePlan) => {
    set_method_modal_plan(plan);
    set_show_method_modal(true);
  };

  const handle_pay_with_card = async (plan: AvailablePlan) => {
    if (is_action_loading) return;

    const checkout_interval =
      billing_period === "yearly"
        ? "year"
        : billing_period === "biennial"
          ? "biennial"
          : "month";

    const has_card_sub =
      !!subscription &&
      subscription.plan.code !== "free" &&
      !is_crypto_provider(subscription.payment_provider) &&
      subscription.has_stripe_subscription !== false;

    if (has_card_sub) {
      set_plan_change_confirm_target({ plan, interval: checkout_interval });
      set_show_plan_change_confirm(true);

      return;
    }

    set_is_action_loading(true);

    try {
      const credit_cents = await resolve_credit_cents();

      if (credit_cents === null) {
        set_is_action_loading(false);
        show_toast(
          t("settings.failed_checkout"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );

        return;
      }

      const result = await start_hosted_checkout(
        plan.code,
        checkout_interval,
        preferred_currency,
        credit_cents,
      );

      if (!result.ok) {
        set_is_action_loading(false);
        show_toast(
          t("settings.failed_checkout"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      }
    } catch {
      set_is_action_loading(false);
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    }
  };

  const handle_family_plan = async (tier_id: string) => {
    if (is_action_loading) return;
    set_is_action_loading(true);

    try {
      const response = await create_family_group(
        tier_id,
        billing_period === "yearly" ? "year" : "month",
      );

      if (response.data?.checkout_url) {
        await open_payment_url(response.data.checkout_url);
      } else {
        show_toast(
          checkout_error_text(t, response.server_code),
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
      set_is_action_loading(false);
    }
  };

  const handle_confirm_plan_change = async () => {
    if (!plan_change_confirm_target) return;
    const { plan, interval } = plan_change_confirm_target;

    set_is_action_loading(true);
    try {
      const result = await change_plan(plan.code, interval);

      if (!result.ok) {
        show_toast(
          t("settings.payment_failed"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_show_payment_methods(true);

        return;
      }

      if (result.requires_checkout) return;

      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
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

  const crypto_term_prices_for = (plan_code: string) =>
    PLAN_TIERS.find((p) => p.id === plan_code) ??
    FAMILY_PLAN_TIERS.find((p) => p.id === plan_code);

  const handle_pay_with_crypto = (plan: AvailablePlan) => {
    if (!crypto_term_prices_for(plan.code)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }
    set_crypto_resume(null);
    set_crypto_plan(plan);
    set_show_crypto_modal(true);
  };

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

  const handle_addon_pay_card = async (addon: StorageAddonItem) => {
    if (is_action_loading) return;

    set_is_action_loading(true);
    try {
      const credit_cents = await resolve_credit_cents();

      if (credit_cents === null) {
        set_is_action_loading(false);
        show_toast(t("settings.addon_purchase_failed"), "error");

        return;
      }

      const response = await purchase_storage_addon(
        addon.id,
        credit_cents,
        addon_return_url("success"),
        addon_return_url("cancelled"),
      );
      const url = response.data?.url;

      if (url) {
        window.location.assign(url);
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

  const handle_family_select = (tier: FamilyPlanTier) => {
    set_pending_family_tier(tier);
  };

  const handle_family_crypto = () => {
    if (!pending_family_tier) return;

    if (!crypto_term_prices_for(pending_family_tier.id)) {
      show_toast(t("settings.crypto_price_unavailable"), "error");

      return;
    }

    set_crypto_family_tier(pending_family_tier);
    set_pending_family_tier(null);
  };

  const handle_family_card = async (term_id?: string) => {
    if (!pending_family_tier) return;
    if (is_action_loading) return;

    const tier = pending_family_tier;
    const card_interval: "month" | "year" =
      term_id === "monthly"
        ? "month"
        : term_id === "yearly"
          ? "year"
          : billing_period === "yearly"
            ? "year"
            : "month";

    set_pending_family_tier(null);

    const has_card_sub =
      !!subscription &&
      subscription.plan.code !== "free" &&
      !is_crypto_provider(subscription.payment_provider) &&
      subscription.has_stripe_subscription !== false;

    if (has_card_sub) {
      const plan =
        plans.find((p) => p.code === tier.id) ??
        ({
          id: tier.id,
          code: tier.id,
          name: tier.name,
          description: tier.description,
          storage_limit_bytes: 0,
          max_attachment_size_bytes: 0,
          max_email_aliases: 0,
          max_custom_domains: 0,
          price_cents:
            card_interval === "year" ? tier.yearly_cents : tier.monthly_cents,
          billing_period: card_interval,
          stripe_price_id: null,
          is_current: false,
        } as AvailablePlan);

      set_plan_change_confirm_target({ plan, interval: card_interval });
      set_show_plan_change_confirm(true);

      return;
    }

    set_is_action_loading(true);

    try {
      const origin = window.location.origin;
      const res = await create_family_group(
        tier.id,
        card_interval,
        `${origin}/?family=success`,
        `${origin}/?family=cancelled`,
      );
      const checkout_url = res.data?.checkout_url;

      if (!checkout_url) {
        show_toast(
          t("settings.failed_checkout"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_is_action_loading(false);

        return;
      }

      const parsed = new URL(checkout_url);

      if (parsed.protocol !== "https:") {
        show_toast(
          t("settings.failed_checkout"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_is_action_loading(false);

        return;
      }

      window.location.assign(parsed.toString());
    } catch (caught) {
      ignore_error(
        "pages/mobile/settings/use_billing_section:handle_family_card",
        caught,
      );
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_action_loading(false);
    }
  };

  const handle_addon_pay_crypto = (addon: StorageAddonItem) => {
    set_crypto_addon(addon);
    set_show_crypto_addon_modal(true);
  };

  const plans_ref = useRef<HTMLDivElement>(null);
  const scroll_to_plans = () => {
    plans_ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const current_billing_interval: "month" | "year" =
    subscription?.plan.billing_period?.startsWith("year") ? "year" : "month";
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

  const is_paid_plan = subscription && subscription.plan.code !== "free";
  const is_crypto_sub = is_crypto_provider(subscription?.payment_provider);

  return {
    t,
    subscription,
    plans,
    history,
    is_loading,
    is_action_loading,
    show_cancel_dialog,
    set_show_cancel_dialog,
    cancel_password,
    set_cancel_password,
    cancel_password_error,
    set_cancel_password_error,
    show_cancel_password,
    set_show_cancel_password,
    cancel_reason,
    set_cancel_reason,
    cancel_reason_text,
    set_cancel_reason_text,
    cancel_step,
    set_cancel_step,
    is_verifying_password,
    cancel_totp_code,
    set_cancel_totp_code,
    cancel_totp_required,
    cancel_impact,
    is_impact_loading,
    cancel_effective_date,
    handle_password_continue,
    selected_storage,
    set_selected_storage,
    show_payment_methods,
    set_show_payment_methods,
    available_addons,
    show_method_modal,
    set_show_method_modal,
    method_modal_plan,
    set_method_modal_plan,
    show_crypto_modal,
    set_show_crypto_modal,
    crypto_plan,
    set_crypto_plan,
    crypto_resume,
    set_crypto_resume,
    show_addon_method_modal,
    set_show_addon_method_modal,
    addon_method_target,
    set_addon_method_target,
    show_crypto_addon_modal,
    set_show_crypto_addon_modal,
    crypto_addon,
    set_crypto_addon,
    show_plan_change_confirm,
    set_show_plan_change_confirm,
    plan_change_confirm_target,
    set_plan_change_confirm_target,
    preferred_currency,
    handle_currency_change,
    billing_period,
    set_billing_period,
    active_addons,
    academic_status,
    refresh_academic_status,
    plan_type,
    set_plan_type,
    pending_family_tier,
    set_pending_family_tier,
    crypto_family_tier,
    set_crypto_family_tier,
    handle_family_select,
    handle_family_card,
    handle_family_crypto,
    addon_to_cancel,
    set_addon_to_cancel,
    handle_cancel_addon,
    current_billing_interval,
    has_payment_failed,
    grace_days_remaining,
    referral_info,
    referral_load_failed,
    subscription_load_failed,
    plans_load_failed,
    addons_load_failed,
    history_load_failed,
    referral_history_load_failed,
    load_data,
    referral_history_list,
    is_sending_referral,
    credit_balance,
    set_credit_balance,
    handle_send_referral,
    plan_features,
    storage_limit_bytes,
    storage_used_bytes,
    storage_percentage,
    is_storage_over_limit,
    handle_manage_billing,
    handle_cancel,
    handle_reactivate,
    handle_select_plan,
    handle_pay_with_card,
    handle_family_plan,
    handle_confirm_plan_change,
    crypto_term_prices_for,
    handle_pay_with_crypto,
    handle_crypto_renew,
    handle_addon_pay_card,
    handle_addon_pay_crypto,
    plans_ref,
    scroll_to_plans,
    is_paid_plan,
    is_crypto_sub,
  };
}
