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

import type { use_billing_section } from "./use_billing_section";

import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { clamp_password } from "@/services/sanitize";
import {
  PLAN_TIERS,
  convert_cents,
  is_crypto_provider,
} from "@/components/settings/billing/billing_constants";
import { format_price } from "@/services/api/billing";
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
import { CancelReasonStep } from "@/components/settings/billing/cancel_reason_step";
import { CancelImpactStep } from "@/components/settings/billing/cancel_impact_step";
import { PaymentMethodsModal } from "@/components/settings/payment_methods_modal";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { PlanChangeConfirmModal } from "@/components/settings/billing/plan_change_confirm_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { CryptoAddonTermModal } from "@/components/settings/billing/crypto_addon_term_modal";

export function render_billing_dialogs(
  state: ReturnType<typeof use_billing_section>,
) {
  const {
    t,
    subscription,
    is_action_loading,
    show_cancel_dialog,
    set_show_cancel_dialog,
    cancel_password,
    set_cancel_password,
    cancel_password_error,
    set_cancel_password_error,
    show_cancel_password,
    set_show_cancel_password,
    cancel_totp_code,
    set_cancel_totp_code,
    cancel_totp_required,
    cancel_reason,
    set_cancel_reason,
    cancel_reason_text,
    set_cancel_reason_text,
    cancel_step,
    set_cancel_step,
    is_verifying_password,
    cancel_impact,
    is_impact_loading,
    cancel_effective_date,
    handle_password_continue,
    show_payment_methods,
    set_show_payment_methods,
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
    billing_period,
    credit_balance,
    pending_family_tier,
    set_pending_family_tier,
    crypto_family_tier,
    set_crypto_family_tier,
    handle_family_card,
    handle_family_crypto,
    addon_to_cancel,
    set_addon_to_cancel,
    handle_cancel_addon,
    handle_cancel,
    handle_pay_with_card,
    handle_confirm_plan_change,
    crypto_term_prices_for,
    handle_pay_with_crypto,
    handle_addon_pay_card,
    handle_addon_pay_crypto,
  } = state;

  return (
    <>
      <AlertDialog
        open={show_cancel_dialog}
        onOpenChange={(open) => {
          set_show_cancel_dialog(open);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancel_step === "reason"
                ? t("settings.cancel_reason_title")
                : cancel_step === "impact"
                  ? t("settings.cancel_impact_title")
                  : cancel_step === "confirm"
                    ? t("settings.cancel_final_title")
                    : t("settings.cancel_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancel_step === "reason"
                ? t("settings.cancel_reason_description")
                : cancel_step === "impact"
                  ? cancel_effective_date
                    ? t("settings.cancel_impact_description", {
                        date: cancel_effective_date,
                      })
                    : t("settings.cancel_impact_description_nodate")
                  : cancel_step === "confirm"
                    ? cancel_effective_date
                      ? t("settings.cancel_final_description", {
                          date: cancel_effective_date,
                          plan:
                            cancel_impact?.plan_name ??
                            subscription?.plan.name ??
                            "",
                        })
                      : t("settings.cancel_final_description_nodate", {
                          plan:
                            cancel_impact?.plan_name ??
                            subscription?.plan.name ??
                            "",
                        })
                    : t("settings.cancel_confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancel_step === "reason" ? (
            <CancelReasonStep
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              on_continue={() => set_cancel_step("impact")}
              on_skip={() => set_cancel_step("impact")}
              reason={cancel_reason}
              reason_text={cancel_reason_text}
              set_reason={set_cancel_reason}
              set_reason_text={set_cancel_reason_text}
            />
          ) : cancel_step === "impact" ? (
            <CancelImpactStep
              impact={cancel_impact}
              is_loading={is_impact_loading}
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              on_back={() => set_cancel_step("reason")}
              on_continue={() => set_cancel_step("password")}
            />
          ) : cancel_step === "confirm" ? (
            <AlertDialogFooter className="flex-row gap-3">
              <AlertDialogCancel className="flex-1">
                {t("settings.keep_plan")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="aster_btn_destructive flex-1"
                disabled={is_action_loading}
                onClick={(e) => {
                  e.preventDefault();
                  handle_cancel();
                }}
              >
                {is_action_loading
                  ? t("settings.cancelling")
                  : t("settings.cancel_final_confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          ) : (
            <>
              <div className="py-2">
                <label className="block text-sm font-medium text-txt-secondary mb-2">
                  {t("settings.cancel_enter_password")}
                </label>
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    className="w-full pe-10"
                    maxLength={128}
                    placeholder={t("settings.cancel_password_placeholder")}
                    status={cancel_password_error ? "error" : "default"}
                    type={show_cancel_password ? "text" : "password"}
                    value={cancel_password}
                    onChange={(e) => {
                      set_cancel_password(clamp_password(e.target.value));
                      set_cancel_password_error("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handle_password_continue();
                      }
                    }}
                  />
                  <button
                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-txt-muted hover:text-txt-secondary"
                    tabIndex={-1}
                    type="button"
                    onClick={() =>
                      set_show_cancel_password(!show_cancel_password)
                    }
                  >
                    {show_cancel_password ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {cancel_totp_required && (
                  <div className="mt-4">
                    <label
                      className="block text-sm font-medium text-txt-secondary mb-2"
                      htmlFor="mobile-cancel-totp-code"
                    >
                      {t("settings.authenticator_code")}
                    </label>
                    <Input
                      autoComplete="one-time-code"
                      className="w-full text-center tracking-[0.5em]"
                      id="mobile-cancel-totp-code"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      status={cancel_password_error ? "error" : "default"}
                      type="text"
                      value={cancel_totp_code}
                      onChange={(e) => {
                        set_cancel_totp_code(
                          e.target.value.replace(/\D/g, "").slice(0, 6),
                        );
                        set_cancel_password_error("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handle_password_continue();
                        }
                      }}
                    />
                  </div>
                )}
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
                  className="flex-1"
                  disabled={
                    !cancel_password.trim() ||
                    is_verifying_password ||
                    (cancel_totp_required && cancel_totp_code.length !== 6)
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    handle_password_continue();
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    {is_verifying_password && <Spinner size="xs" />}
                    {t("settings.cancel_reason_continue")}
                  </span>
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

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
              subscription.has_stripe_subscription !== false
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

      {pending_family_tier && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          on_choose_card={handle_family_card}
          on_choose_crypto={handle_family_crypto}
          on_close={() => set_pending_family_tier(null)}
          open={!!pending_family_tier}
          plan_name={pending_family_tier.name}
        />
      )}

      {crypto_family_tier && (
        <CryptoTermModal
          is_open={!!crypto_family_tier}
          monthly_price_cents={crypto_family_tier.monthly_cents}
          on_close={() => set_crypto_family_tier(null)}
          plan_code={crypto_family_tier.id}
          plan_name={crypto_family_tier.name}
          preferred_currency={preferred_currency}
          yearly_price_cents={crypto_family_tier.yearly_cents}
        />
      )}

      {crypto_addon && (
        <CryptoAddonTermModal
          addon_id={crypto_addon.id}
          addon_name={crypto_addon.name}
          is_open={show_crypto_addon_modal}
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

      <AlertDialog
        open={!!addon_to_cancel}
        onOpenChange={(open) => {
          if (!open) set_addon_to_cancel(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.confirm_cancel_addon")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.confirm_cancel_addon_description")}
              {addon_to_cancel && (
                <span className="mt-2 block font-medium text-[var(--text-primary)]">
                  {addon_to_cancel.size_label} -{" "}
                  {format_price(
                    convert_cents(
                      addon_to_cancel.price_cents,
                      preferred_currency,
                    ),
                    preferred_currency,
                  )}
                  {t("settings.per_month_short")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive max-sm:flex-1"
              disabled={is_action_loading}
              onClick={(e) => {
                e.preventDefault();
                handle_cancel_addon();
              }}
            >
              {is_action_loading
                ? t("settings.cancelling")
                : t("settings.confirm_cancel_addon")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentMethodsModal
        on_close={() => set_show_payment_methods(false)}
        open={show_payment_methods}
      />
    </>
  );
}
