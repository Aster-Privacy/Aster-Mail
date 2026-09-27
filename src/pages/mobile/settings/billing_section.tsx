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
import { motion } from "framer-motion";
import {
  CheckIcon,
  UserGroupIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader } from "./shared";
import { render_billing_dialogs } from "./billing_dialogs";
import { use_billing_section } from "./use_billing_section";

import { format_bytes } from "@/lib/utils";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  FAMILY_PLAN_DUO_FEATURES,
  FAMILY_PLAN_FAMILY_FEATURES,
  SUPPORTED_CURRENCIES,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { Spinner } from "@/components/ui/spinner";
import { CreditsSection } from "@/components/settings/billing/credits_section";
import {
  CurrentPlanCard,
  CurrentPlanNotices,
} from "@/components/settings/billing/current_plan_card";
import { BillingIconBox } from "@/components/settings/billing/billing_layout";
import { StorageAddonsSection } from "@/components/settings/billing/storage_addons_section";
import { BillingHistorySection } from "@/components/settings/billing/billing_history_section";
import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import { AcademicDiscountSection } from "@/components/settings/billing/academic_discount_section";
import { CryptoResumeBanner } from "@/components/settings/billing/crypto_resume_banner";
import { ResumeCheckoutCard } from "@/components/settings/billing/resume_checkout_card";
import { WinBackOfferCard } from "@/components/settings/billing/win_back_offer_card";
import { show_toast } from "@/components/toast/simple_toast";
import {
  build_referral_invite_url,
  format_price,
  format_date,
} from "@/services/api/billing";
import { copy_text } from "@/utils/copy_text";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";

