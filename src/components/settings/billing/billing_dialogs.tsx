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
import { useEffect, useRef, useState } from "react";
import {
  EyeIcon,
  EyeSlashIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clamp_password } from "@/services/sanitize";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
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
import {
  format_price,
  format_date,
  get_subscription,
  get_cancel_impact,
  cancel_storage_addon,
  activate_subscription,
  type CancelImpactResponse,
  type SubscriptionResponse,
  type AvailablePlan,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import {
  PLAN_TIERS,
  convert_cents,
  is_crypto_provider,
} from "@/components/settings/billing/billing_constants";
import {
  get_downgrade_offer,
  read_billing_interval,
  type DowngradeOffer,
} from "@/components/settings/billing/cancel_offer";
import { CancelOfferStep } from "@/components/settings/billing/cancel_offer_step";
import {
  CancelReasonStep,
  type CancelReason,
} from "@/components/settings/billing/cancel_reason_step";
import {
  CancelImpactStep,
  type CancelStep,
} from "@/components/settings/billing/cancel_impact_step";
import {
  clear_cancel_password_cache,
  verify_cancel_password,
} from "@/components/settings/billing/cancel_password";
import { use_i18n } from "@/lib/i18n/context";

interface BillingDialogsProps {
  academic_promo_code: string | null;
  subscription: SubscriptionResponse | null;
  set_subscription: React.Dispatch<
    React.SetStateAction<SubscriptionResponse | null>
  >;
  is_action_loading: boolean;
  set_is_action_loading: React.Dispatch<React.SetStateAction<boolean>>;
  show_cancel_dialog: boolean;
  set_show_cancel_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  cancel_password: string;
  set_cancel_password: React.Dispatch<React.SetStateAction<string>>;
  cancel_password_error: string;
  set_cancel_password_error: React.Dispatch<React.SetStateAction<string>>;
  show_cancel_password: boolean;
  set_show_cancel_password: React.Dispatch<React.SetStateAction<boolean>>;
  cancel_reason: CancelReason | null;
  set_cancel_reason: React.Dispatch<React.SetStateAction<CancelReason | null>>;
  cancel_reason_text: string;
  set_cancel_reason_text: React.Dispatch<React.SetStateAction<string>>;
  handle_cancel: () => void;
  show_checkout_modal: boolean;
  set_show_checkout_modal: React.Dispatch<React.SetStateAction<boolean>>;
  selected_plan: AvailablePlan | null;
  set_selected_plan: React.Dispatch<React.SetStateAction<AvailablePlan | null>>;
  billing_period: "monthly" | "yearly" | "biennial";
  preferred_currency: string;
  show_payment_methods: boolean;
  set_show_payment_methods: React.Dispatch<React.SetStateAction<boolean>>;
  show_manage_plan: boolean;
  set_show_manage_plan: React.Dispatch<React.SetStateAction<boolean>>;
  show_switch_billing_dialog: boolean;
  set_show_switch_billing_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  target_billing_interval: "month" | "year";
  yearly_savings: string | null;
  handle_switch_billing: () => void;
  show_addon_checkout: boolean;
  set_show_addon_checkout: React.Dispatch<React.SetStateAction<boolean>>;
  checkout_addon: StorageAddonItem | null;
  set_checkout_addon: React.Dispatch<
    React.SetStateAction<StorageAddonItem | null>
  >;
  show_cancel_addon_dialog: boolean;
  set_show_cancel_addon_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  addon_to_cancel: UserActiveAddon | null;
  set_addon_to_cancel: React.Dispatch<
    React.SetStateAction<UserActiveAddon | null>
  >;
  load_data: () => Promise<void>;
  on_switch_plan?: (offer: DowngradeOffer) => void;
}

export function BillingDialogs({
  academic_promo_code,
  subscription,
  set_subscription,
  is_action_loading,
  set_is_action_loading,
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
  handle_cancel,
  show_checkout_modal,
  set_show_checkout_modal,
  selected_plan,
  set_selected_plan,
  billing_period,
  preferred_currency,
  show_payment_methods,
  set_show_payment_methods,
  show_manage_plan,
  set_show_manage_plan,
  show_switch_billing_dialog,
  set_show_switch_billing_dialog,
  target_billing_interval,
  yearly_savings,
  handle_switch_billing,
  show_addon_checkout,
  set_show_addon_checkout,
  checkout_addon,
  set_checkout_addon,
  show_cancel_addon_dialog,
  set_show_cancel_addon_dialog,
  addon_to_cancel,
  set_addon_to_cancel,
  load_data,
  on_switch_plan,
}: BillingDialogsProps) {
  const { t } = use_i18n();
  const redirect_handled = useRef(false);
  const [cancel_step, set_cancel_step] = useState<CancelStep>("reason");
  const [is_verifying_password, set_is_verifying_password] = useState(false);
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
    set_cancel_impact(null);
    set_is_verifying_password(false);
    clear_cancel_password_cache();
  }, [
    show_cancel_dialog,
    set_cancel_password,
    set_cancel_password_error,
    set_show_cancel_password,
    set_cancel_reason,
    set_cancel_reason_text,
  ]);

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
    const outcome = await verify_cancel_password(cancel_password);

    set_is_verifying_password(false);

    if (outcome === "verified") {
      set_cancel_step("confirm");

      return;
    }
    set_cancel_password_error(
      outcome === "invalid"
        ? t("settings.incorrect_password_error")
        : t("settings.cancel_password_error"),
    );
  };

  useEffect(() => {
    if (redirect_handled.current) return;
    const params = new URLSearchParams(window.location.search);
    const billing_result = params.get("billing");
    const redirect_status = params.get("redirect_status");
    const is_stripe_redirect = params.get("stripe_redirect");

    if (billing_result) {
      redirect_handled.current = true;
      window.history.replaceState({}, "", window.location.pathname);

      if (billing_result === "success") {
        (async () => {
          request_cache.invalidate("/payments/v1");
          request_cache.invalidate("/sync/v1");
          invalidate_mail_stats();
          try {
            await activate_subscription();
          } catch {
            // webhook is the source of truth; this call is best-effort
          }
          for (let attempt = 0; attempt < 6; attempt++) {
            await new Promise((r) =>
              setTimeout(r, attempt === 0 ? 1000 : 2000),
            );
            request_cache.invalidate("/payments/v1");
            const sub_response = await get_subscription();

            if (sub_response.data) {
              set_subscription(sub_response.data);
              if (sub_response.data.plan.code !== "free") {
                invalidate_mail_stats();
                await load_data();
                break;
              }
            }
            if (attempt === 5) await load_data();
          }
          show_toast(t("settings.payment_success"), "success");
        })();
      }

      return;
    }

    if (!is_stripe_redirect || !redirect_status) return;
    redirect_handled.current = true;

    const clean_url = `${window.location.pathname}`;

    window.history.replaceState({}, "", clean_url);

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
  }, [t, load_data]);

  const downgrade_offer =
    subscription &&
    !subscription.cancel_at_period_end &&
    subscription.has_stripe_subscription !== false &&
    !is_crypto_provider(subscription.payment_provider) &&
    on_switch_plan
      ? get_downgrade_offer(
          subscription.plan.code,
          read_billing_interval(subscription.plan.billing_period),
        )
      : null;
  const step_after_reason: CancelStep = downgrade_offer ? "offer" : "impact";

  const cancel_title =
    cancel_step === "reason"
      ? t("settings.cancel_reason_title")
      : cancel_step === "offer"
        ? t("settings.cancel_offer_title")
        : cancel_step === "impact"
          ? t("settings.cancel_impact_title")
          : cancel_step === "confirm"
            ? t("settings.cancel_final_title")
            : t("settings.cancel_confirm_title");

  const cancel_description =
    cancel_step === "reason"
      ? t("settings.cancel_reason_description")
      : cancel_step === "offer"
        ? t("settings.cancel_offer_description")
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
                    cancel_impact?.plan_name ?? subscription?.plan.name ?? "",
                })
              : t("settings.cancel_final_description_nodate", {
                  plan:
                    cancel_impact?.plan_name ?? subscription?.plan.name ?? "",
                })
            : t("settings.cancel_confirm_description");

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
            <AlertDialogTitle>{cancel_title}</AlertDialogTitle>
            <AlertDialogDescription>
              {cancel_description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancel_step === "reason" ? (
            <CancelReasonStep
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              on_continue={() => set_cancel_step(step_after_reason)}
              on_skip={() => set_cancel_step(step_after_reason)}
              reason={cancel_reason}
              reason_text={cancel_reason_text}
              set_reason={set_cancel_reason}
              set_reason_text={set_cancel_reason_text}
            />
          ) : cancel_step === "offer" && downgrade_offer ? (
            <CancelOfferStep
              is_busy={is_action_loading}
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              offer={downgrade_offer}
              on_back={() => set_cancel_step("reason")}
              on_continue={() => set_cancel_step("impact")}
              on_switch={() => {
                const offer = downgrade_offer;

                set_show_cancel_dialog(false);
                setTimeout(() => on_switch_plan?.(offer), 200);
              }}
              preferred_currency={preferred_currency}
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
              on_back={() => set_cancel_step(step_after_reason)}
              on_continue={() => set_cancel_step("password")}
            />
          ) : cancel_step === "confirm" ? (
            <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
              <AlertDialogCancel className="max-sm:flex-1">
                {t("settings.keep_plan")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="aster_btn_destructive max-sm:flex-1"
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
                    className="w-full pr-10"
                    placeholder={t("settings.cancel_password_placeholder")}
                    status={cancel_password_error ? "error" : "default"}
                    type={show_cancel_password ? "text" : "password"}
                    value={cancel_password}
                    maxLength={128}
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-txt-muted hover:text-txt-secondary"
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
                {cancel_password_error && (
                  <p
                    className="text-xs mt-1.5"
                    style={{ color: "var(--destructive)" }}
                  >
                    {cancel_password_error}
                  </p>
                )}
              </div>
              <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
                <AlertDialogCancel className="max-sm:flex-1">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="max-sm:flex-1"
                  disabled={!cancel_password.trim() || is_verifying_password}
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

      {selected_plan && (
        <CheckoutModal
          initial_promo_code={academic_promo_code ?? undefined}
          billing_interval={
            billing_period === "yearly"
              ? "year"
              : billing_period === "biennial"
                ? "biennial"
                : "month"
          }
          currency={preferred_currency}
          on_close={() => {
            set_show_checkout_modal(false);
            set_selected_plan(null);
          }}
          on_success={async () => {
            set_show_checkout_modal(false);
            const upgraded_plan_code = selected_plan?.code;

            set_selected_plan(null);
            request_cache.invalidate("/payments/v1");
            invalidate_mail_stats();
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise((r) =>
                setTimeout(r, attempt === 0 ? 1000 : 2000),
              );
              request_cache.invalidate("/payments/v1");
              const sub_response = await get_subscription();

              if (sub_response.data) {
                set_subscription(sub_response.data);
                if (
                  upgraded_plan_code &&
                  sub_response.data.plan.code === upgraded_plan_code
                ) {
                  invalidate_mail_stats();
                  load_data();
                  break;
                }
              }
              if (attempt === 5) {
                invalidate_mail_stats();
                load_data();
              }
            }
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
            convert_cents(
              billing_period === "yearly"
                ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.yearly_cents || selected_plan.price_cents
                : billing_period === "biennial"
                  ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                      ?.biennial_cents || selected_plan.price_cents
                  : PLAN_TIERS.find((t) => t.id === selected_plan.code)
                      ?.monthly_cents || selected_plan.price_cents,
              preferred_currency,
            ),
            preferred_currency,
          )}
        />
      )}

      <PaymentMethodsModal
        on_close={() => set_show_payment_methods(false)}
        open={show_payment_methods}
      />

      <Modal
        show_close_button
        is_open={show_manage_plan}
        on_close={() => set_show_manage_plan(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.manage_plan")}</ModalTitle>
          <ModalDescription>
            {t("settings.manage_plan_description")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-2">
            <button
              className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-left transition-colors hover:opacity-80"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-secondary)",
              }}
              onClick={() => {
                set_show_manage_plan(false);
                setTimeout(() => set_show_payment_methods(true), 200);
              }}
            >
              <CreditCardIcon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              />
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("settings.manage_payment_methods")}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.manage_payment")}
                </div>
              </div>
            </button>

            {subscription && !subscription.cancel_at_period_end && (
              <button
                className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-left transition-colors hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  borderColor: "var(--border-secondary)",
                }}
                onClick={() => {
                  set_show_manage_plan(false);
                  setTimeout(() => set_show_switch_billing_dialog(true), 200);
                }}
              >
                <ArrowsRightLeftIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                />
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {target_billing_interval === "year"
                      ? t("settings.switch_to_yearly")
                      : t("settings.switch_to_monthly")}
                  </div>
                  {yearly_savings && (
                    <div
                      className="text-xs mt-0.5"
                      style={{
                        color:
                          target_billing_interval === "year"
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                      }}
                    >
                      {target_billing_interval === "year"
                        ? t("settings.switch_billing_savings", {
                            amount: yearly_savings,
                          })
                        : t("settings.switch_billing_loss", {
                            amount: yearly_savings,
                          })}
                    </div>
                  )}
                </div>
              </button>
            )}

            <button
              className="w-full flex items-center gap-3 rounded-[14px] p-3.5 text-left transition-colors hover:opacity-80"
              onClick={() => {
                set_show_manage_plan(false);
                setTimeout(() => {
                  set_cancel_password("");
                  set_cancel_password_error("");
                  set_show_cancel_password(false);
                  set_show_cancel_dialog(true);
                }, 200);
              }}
            >
              <XCircleIcon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              />
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.cancel_plan")}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.cancel_plan_warning")}
                </div>
              </div>
            </button>
          </div>
        </ModalBody>
      </Modal>

      {checkout_addon && (
        <CheckoutModal
          addon_id={checkout_addon.id}
          billing_interval="month"
          currency={preferred_currency}
          current_plan_price_cents={subscription?.plan.price_cents}
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
            for (let attempt = 0; attempt < 5; attempt++) {
              await new Promise((r) => setTimeout(r, 2000));
              request_cache.invalidate("/sync/v1");
              invalidate_mail_stats();
              await load_data();
            }
          }}
          open={show_addon_checkout}
          plan_code="addon"
          plan_name={checkout_addon.name}
          price_cents={checkout_addon.price_cents}
          price_display={format_price(
            convert_cents(checkout_addon.price_cents, preferred_currency),
            preferred_currency,
          )}
        />
      )}

      <AlertDialog
        open={show_switch_billing_dialog}
        onOpenChange={set_show_switch_billing_dialog}
      >
        <AlertDialogContent
          on_overlay_click={() => set_show_switch_billing_dialog(false)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.switch_billing_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.switch_billing_description")}
              {yearly_savings && (
                <span
                  className="block mt-2 font-medium"
                  style={{
                    color:
                      target_billing_interval === "year"
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                  }}
                >
                  {target_billing_interval === "year"
                    ? t("settings.switch_billing_savings", {
                        amount: yearly_savings,
                      })
                    : t("settings.switch_billing_loss", {
                        amount: yearly_savings,
                      })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="max-sm:flex-1"
              onClick={handle_switch_billing}
            >
              {is_action_loading
                ? t("settings.switching_billing")
                : t("settings.switch_billing_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={show_cancel_addon_dialog}
        onOpenChange={set_show_cancel_addon_dialog}
      >
        <AlertDialogContent
          on_overlay_click={() => set_show_cancel_addon_dialog(false)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.confirm_cancel_addon")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.confirm_cancel_addon_description")}
              {addon_to_cancel && (
                <span className="block mt-2 font-medium text-txt-primary">
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
              onClick={async () => {
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
                    show_toast(t("settings.addon_cancel_failed"), "error");
                  }
                } catch (error) {
                  if (import.meta.env.DEV) console.error(error);
                  show_toast(t("settings.addon_cancel_failed"), "error");
                } finally {
                  set_is_action_loading(false);
                  set_show_cancel_addon_dialog(false);
                  set_addon_to_cancel(null);
                }
              }}
            >
              {is_action_loading
                ? t("settings.cancelling")
                : t("settings.confirm_cancel_addon")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
