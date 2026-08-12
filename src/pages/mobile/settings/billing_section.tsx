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

import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  CheckIcon,
  XCircleIcon,
  UserGroupIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader } from "./shared";
import {
  PLAN_TIERS,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";

import { Spinner } from "@/components/ui/spinner";
import { CreditsSection } from "@/components/settings/billing/credits_section";
import { CryptoResumeBanner } from "@/components/settings/billing/crypto_resume_banner";
import { show_toast } from "@/components/toast/simple_toast";
import {
  build_referral_invite_url,
  format_storage,
  format_price,
  format_date,
} from "@/services/api/billing";
import { render_billing_dialogs } from "./billing_dialogs";
import { use_billing_section } from "./use_billing_section";

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
    set_show_addon_method_modal,
    set_addon_method_target,
    preferred_currency,
    billing_period,
    set_billing_period,
    referral_info,
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
    handle_reactivate,
    handle_select_plan,
    handle_crypto_renew,
    plans_ref,
    scroll_to_plans,
    is_paid_plan,
    is_crypto_sub,
  } = state;

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
              <CryptoResumeBanner class_name="mb-4" />
              <div
                className="relative overflow-hidden rounded-2xl p-5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent-mix-b70, #295bac) 0%, var(--accent-mix-b85, #326fd1) 40%, var(--accent-color-hover) 70%, var(--accent-color) 100%)",
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[14px] font-semibold bg-white text-blue-900"
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
                      {is_paid_plan &&
                        subscription.active_discount_description && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-500">
                            {subscription.active_discount_description}
                          </span>
                        )}
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
                          {format_price(
                            convert_cents(
                              subscription.plan.price_cents,
                              preferred_currency,
                            ),
                            preferred_currency,
                          )}
                          <span className="text-[11px] font-normal text-[var(--text-muted)]">
                            {subscription.plan.billing_period?.startsWith("year")
                              ? t("settings.per_year_short")
                              : t("settings.per_month_short")}
                          </span>
                        </span>
                        {is_crypto_sub ? (
                          <>
                            <p className="text-[11px] mt-0.5 text-[var(--text-muted)]">
                              {t("settings.crypto_paid_until", {
                                date: format_date(
                                  subscription.paid_until ||
                                    subscription.current_period_end,
                                ),
                              })}
                            </p>
                            <div className="mt-1.5 flex justify-end">
                              <span
                                className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold text-center"
                                style={{
                                  backgroundColor: "var(--color-warning)",
                                  color: "#1c1400",
                                }}
                              >
                                {t("settings.crypto_no_renew_notice")}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-[11px] mt-0.5 text-[var(--text-muted)]">
                            {subscription.cancel_at_period_end
                              ? t("settings.cancels")
                              : t("settings.renews")}{" "}
                            {format_date(subscription.current_period_end)}
                          </p>
                        )}
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

                  {is_paid_plan && is_crypto_sub && (
                    <button
                      className="mb-2 w-full rounded-[14px] bg-[var(--mobile-bg-card-hover)] py-2.5 text-[14px] font-medium text-[var(--text-primary)] disabled:opacity-50"
                      disabled={is_action_loading}
                      type="button"
                      onClick={handle_crypto_renew}
                    >
                      {t("settings.crypto_renew_link")}
                    </button>
                  )}

                  {is_paid_plan ? (
                    <div className="flex gap-2 pt-2 border-t border-[var(--border-primary)]">
                      <button
                        className="flex-1 rounded-[14px] bg-[var(--mobile-bg-card-hover)] py-2.5 text-[14px] font-medium text-[var(--text-primary)] disabled:opacity-50"
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
                              "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
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
                          className="flex-1 rounded-[14px] py-2.5 text-[14px] font-medium text-[var(--color-danger,#ef4444)] disabled:opacity-50"
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
                          "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
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
                  {available_addons.map((addon) => (
                    <button
                      key={addon.id}
                      className="relative rounded-[14px] p-3 text-left transition-all"
                      style={{
                        backgroundColor:
                          selected_storage === addon.id
                            ? "color-mix(in srgb, var(--accent-color) 6%, transparent)"
                            : "var(--mobile-bg-card-hover)",
                        border: `1.5px solid ${selected_storage === addon.id ? "var(--accent-color)" : "transparent"}`,
                      }}
                      type="button"
                      onClick={() =>
                        set_selected_storage(
                          selected_storage === addon.id ? null : addon.id,
                        )
                      }
                    >
                      <p className="text-[15px] font-bold text-[var(--text-primary)]">
                        {addon.name}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        {format_price(
                          convert_cents(addon.price_cents, preferred_currency),
                          preferred_currency,
                        )}
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
                      "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={() => {
                    const addon = available_addons.find(
                      (a) => a.id === selected_storage,
                    );

                    if (addon) {
                      set_addon_method_target(addon);
                      set_show_addon_method_modal(true);
                    }
                  }}
                >
                  {t("common.buy_more_storage")}
                </motion.button>
              </div>
            </SettingsGroup>

            <div ref={plans_ref}>
              <SettingsGroup title={t("settings.available_plans")}>
                <div className="px-4 py-3">
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
                            border: `2px solid ${is_current ? "var(--mobile-accent)" : "var(--border-primary)"}`,
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
                                  handle_select_plan(api_plan);
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

                  {preferred_currency !== "usd" && (
                    <p className="mt-3 text-[11px] text-center text-[var(--text-muted)]">
                      {t("settings.prices_converted_note")}
                    </p>
                  )}
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

            <div className="px-4 pt-2">
              <CreditsSection
                credit_balance={credit_balance}
                set_credit_balance={set_credit_balance}
                preferred_currency={preferred_currency}
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
                          className="flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none"
                          value={build_referral_invite_url(
                            referral_info.referral_code,
                          )}
                        />
                        <button
                          className="h-9 px-3 text-sm rounded-[14px] border border-edge-secondary text-txt-primary flex items-center gap-1.5 active:scale-95 transition-transform"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              build_referral_invite_url(
                                referral_info.referral_code,
                              ),
                            );
                            show_toast(t("settings.link_copied"), "success");
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
                          <p className="text-xs text-txt-muted mt-2">
                            {t("settings.referral_reward_info")}
                          </p>
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

      {render_billing_dialogs(state)}
    </div>
  );
}