export function BillingSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  use_currency_rates();

  const state = use_billing_section();
  const {
    t,
    subscription,
    plans,
    history,
    is_loading,
    is_action_loading,
    set_show_cancel_dialog,
    selected_storage,
    set_selected_storage,
    available_addons,
    active_addons,
    academic_status,
    refresh_academic_status,
    set_addon_to_cancel,
    set_show_addon_method_modal,
    set_addon_method_target,
    preferred_currency,
    handle_currency_change,
    billing_period,
    set_billing_period,
    current_billing_interval,
    plan_type,
    set_plan_type,
    handle_family_select,
    has_payment_failed,
    grace_days_remaining,
    referral_info,
    referral_history_list,
    subscription_load_failed,
    plans_load_failed,
    addons_load_failed,
    history_load_failed,
    referral_history_load_failed,
    load_data,
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
    handle_reactivate,
    handle_select_plan,
    handle_crypto_renew,
    plans_ref,
    scroll_to_plans,
    is_paid_plan,
    is_crypto_sub,
  } = state;
  const [show_plans, set_show_plans] = useState(false);
  const open_plans = () => {
    set_show_plans(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scroll_to_plans());
    });
  };

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
            <div className="space-y-8 px-4 pt-4">
              {!subscription && subscription_load_failed && (
                <LoadFailedNotice on_retry={() => void load_data()} />
              )}

              {subscription && (
                <CurrentPlanCard
                  current_billing_interval={current_billing_interval}
                  grace_days_remaining={grace_days_remaining}
                  has_payment_failed={has_payment_failed}
                  include_notices={false}
                  is_action_loading={is_action_loading}
                  is_over_limit={is_storage_over_limit}
                  on_manage_billing={handle_manage_billing}
                  on_manage_plan={() => set_show_plans((open) => !open)}
                  on_reactivate={handle_reactivate}
                  on_renew_with_crypto={handle_crypto_renew}
                  on_scroll_to_plans={open_plans}
                  on_toggle_plans={() => set_show_plans((open) => !open)}
                  plans_open={show_plans}
                  preferred_currency={preferred_currency}
                  show_storage={false}
                  storage_limit_bytes={storage_limit_bytes}
                  storage_percentage={storage_percentage}
                  storage_used_bytes={storage_used_bytes}
                  subscription={subscription}
                />
              )}

              {show_plans && (
                <div ref={plans_ref} className="-mx-4 -my-4">
                  <SettingsGroup title={t("settings.available_plans")}>
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 p-1 rounded-xl bg-[var(--mobile-bg-card-hover)] mb-3">
                        <button
                          className={`flex-1 rounded-[14px] py-2 text-[13px] font-medium transition-colors ${
                            plan_type === "individual"
                              ? "bg-[var(--mobile-bg-card)] text-[var(--text-primary)] shadow-sm"
                              : "text-[var(--text-muted)]"
                          }`}
                          type="button"
                          onClick={() => set_plan_type("individual")}
                        >
                          {t("settings.plan_type_individual")}
                        </button>
                        <button
                          className={`flex-1 rounded-[14px] py-2 text-[13px] font-medium transition-colors ${
                            plan_type === "family"
                              ? "bg-[var(--mobile-bg-card)] text-[var(--text-primary)] shadow-sm"
                              : "text-[var(--text-muted)]"
                          }`}
                          type="button"
                          onClick={() => set_plan_type("family")}
                        >
                          {t("settings.plan_type_family")}
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-1 p-1 rounded-xl bg-[var(--mobile-bg-card-hover)] mb-4">
                        <button
                          className={`flex-1 rounded-[14px] py-2 text-[13px] font-medium transition-colors ${
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
                          className={`flex-1 rounded-[14px] py-2 text-[13px] font-medium transition-colors ${
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

                      <div className="mb-4 flex items-center justify-center gap-2">
                        <p className="text-[12px] text-[var(--text-muted)]">
                          {preferred_currency === "usd"
                            ? t("settings.prices_in_usd_note")
                            : t("settings.prices_converted_note")}
                        </p>
                        <select
                          className="rounded-lg bg-[var(--mobile-bg-card-hover)] px-2 py-1 text-[12px] text-[var(--text-secondary)] outline-none"
                          value={preferred_currency}
                          onChange={(e) =>
                            handle_currency_change(e.target.value)
                          }
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {plan_type === "family" && (
                        <div className="space-y-3">
                          {FAMILY_PLAN_TIERS.map((tier) => {
                            const card_interval =
                              billing_period === "yearly"
                                ? "year"
                                : billing_period === "biennial"
                                  ? "biennial"
                                  : "month";
                            const is_same_plan =
                              subscription?.plan.code === tier.id;
                            const is_current =
                              is_same_plan &&
                              current_billing_interval === card_interval;
                            const is_interval_switch =
                              is_same_plan &&
                              current_billing_interval !== card_interval;
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
                              <div
                                key={tier.id}
                                className="rounded-2xl overflow-hidden"
                                style={{
                                  border: `2px solid ${is_current ? "var(--mobile-accent)" : "var(--border-primary)"}`,
                                  backgroundColor:
                                    "var(--mobile-bg-card-hover)",
                                }}
                              >
                                <div className="px-4 pt-4 pb-3 text-center">
                                  {is_current && (
                                    <span
                                      className="inline-flex px-3 py-1 rounded-full text-[11px] font-medium mb-2"
                                      style={{
                                        backgroundColor:
                                          "color-mix(in srgb, var(--accent-color) 10%, transparent)",
                                        color: "var(--color-info)",
                                        border:
                                          "1px solid color-mix(in srgb, var(--accent-color) 25%, transparent)",
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
                                        convert_cents(
                                          billing_period === "monthly"
                                            ? tier.monthly_cents
                                            : tier.yearly_cents,
                                          preferred_currency,
                                        ),
                                        preferred_currency,
                                      )}
                                    </span>
                                    <span className="text-[13px] text-[var(--text-muted)]">
                                      {billing_period === "monthly"
                                        ? t("settings.per_month_short")
                                        : t("settings.per_year_short")}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                    {tier.storage_label}
                                  </p>
                                  <motion.button
                                    className="flex w-full items-center justify-center rounded-xl py-2.5 mt-3 text-[14px] font-semibold disabled:opacity-50"
                                    disabled={is_action_loading || is_current}
                                    style={{
                                      background: "var(--mobile-bg-card)",
                                      color: is_current
                                        ? "var(--text-muted)"
                                        : "var(--text-primary)",
                                      border: "1px solid var(--border-primary)",
                                    }}
                                    type="button"
                                    onClick={() => {
                                      if (is_current) return;
                                      handle_family_select(tier);
                                    }}
                                  >
                                    {is_current
                                      ? t("settings.current_plan")
                                      : is_interval_switch
                                        ? card_interval === "year"
                                          ? t("settings.switch_to_yearly")
                                          : t("settings.switch_to_monthly")
                                        : t("settings.subscribe")}
                                  </motion.button>
                                </div>

                                <div className="px-4 pb-4 pt-3 border-t border-[var(--border-primary)]">
                                  <div className="space-y-2">
                                    {features.map((feature, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2"
                                      >
                                        <CheckIcon
                                          className="w-3.5 h-3.5 flex-shrink-0 text-brand"
                                          strokeWidth={2.5}
                                        />
                                        <span className="text-[12px] text-[var(--text-secondary)]">
                                          {feature.label}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {plan_type === "individual" && (
                        <div className="space-y-3">
                          {PLAN_TIERS.map((tier, tier_index) => {
                            const current_plan_code = subscription?.plan.code;
                            const card_interval =
                              billing_period === "yearly"
                                ? "year"
                                : billing_period === "biennial"
                                  ? "biennial"
                                  : "month";
                            const is_same_plan = current_plan_code === tier.id;
                            const is_current =
                              is_same_plan &&
                              current_billing_interval === card_interval;
                            const is_interval_switch =
                              is_same_plan &&
                              current_billing_interval !== card_interval;
                            const current_tier_index = PLAN_TIERS.findIndex(
                              (t) => t.id === current_plan_code,
                            );
                            const is_downgrade =
                              !is_same_plan &&
                              current_tier_index > -1 &&
                              tier_index < current_tier_index;

                            return (
                              <div
                                key={tier.id}
                                className="rounded-2xl overflow-hidden"
                                style={{
                                  border: `2px solid ${is_current ? "var(--mobile-accent)" : "var(--border-primary)"}`,
                                  backgroundColor:
                                    "var(--mobile-bg-card-hover)",
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
                                        backgroundColor:
                                          "color-mix(in srgb, var(--accent-color) 10%, transparent)",
                                        color: "var(--color-info)",
                                        border:
                                          "1px solid color-mix(in srgb, var(--accent-color) 25%, transparent)",
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
                                        convert_cents(
                                          billing_period === "monthly"
                                            ? tier.monthly_cents
                                            : tier.yearly_cents,
                                          preferred_currency,
                                        ),
                                        preferred_currency,
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
                                      {format_price(
                                        convert_cents(
                                          tier.yearly_cents,
                                          preferred_currency,
                                        ),
                                        preferred_currency,
                                      )}
                                      {t("settings.per_year_short")} ·{" "}
                                      {t("settings.save_yearly", {
                                        amount: format_price(
                                          convert_cents(
                                            tier.savings_cents,
                                            preferred_currency,
                                          ),
                                          preferred_currency,
                                        ),
                                      })}
                                    </p>
                                  ) : (
                                    <p
                                      className="text-[11px] font-medium mt-1"
                                      style={{ color: "var(--color-success)" }}
                                    >
                                      {t("settings.save_yearly", {
                                        amount: format_price(
                                          convert_cents(
                                            tier.savings_cents,
                                            preferred_currency,
                                          ),
                                          preferred_currency,
                                        ),
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
                                            border:
                                              "1px solid var(--border-primary)",
                                          }
                                        : {
                                            background: "var(--mobile-bg-card)",
                                            color: "var(--text-primary)",
                                            border:
                                              "1px solid var(--border-primary)",
                                          }
                                    }
                                    type="button"
                                    onClick={() => {
                                      if (is_current) return;
                                      const api_plan = plans.find(
                                        (p) => p.code === tier.id,
                                      );

                                      if (api_plan) {
                                        handle_select_plan(api_plan);
                                      } else if (plans_load_failed) {
                                        show_toast(
                                          t(
                                            "common.something_went_wrong_try_again",
                                          ),
                                          "error",
                                        );
                                        void load_data();
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
                                      : is_interval_switch
                                        ? card_interval === "year"
                                          ? t("settings.switch_to_yearly")
                                          : t("settings.switch_to_monthly")
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
                                    {plan_features[tier.id]?.map(
                                      (feature, i) => (
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
                                      ),
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {preferred_currency !== "usd" && (
                        <p className="mt-3 text-[11px] text-center text-[var(--text-muted)]">
                          {t("settings.prices_converted_note")}
                        </p>
                      )}
                    </div>
                  </SettingsGroup>
                  {is_paid_plan &&
                    subscription &&
                    (!subscription.cancel_at_period_end || is_crypto_sub) && (
                      <div className="px-4 pt-2">
                        {subscription.cancel_at_period_end ? (
                          <button
                            className="aster_btn aster_btn_secondary aster_btn_sm"
                            disabled={is_action_loading}
                            type="button"
                            onClick={handle_reactivate}
                          >
                            {t("settings.reactivate")}
                          </button>
                        ) : (
                          <button
                            className="text-sm font-medium disabled:opacity-50"
                            disabled={is_action_loading}
                            style={{ color: "var(--color-danger)" }}
                            type="button"
                            onClick={() => set_show_cancel_dialog(true)}
                          >
                            {t("settings.cancel_plan")}
                          </button>
                        )}
                      </div>
                    )}
                </div>
              )}

              <CreditsSection
                credit_balance={credit_balance}
                payment_cell={
                  <div className="flex items-center gap-3 px-4 py-4">
                    <BillingIconBox icon={CreditCardIcon} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-txt-primary">
                        {t("settings.payment")}
                      </p>
                      <p className="truncate text-xs text-txt-muted">
                        {is_crypto_sub
                          ? t("settings.checkout_method_crypto")
                          : is_paid_plan
                            ? t("settings.checkout_method_card")
                            : t("settings.payment_methods_description")}
                      </p>
                    </div>
                    <button
                      className="aster_btn aster_btn_secondary aster_btn_sm flex-shrink-0"
                      disabled={is_action_loading}
                      type="button"
                      onClick={handle_manage_billing}
                    >
                      {t("common.update")}
                    </button>
                  </div>
                }
                preferred_currency={preferred_currency}
                set_credit_balance={set_credit_balance}
              />

              <div className="space-y-3">
                {addons_load_failed && available_addons.length === 0 && (
                  <LoadFailedNotice on_retry={() => void load_data()} />
                )}
                <StorageAddonsSection
                  active_addons={active_addons}
                  available_addons={available_addons}
                  is_action_loading={is_action_loading}
                  is_over_limit={is_storage_over_limit}
                  on_cancel_addon={(addon) => set_addon_to_cancel(addon)}
                  on_purchase_addon={(addon) => {
                    set_addon_method_target(addon);
                    set_show_addon_method_modal(true);
                  }}
                  preferred_currency={preferred_currency}
                  selected_storage={selected_storage}
                  set_selected_storage={set_selected_storage}
                  storage_limit_bytes={storage_limit_bytes}
                  storage_percentage={storage_percentage}
                  storage_used_bytes={storage_used_bytes}
                />
              </div>

              <div className="space-y-3 empty:hidden">
                <CurrentPlanNotices
                  grace_days_remaining={grace_days_remaining}
                  has_payment_failed={has_payment_failed}
                  is_action_loading={is_action_loading}
                  is_over_limit={is_storage_over_limit}
                  on_add_storage={scroll_to_storage_addons}
                  on_manage_billing={handle_manage_billing}
                  on_reactivate={handle_reactivate}
                  on_renew_with_crypto={handle_crypto_renew}
                  subscription={subscription}
                />
                <CryptoResumeBanner />
                <ResumeCheckoutCard
                  current_plan_code={subscription?.plan.code ?? null}
                />
                <WinBackOfferCard
                  offer={subscription?.pending_offer}
                  on_choose_plan={open_plans}
                />
              </div>

              <BillingHistorySection
                history={history}
                load_failed={history_load_failed}
                on_retry={() => void load_data()}
              />

              <AcademicDiscountSection
                academic_status={academic_status}
                refresh_academic_status={refresh_academic_status}
              />
            </div>

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
                          aria-label={t("settings.your_referral_link")}
                          className="flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none"
                          value={build_referral_invite_url(
                            referral_info.referral_code,
                          )}
                        />
                        <button
                          className="h-9 px-3 text-sm rounded-[14px] border border-edge-secondary text-txt-primary flex items-center gap-1.5 active:scale-95 transition-transform"
                          onClick={async () => {
                            if (
                              await copy_text(
                                build_referral_invite_url(
                                  referral_info.referral_code,
                                ),
                              )
                            ) {
                              show_toast(t("settings.link_copied"), "success");
                            } else {
                              show_toast(t("common.failed_to_copy"), "error");
                            }
                          }}
                        >
                          <ClipboardDocumentIcon className="w-4 h-4" />
                          {t("settings.copy_link")}
                        </button>
                      </div>
                      <button
                        className="w-full mt-2 h-9 px-3 text-sm rounded-[14px] border border-edge-secondary text-txt-primary flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
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
                      {!referral_info.is_affiliate && (
                        <>
                          {referral_info.bonus_bytes_per_referral > 0 && (
                            <p className="text-xs text-txt-muted mt-2">
                              {t("settings.referral_reward_info", {
                                amount: format_bytes(
                                  referral_info.bonus_bytes_per_referral,
                                ),
                                max: format_bytes(
                                  referral_info.bonus_bytes_max,
                                ),
                              })}
                            </p>
                          )}
                          <p className="text-xs text-txt-muted mt-1">
                            {t("settings.referral_commission_info", {
                              percent: String(
                                referral_info.commission_percent || 10,
                              ),
                            })}
                          </p>
                        </>
                      )}
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
                                  className={
                                    ref_item.status === "completed"
                                      ? "aster_badge aster_badge_green"
                                      : "aster_badge aster_badge_amber"
                                  }
                                >
                                  {ref_item.status === "completed"
                                    ? t("settings.referral_status_completed")
                                    : t("settings.referral_status_pending")}
                                </span>
                                {ref_item.referrer_credit_cents > 0 && (
                                  <p className="text-sm font-medium text-green-500">
                                    +
                                    {format_price(
                                      ref_item.referrer_credit_cents,
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {referral_history_list.length === 0 &&
                      referral_history_load_failed && (
                        <div className="py-3">
                          <LoadFailedNotice on_retry={() => void load_data()} />
                        </div>
                      )}

                    {referral_history_list.length === 0 &&
                      !referral_history_load_failed && (
                        <p className="text-xs text-txt-muted text-center py-3">
                          {t("settings.no_referrals_yet")}
                        </p>
                      )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-txt-secondary">
                      {state.referral_load_failed
                        ? t("common.something_went_wrong_try_again")
                        : t("settings.referral_loading")}
                    </p>
                  </div>
                )}
              </div>
            </SettingsGroup>
          </>
        )}
      </div>

      {render_billing_dialogs(state)}
    </div>
  );
}
