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

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  CheckIcon,
  XCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  UserGroupIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { CheckoutModal } from "@/components/settings/checkout_modal";
import { PaymentMethodsModal } from "@/components/settings/payment_methods_modal";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_contacts,
  decrypt_contacts,
} from "@/services/api/contacts";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  get_subscription,
  get_billing_history,
  get_available_plans,
  cancel_subscription,
  reactivate_subscription,
  activate_subscription,
  get_referral_info,
  get_referral_history,
  format_storage,
  format_price,
  format_date,
  type ReferralInfo,
  type ReferralHistoryItem,
} from "@/services/api/billing";
import { use_auth } from "@/contexts/auth_context";
import { get_user_salt } from "@/services/api/auth";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

interface StorageAddon {
  id: string;
  label: string;
  price_cents: number;
  badge?: "popular" | "best_value";
}

const STORAGE_ADDONS: StorageAddon[] = [
  { id: "5gb", label: "5 GB", price_cents: 99 },
  { id: "10gb", label: "10 GB", price_cents: 199 },
  { id: "50gb", label: "50 GB", price_cents: 499 },
  { id: "100gb", label: "100 GB", price_cents: 799, badge: "popular" },
  { id: "500gb", label: "500 GB", price_cents: 1999 },
  { id: "1tb", label: "1 TB", price_cents: 3499 },
  { id: "5tb", label: "5 TB", price_cents: 9999 },
  { id: "10tb", label: "10 TB", price_cents: 14999, badge: "best_value" },
];

interface PlanTier {
  id: string;
  name: string;
  monthly_cents: number;
  yearly_cents: number;
  biennial_cents: number;
  savings_cents: number;
  biennial_savings_cents: number;
  is_recommended?: boolean;
}

const PLAN_TIERS: PlanTier[] = [
  {
    id: "star",
    name: "Star",
    monthly_cents: 299,
    yearly_cents: 2899,
    biennial_cents: 4999,
    savings_cents: 689,
    biennial_savings_cents: 2177,
  },
  {
    id: "nova",
    name: "Nova",
    monthly_cents: 899,
    yearly_cents: 8699,
    biennial_cents: 14999,
    savings_cents: 2089,
    biennial_savings_cents: 6577,
    is_recommended: true,
  },
  {
    id: "supernova",
    name: "Supernova",
    monthly_cents: 1799,
    yearly_cents: 17399,
    biennial_cents: 29999,
    savings_cents: 4189,
    biennial_savings_cents: 13177,
  },
];

export function BillingSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
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
  const [selected_plan, set_selected_plan] = useState<AvailablePlan | null>(
    null,
  );
  const [selected_storage, set_selected_storage] = useState<string | null>(
    null,
  );
  const [show_checkout_modal, set_show_checkout_modal] = useState(false);
  const [show_payment_methods, set_show_payment_methods] = useState(false);
  const [checkout_addon, set_checkout_addon] = useState<StorageAddon | null>(
    null,
  );
  const [show_addon_checkout, set_show_addon_checkout] = useState(false);
  const [billing_period, set_billing_period] = useState<
    "monthly" | "yearly" | "biennial"
  >("monthly");
  const [referral_info, set_referral_info] = useState<ReferralInfo | null>(null);
  const [referral_history_list, set_referral_history_list] = useState<ReferralHistoryItem[]>([]);
  const [is_sending_referral, set_is_sending_referral] = useState(false);

  const handle_send_referral = useCallback(async () => {
    if (!referral_info) return;

    set_is_sending_referral(true);

    try {
      const all_emails: string[] = [];
      let cursor: string | undefined;
      let has_more = true;

      while (has_more) {
        const res = await list_contacts({ limit: 100, cursor });

        if (!res.data?.items?.length) break;

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
        referral_link: referral_info.referral_link,
      });

      const body_html = body_text
        .split("\n")
        .map((line: string) =>
          line.trim() === "" ? "<br>" : `<p>${line}</p>`,
        )
        .join("");

      window.dispatchEvent(
        new CustomEvent("aster:open-compose-prefilled", {
          detail: {
            to: all_emails,
            subject: t("settings.referral_email_subject"),
            body: body_html,
          },
        }),
      );
    } finally {
      set_is_sending_referral(false);
    }
  }, [referral_info, t]);

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
        t("settings.plan_f_carddav_import"),
        t("settings.plan_f_contact_merge"),
        t("settings.plan_f_encrypted_export"),
        t("settings.plan_f_password_folders"),
        t("settings.plan_f_custom_key_rotation"),
        t("settings.plan_f_external_accounts"),
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
      const [sub_res, plans_res, hist_res, ref_res, ref_hist_res] = await Promise.all([
        get_subscription(),
        get_available_plans(),
        get_billing_history(1, 10),
        get_referral_info(),
        get_referral_history(),
      ]);

      if (sub_res.data) set_subscription(sub_res.data);
      if (plans_res.data) set_plans(plans_res.data.plans);
      if (hist_res.data) set_history(hist_res.data.items);
      if (ref_res.data) set_referral_info(ref_res.data);
      if (ref_hist_res.data) set_referral_history_list(ref_hist_res.data.referrals);
    } catch {
    } finally {
      set_is_loading(false);
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
              show_toast(t("settings.payment_processing_delayed"), "info");
              request_cache.invalidate("/payments/v1");
              await load_data();
            }
          } catch {
            show_toast(t("settings.payment_failed"), "error");
          }
        })();
      } else {
        show_toast(t("settings.payment_failed"), "error");
      }
    }
  }, [load_data, t]);

  const handle_manage_billing = () => {
    set_show_payment_methods(true);
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
        await load_data();
      } else {
        set_cancel_password_error(t("settings.cancel_password_error"));
      }
    } catch {
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
        await load_data();
      } else {
        show_toast(t("settings.failed_reactivate"), "error");
      }
    } catch {
      show_toast(t("settings.failed_reactivate"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const plans_ref = useRef<HTMLDivElement>(null);
  const scroll_to_plans = () => {
    plans_ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const is_paid_plan = subscription && subscription.plan.code !== "free";

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.billing")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : (
          <>
            <div className="px-4 pt-4">
              <div
                className="relative overflow-hidden rounded-2xl p-5"
                style={{
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #2563eb 70%, #3b82f6 100%)",
                  boxShadow:
                    "0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="relative z-10">
                  <h3
                    className="text-[17px] font-bold text-white mb-1 tracking-tight"
                    style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
                  >
                    {t("settings.billing_banner_title")}
                  </h3>
                  <p
                    className="text-[13px] text-blue-100/70 mb-4"
                    style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
                  >
                    {t("settings.billing_banner_subtitle")}
                  </p>
                  <button
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-semibold bg-white text-blue-900"
                    style={{
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    type="button"
                    onClick={scroll_to_plans}
                  >
                    {t("settings.billing_banner_cta")}
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {is_storage_over_limit && (
              <div className="px-4 pt-3">
                <div className="flex items-start gap-3 rounded-2xl bg-[var(--mobile-bg-card)] p-4 border border-red-500/30">
                  <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                  <div>
                    <p className="text-[14px] font-medium text-red-500">
                      {t("settings.storage_limit_exceeded")}
                    </p>
                    <p className="text-[12px] mt-0.5 text-[var(--text-muted)]">
                      {t("settings.storage_limit_description")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {subscription && (
              <SettingsGroup title={t("settings.current_plan")}>
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[17px] font-semibold text-[var(--text-primary)]">
                        {subscription.plan.name}
                      </span>
                      {!is_paid_plan && (
                        <p className="text-[12px] mt-0.5 text-[var(--text-muted)]">
                          {t("settings.free_plan_description")}
                        </p>
                      )}
                      {is_paid_plan && subscription.plan.description && (
                        <p className="text-[12px] mt-0.5 text-[var(--text-muted)]">
                          {subscription.plan.description}
                        </p>
                      )}
                    </div>
                    {is_paid_plan && subscription.current_period_end && (
                      <div className="text-right">
                        <span className="text-[14px] font-medium text-[var(--text-secondary)]">
                          {format_price(subscription.plan.price_cents)}
                          <span className="text-[11px] font-normal text-[var(--text-muted)]">
                            /{subscription.plan.billing_period || t("settings.per_month_short")}
                          </span>
                        </span>
                        <p className="text-[11px] mt-0.5 text-[var(--text-muted)]">
                          {subscription.cancel_at_period_end
                            ? t("settings.cancels")
                            : t("settings.renews")}{" "}
                          {format_date(subscription.current_period_end)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-[var(--text-muted)]">
                        {t("settings.storage")}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {format_storage(storage_used_bytes)} /{" "}
                        {format_storage(storage_limit_bytes)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--mobile-bg-card-hover)]">
                      <div
                        className={`h-full rounded-full transition-all ${is_storage_over_limit ? "bg-red-500" : "bg-[var(--accent-color,#3b82f6)]"}`}
                        style={{
                          width: `${Math.min(storage_percentage, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {is_paid_plan ? (
                    <div className="flex gap-2 pt-2 border-t border-[var(--border-primary)]">
                      <button
                        className="flex-1 rounded-xl bg-[var(--mobile-bg-card-hover)] py-2.5 text-[14px] font-medium text-[var(--text-primary)] disabled:opacity-50"
                        disabled={is_action_loading}
                        type="button"
                        onClick={handle_manage_billing}
                      >
                        {t("settings.manage_payment")}
                      </button>
                      {subscription.cancel_at_period_end ? (
                        <motion.button
                          className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
                          disabled={is_action_loading}
                          style={{
                            background:
                              "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                            boxShadow:
                              "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                          }}
                          type="button"
                          onClick={handle_reactivate}
                        >
                          {t("settings.reactivate")}
                        </motion.button>
                      ) : (
                        <button
                          className="flex-1 rounded-xl py-2.5 text-[14px] font-medium text-[var(--color-danger,#ef4444)] disabled:opacity-50"
                          disabled={is_action_loading}
                          type="button"
                          onClick={() => set_show_cancel_dialog(true)}
                        >
                          {t("settings.cancel_plan")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <motion.button
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-white"
                      style={{
                        background:
                          "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                        boxShadow:
                          "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                      }}
                      type="button"
                      onClick={scroll_to_plans}
                    >
                      {t("settings.upgrade_for_more_short")}
                      <ChevronRightIcon className="w-4 h-4" />
                    </motion.button>
                  )}
                </div>
              </SettingsGroup>
            )}

            <SettingsGroup title={t("settings.storage_addons")}>
              <div className="px-4 py-3">
                <p className="text-[13px] mb-3 text-[var(--text-muted)]">
                  {t("settings.storage_addons_description")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STORAGE_ADDONS.map((addon) => (
                    <button
                      key={addon.id}
                      className="relative rounded-xl p-3 text-left transition-all"
                      style={{
                        backgroundColor:
                          selected_storage === addon.id
                            ? "rgba(59, 130, 246, 0.06)"
                            : "var(--mobile-bg-card-hover)",
                        border: `1.5px solid ${selected_storage === addon.id ? "#3b82f6" : "transparent"}`,
                      }}
                      type="button"
                      onClick={() =>
                        set_selected_storage(
                          selected_storage === addon.id ? null : addon.id,
                        )
                      }
                    >
                      {addon.badge && (
                        <span
                          className="absolute -top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{
                            background:
                              "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #2563eb 70%, #3b82f6 100%)",
                          }}
                        >
                          {addon.badge === "popular"
                            ? t("settings.popular")
                            : t("settings.best_value")}
                        </span>
                      )}
                      <p className="text-[15px] font-bold text-[var(--text-primary)]">
                        {addon.label}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        {format_price(addon.price_cents)}
                        {t("settings.per_month_short")}
                      </p>
                    </button>
                  ))}
                </div>
                <motion.button
                  className="flex w-full items-center justify-center rounded-xl py-3 mt-3 text-[15px] font-semibold text-white disabled:opacity-50"
                  disabled={!selected_storage || is_action_loading}
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={() => {
                    const addon = STORAGE_ADDONS.find(
                      (a) => a.id === selected_storage,
                    );

                    if (addon) {
                      set_checkout_addon(addon);
                      set_show_addon_checkout(true);
                    }
                  }}
                >
                  {t("settings.add_storage")}
                </motion.button>
              </div>
            </SettingsGroup>

            <div ref={plans_ref}>
              <SettingsGroup title={t("settings.available_plans")}>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1 p-1 rounded-xl bg-[var(--mobile-bg-card-hover)] mb-4">
                    <button
                      className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors ${
                        billing_period === "monthly"
                          ? "bg-[var(--mobile-bg-card)] text-[var(--text-primary)] shadow-sm"
                          : "text-[var(--text-muted)]"
                      }`}
                      type="button"
                      onClick={() => set_billing_period("monthly")}
                    >
                      {t("settings.billing_monthly")}
                    </button>
                    <button
                      className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors ${
                        billing_period === "yearly"
                          ? "bg-[var(--mobile-bg-card)] text-[var(--text-primary)] shadow-sm"
                          : "text-[var(--text-muted)]"
                      }`}
                      type="button"
                      onClick={() => set_billing_period("yearly")}
                    >
                      {t("settings.billing_yearly")}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {PLAN_TIERS.map((tier, tier_index) => {
                      const current_plan_code = subscription?.plan.code;
                      const is_current = current_plan_code === tier.id;
                      const current_tier_index = PLAN_TIERS.findIndex(
                        (t) => t.id === current_plan_code,
                      );
                      const is_downgrade =
                        current_tier_index > -1 &&
                        tier_index < current_tier_index;

                      return (
                        <div
                          key={tier.id}
                          className="rounded-2xl overflow-hidden"
                          style={{
                            border: `2px solid ${is_current ? "#3b82f6" : "var(--border-primary)"}`,
                            backgroundColor: "var(--mobile-bg-card-hover)",
                          }}
                        >
                          <div
                            className="px-4 pt-4 pb-3 text-center"
                            style={{
                              background: "transparent",
                            }}
                          >
                            {is_current && (
                              <span
                                className="inline-flex px-3 py-1 rounded-full text-[11px] font-medium mb-2"
                                style={{
                                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                                  color: "var(--color-info)",
                                  border: "1px solid rgba(59, 130, 246, 0.25)",
                                }}
                              >
                                {t("settings.current_plan")}
                              </span>
                            )}
                            <h4 className="text-[17px] font-bold text-[var(--text-primary)]">
                              {tier.name}
                            </h4>
                            <div className="mt-1.5">
                              <span className="text-[28px] font-bold text-[var(--text-primary)]">
                                {format_price(
                                  billing_period === "monthly"
                                    ? tier.monthly_cents
                                    : tier.yearly_cents,
                                )}
                              </span>
                              <span className="text-[13px] text-[var(--text-muted)]">
                                {billing_period === "monthly"
                                  ? t("settings.per_month_short")
                                  : t("settings.per_year_short")}
                              </span>
                            </div>
                            {billing_period === "monthly" ? (
                              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                {format_price(tier.yearly_cents)}
                                {t("settings.per_year_short")} ·{" "}
                                {t("settings.save_yearly", {
                                  amount: format_price(tier.savings_cents),
                                })}
                              </p>
                            ) : (
                              <p
                                className="text-[11px] font-medium mt-1"
                                style={{ color: "var(--color-success)" }}
                              >
                                {t("settings.save_yearly", {
                                  amount: format_price(tier.savings_cents),
                                })}
                              </p>
                            )}
                            <motion.button
                              className="flex w-full items-center justify-center rounded-xl py-2.5 mt-3 text-[14px] font-semibold text-white disabled:opacity-50"
                              disabled={is_action_loading || is_current}
                              style={
                                is_current
                                  ? {
                                      background: "var(--mobile-bg-card)",
                                      color: "var(--text-muted)",
                                      border: "1px solid var(--border-primary)",
                                    }
                                  : {
                                      background: "var(--mobile-bg-card)",
                                      color: "var(--text-primary)",
                                      border: "1px solid var(--border-primary)",
                                    }
                              }
                              type="button"
                              onClick={() => {
                                if (is_current) return;
                                const api_plan = plans.find(
                                  (p) => p.code === tier.id,
                                );

                                if (api_plan) {
                                  set_selected_plan(api_plan);
                                  set_show_checkout_modal(true);
                                } else {
                                  show_toast(
                                    t("settings.plans_coming_soon"),
                                    "info",
                                  );
                                }
                              }}
                            >
                              {is_current
                                ? t("settings.current_plan")
                                : is_downgrade
                                  ? t("settings.downgrade")
                                  : t("settings.subscribe")}
                            </motion.button>
                          </div>

                          <div className="px-4 pb-4 pt-3 border-t border-[var(--border-primary)]">
                            {tier.id !== "star" && (
                              <p
                                className="text-[11px] font-medium pb-1"
                                style={{ color: "var(--color-info)" }}
                              >
                                {tier.id === "nova"
                                  ? t("settings.all_star_features")
                                  : t("settings.all_nova_features")}
                              </p>
                            )}
                            <div className="space-y-2">
                              {plan_features[tier.id]?.map((feature, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2"
                                >
                                  <CheckIcon
                                    className="w-3.5 h-3.5 flex-shrink-0 text-brand"
                                    strokeWidth={2.5}
                                  />
                                  <span className="text-[12px] text-[var(--text-secondary)]">
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
                </div>
              </SettingsGroup>
            </div>

            {history.length > 0 && (
              <SettingsGroup title={t("settings.billing_history")}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-[var(--text-primary)]">
                        {item.description ||
                          item.plan_name ||
                          t("settings.payment")}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {format_date(item.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          item.status === "paid"
                            ? "bg-green-500/20 text-green-500"
                            : item.status === "failed"
                              ? "bg-red-500/20 text-red-500"
                              : "bg-yellow-500/20 text-yellow-500"
                        }`}
                      >
                        {t(`settings.invoice_status_${item.status}` as any)}
                      </span>
                      <p className="text-[14px] font-medium text-[var(--text-primary)]">
                        {format_price(item.amount_cents, item.currency)}
                      </p>
                      {item.invoice_pdf_url && (
                        <a
                          className="text-[12px] text-brand"
                          href={item.invoice_pdf_url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {t("settings.pdf")}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </SettingsGroup>
            )}

            <SettingsGroup
              title={
                <span className="flex items-center gap-2">
                  <UserGroupIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
                  {t("settings.referral_program")}
                </span>
              }
            >
              <div className="px-4 py-3">
                <p className="text-xs text-txt-muted mb-3">
                  {t("settings.referral_program_description")}
                </p>

                {referral_info && referral_info.referral_code ? (
                  <>
                    <div className="mb-3">
                      <p className="text-xs text-txt-muted mb-1.5">
                        {t("settings.your_referral_link")}
                      </p>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          className="flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none"
                          value={referral_info.referral_link}
                        />
                        <button
                          className="h-9 px-3 text-sm rounded-lg border border-edge-secondary text-txt-primary flex items-center gap-1.5 active:scale-95 transition-transform"
                          onClick={() => {
                            navigator.clipboard.writeText(referral_info.referral_link);
                            show_toast(t("settings.link_copied"), "success");
                          }}
                        >
                          <ClipboardDocumentIcon className="w-4 h-4" />
                          {t("settings.copy_link")}
                        </button>
                      </div>
                      <button
                        className="w-full mt-2 h-9 px-3 text-sm rounded-lg border border-edge-secondary text-txt-primary flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        disabled={is_sending_referral}
                        onClick={handle_send_referral}
                      >
                        {is_sending_referral ? (
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <EnvelopeIcon className="w-4 h-4" />
                        )}
                        {t("settings.send_referral_to_contacts")}
                      </button>
                      <p className="text-xs text-txt-muted mt-2">
                        {t("settings.referral_reward_info")}
                      </p>
                      <p className="text-xs text-txt-muted mt-1">
                        {t("settings.referral_commission_info", {
                          percent: String(referral_info.commission_percent || 5),
                        })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
                        <p className="text-lg font-bold text-txt-primary">
                          {referral_info.total_referrals}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.total_referrals")}
                        </p>
                      </div>
                      <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
                        <p className="text-lg font-bold text-yellow-500">
                          {referral_info.pending_referrals}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.pending_referrals")}
                        </p>
                      </div>
                      <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
                        <p className="text-lg font-bold text-green-500">
                          {referral_info.completed_referrals}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.completed_referrals")}
                        </p>
                      </div>
                      <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
                        <p className="text-lg font-bold text-txt-primary">
                          {format_price(
                            (referral_info.credits_earned_cents || 0) +
                              (referral_info.commission_earned_cents || 0),
                          )}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.total_earned")}
                        </p>
                      </div>
                    </div>

                    {referral_history_list.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-txt-secondary mb-2">
                          {t("settings.referral_history")}
                        </p>
                        <div className="rounded-lg border overflow-hidden border-edge-secondary">
                          {referral_history_list.map((ref_item) => (
                            <div
                              key={ref_item.id}
                              className="flex items-center justify-between px-4 py-2.5"
                            >
                              <div>
                                <p className="text-sm text-txt-primary">
                                  {ref_item.referee_email_masked}
                                </p>
                                <p className="text-xs mt-0.5 text-txt-muted">
                                  {format_date(ref_item.created_at)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                                    ref_item.status === "completed"
                                      ? "bg-green-500/20 text-green-500"
                                      : "bg-yellow-500/20 text-yellow-500"
                                  }`}
                                >
                                  {ref_item.status === "completed"
                                    ? t("settings.referral_status_completed")
                                    : t("settings.referral_status_pending")}
                                </span>
                                {ref_item.referrer_credit_cents > 0 && (
                                  <p className="text-sm font-medium text-green-500">
                                    +{format_price(ref_item.referrer_credit_cents)}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {referral_history_list.length === 0 && (
                      <p className="text-xs text-txt-muted text-center py-3">
                        {t("settings.no_referrals_yet")}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-txt-secondary">
                      {t("settings.referral_loading")}
                    </p>
                  </div>
                )}
              </div>
            </SettingsGroup>
          </>
        )}
      </div>

      <AlertDialog
        open={show_cancel_dialog}
        onOpenChange={(open) => {
          set_show_cancel_dialog(open);
          if (!open) {
            set_cancel_password("");
            set_cancel_password_error("");
            set_show_cancel_password(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.cancel_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.cancel_confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="block text-sm font-medium text-txt-secondary mb-2">
              {t("settings.cancel_enter_password")}
            </label>
            <div className="relative">
              <Input
                className="w-full pr-10"
                placeholder={t("settings.cancel_password_placeholder")}
                status={cancel_password_error ? "error" : "default"}
                type={show_cancel_password ? "text" : "password"}
                value={cancel_password}
                onChange={(e) => {
                  set_cancel_password(e.target.value);
                  set_cancel_password_error("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handle_cancel();
                }}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-txt-muted hover:text-txt-secondary"
                tabIndex={-1}
                type="button"
                onClick={() => set_show_cancel_password(!show_cancel_password)}
              >
                {show_cancel_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            {cancel_password_error && (
              <p
                className="text-xs mt-1.5"
                style={{ color: "var(--destructive)" }}
              >
                {cancel_password_error}
              </p>
            )}
          </div>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel className="flex-1">
              {t("settings.keep_plan")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive flex-1"
              disabled={!cancel_password.trim()}
              onClick={(e) => {
                e.preventDefault();
                handle_cancel();
              }}
            >
              {is_action_loading
                ? t("settings.cancelling")
                : t("settings.cancel_confirm_button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selected_plan && (
        <CheckoutModal
          billing_interval={
            billing_period === "yearly"
              ? "year"
              : billing_period === "biennial"
                ? "biennial"
                : "month"
          }
          currency="usd"
          on_close={() => {
            set_show_checkout_modal(false);
            set_selected_plan(null);
          }}
          on_success={async () => {
            set_show_checkout_modal(false);
            set_selected_plan(null);
            load_data();
          }}
          open={show_checkout_modal}
          plan_code={selected_plan.code}
          plan_name={selected_plan.name}
          price_cents={
            billing_period === "yearly"
              ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                  ?.yearly_cents || selected_plan.price_cents
              : billing_period === "biennial"
                ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.biennial_cents || selected_plan.price_cents
                : PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.monthly_cents || selected_plan.price_cents
          }
          price_display={format_price(
            billing_period === "yearly"
              ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                  ?.yearly_cents || selected_plan.price_cents
              : billing_period === "biennial"
                ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.biennial_cents || selected_plan.price_cents
                : PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.monthly_cents || selected_plan.price_cents,
          )}
        />
      )}

      {checkout_addon && (
        <CheckoutModal
          addon_id={checkout_addon.id}
          billing_interval="month"
          currency="usd"
          on_close={() => {
            set_show_addon_checkout(false);
            set_checkout_addon(null);
          }}
          on_success={async () => {
            set_show_addon_checkout(false);
            set_checkout_addon(null);
            request_cache.invalidate("/payments/v1");
            request_cache.invalidate("/sync/v1");
            invalidate_mail_stats();
            await load_data();
          }}
          open={show_addon_checkout}
          plan_code="addon"
          plan_name={checkout_addon.label}
          price_cents={checkout_addon.price_cents}
          price_display={format_price(checkout_addon.price_cents)}
        />
      )}

      <PaymentMethodsModal
        on_close={() => set_show_payment_methods(false)}
        open={show_payment_methods}
      />
    </div>
  );
}
