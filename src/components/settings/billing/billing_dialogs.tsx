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
import { button_variants } from "@aster/ui";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
import { ButtonSpinner } from "@/components/ui/spinner";
import { clamp_password } from "@/services/sanitize";
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
  get_pause_status,
  pause_subscription,
  get_save_offer,
  accept_save_offer,
  cancel_storage_addon,
  activate_subscription,
  type CancelImpactResponse,
  type PauseStatusResponse,
  type SaveOfferStatus,
  type SubscriptionResponse,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { convert_cents } from "@/components/settings/billing/billing_constants";
import {
  get_cancel_offers,
  get_save_offer_for,
  type DowngradeOffer,
  type YearlyOffer,
} from "@/components/settings/billing/cancel_offer";
import { CancelOfferStep } from "@/components/settings/billing/cancel_offer_step";
import { CancelSaveOfferStep } from "@/components/settings/billing/cancel_save_offer_step";
import {
  CancelPauseStep,
  pause_resume_date,
} from "@/components/settings/billing/cancel_pause_step";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import {
  has_retention_options,
  retention_step_for,
  step_before_confirm,
} from "@/components/settings/billing/cancel_flow";
import {
  CancelReasonStep,
  type CancelReason,
} from "@/components/settings/billing/cancel_reason_step";
import {
  CancelImpactList,
  type CancelStep,
} from "@/components/settings/billing/cancel_impact_step";
import {
  clear_cancel_password_cache,
  verify_cancel_password,
} from "@/components/settings/billing/cancel_password";
import { use_i18n } from "@/lib/i18n/context";

interface BillingDialogsProps {
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
  preferred_currency: string;
  show_payment_methods: boolean;
  set_show_payment_methods: React.Dispatch<React.SetStateAction<boolean>>;
  auto_add_card: boolean;
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
  on_switch_yearly?: (offer: YearlyOffer) => void;
}

export function BillingDialogs({
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
  preferred_currency,
  show_payment_methods,
  set_show_payment_methods,
  auto_add_card,
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
  on_switch_yearly,
}: BillingDialogsProps) {
  const { t } = use_i18n();
  const redirect_handled = useRef(false);
  const [cancel_step, set_cancel_step] = useState<CancelStep>("reason");
  const [confirm_came_from, set_confirm_came_from] =
    useState<CancelStep>("reason");
  const [is_verifying_password, set_is_verifying_password] = useState(false);
  const [cancel_impact, set_cancel_impact] =
    useState<CancelImpactResponse | null>(null);
  const [is_impact_loading, set_is_impact_loading] = useState(false);
  const [cancel_totp_code, set_cancel_totp_code] = useState("");
  const [cancel_totp_required, set_cancel_totp_required] = useState(false);
  const [pause_status, set_pause_status] =
    useState<PauseStatusResponse | null>(null);
  const [save_offer_status, set_save_offer_status] =
    useState<SaveOfferStatus | null>(null);

  useEffect(() => {
    if (!show_cancel_dialog) return;
    set_cancel_password("");
    set_cancel_password_error("");
    set_show_cancel_password(false);
    set_cancel_reason(null);
    set_cancel_reason_text("");
    set_cancel_step("reason");
    set_confirm_came_from("reason");
    set_cancel_impact(null);
    set_is_verifying_password(false);
    set_cancel_totp_code("");
    set_cancel_totp_required(false);
    set_pause_status(null);
    set_save_offer_status(null);
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
    if (!show_cancel_dialog || cancel_step !== "password" || cancel_impact)
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

  useEffect(() => {
    if (!show_cancel_dialog) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await get_pause_status();

        if (!cancelled && response.data) set_pause_status(response.data);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show_cancel_dialog]);

  useEffect(() => {
    if (!show_cancel_dialog) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await get_save_offer();

        if (!cancelled && response.data) set_save_offer_status(response.data);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show_cancel_dialog]);

  const refresh_save_offer = async () => {
    try {
      request_cache.invalidate("/payments/v1/save-offer");
      const status = await get_save_offer();

      set_save_offer_status(status.data ?? null);
    } catch {
      set_save_offer_status(null);
    }
  };

  const handle_accept_save_offer = async () => {
    if (is_action_loading) return;
    set_is_action_loading(true);
    try {
      const response = await accept_save_offer(cancel_reason ?? undefined);

      if (response.data?.applied) {
        show_toast(
          t("settings.save_offer_applied_toast", {
            percent: response.data.percent_off,
            count: response.data.months,
          }),
          "success",
          TOAST_DURATION_BILLING_MS,
        );
        set_show_cancel_dialog(false);
        request_cache.invalidate("/payments/v1");
        await load_data();

        return;
      }
      show_toast(t("settings.save_offer_failed"), "error");
      await refresh_save_offer();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.save_offer_failed"), "error");
      await refresh_save_offer();
    } finally {
      set_is_action_loading(false);
    }
  };

  const handle_pause = async (months: number) => {
    if (is_action_loading) return;
    set_is_action_loading(true);
    try {
      const response = await pause_subscription(
        months,
        cancel_reason ?? undefined,
      );

      if (response.data) {
        const resume_at =
          response.data.pause_ends_at ??
          pause_resume_date(response.data.pause_starts_at, months);

        show_toast(
          t("settings.pause_offer_scheduled_toast", {
            date: format_date(resume_at),
          }),
          "success",
          TOAST_DURATION_BILLING_MS,
        );
        set_show_cancel_dialog(false);
        request_cache.invalidate("/payments/v1");
        await load_data();

        return;
      }
      show_toast(
        server_error_text(response.error, t("settings.pause_offer_failed")),
        "error",
      );
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.pause_offer_failed"), "error");
    } finally {
      set_is_action_loading(false);
    }
  };

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
      handle_cancel();

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
          let upgrade_observed = false;

          for (let attempt = 0; attempt < 6; attempt++) {
            await new Promise((r) =>
              setTimeout(r, attempt === 0 ? 1000 : 2000),
            );
            request_cache.invalidate("/payments/v1");
            const sub_response = await get_subscription();

            if (sub_response.data) {
              set_subscription(sub_response.data);
              if (sub_response.data.plan.code !== "free") {
                upgrade_observed = true;
                invalidate_mail_stats();
                await load_data();
                break;
              }
            }
            if (attempt === 5) await load_data();
          }

          if (upgrade_observed) {
            show_toast(t("settings.payment_success"), "success");

            return;
          }
          show_toast(
            t("settings.payment_processing_delayed"),
            "info",
            TOAST_DURATION_BILLING_MS,
          );
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
  }, [t, load_data]);

  const cancel_offers = get_cancel_offers(subscription);
  const downgrade_offer = on_switch_plan ? cancel_offers.downgrade : null;
  const yearly_offer = on_switch_yearly ? cancel_offers.yearly : null;
  const can_pause =
    !!pause_status?.eligible && pause_status.status === "none";
  const is_paused = pause_status?.status === "paused";
  const save_offer = get_save_offer_for(cancel_reason, save_offer_status);
  const has_offer = !!(downgrade_offer || yearly_offer);
  const flow_options = {
    has_save_offer: !!save_offer,
    has_plan_offer: has_offer,
    can_pause,
  };
  const retention_step = retention_step_for(flow_options);
  const go_to_confirm = (from: CancelStep) => {
    set_confirm_came_from(from);
    set_cancel_step("password");
  };

  useEffect(() => {
    if (cancel_step === "save" && !save_offer) set_cancel_step("password");
  }, [cancel_step, save_offer, set_cancel_step]);
  const offer_key = yearly_offer
    ? downgrade_offer
      ? "both"
      : "yearly"
    : "downgrade";

  const cancel_title =
    cancel_step === "reason"
        ? t("settings.cancel_reason_title")
        : cancel_step === "save"
          ? t("settings.save_offer_title")
        : cancel_step === "offer"
          ? offer_key === "both"
            ? t("settings.cancel_offer_both_title")
            : offer_key === "yearly"
              ? t("settings.cancel_offer_yearly_title")
              : t("settings.cancel_offer_title")
          : cancel_step === "pause"
            ? t("settings.pause_offer_title")
            : t("settings.cancel_final_title");

  const cancel_description =
    cancel_step === "reason"
        ? t("settings.cancel_reason_description")
        : cancel_step === "save"
          ? t("settings.save_offer_description")
        : cancel_step === "offer"
          ? offer_key === "both"
            ? t("settings.cancel_offer_both_description")
            : offer_key === "yearly"
              ? t("settings.cancel_offer_yearly_description")
              : t("settings.cancel_offer_description")
          : cancel_step === "pause"
            ? t("settings.pause_offer_description")
            : is_paused && cancel_step === "password"
              ? t("settings.pause_cancel_note")
              : cancel_effective_date
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
                      });

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
              on_cancel={() => go_to_confirm("reason")}
              on_see_options={
                has_retention_options(flow_options) && retention_step
                  ? () => set_cancel_step(retention_step)
                  : undefined
              }
              reason={cancel_reason}
              reason_text={cancel_reason_text}
              set_reason={set_cancel_reason}
              set_reason_text={set_cancel_reason_text}
            />
          ) : cancel_step === "save" && save_offer ? (
            <CancelSaveOfferStep
              is_busy={is_action_loading}
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              offer={save_offer}
              plan_name={subscription?.plan.name ?? ""}
              on_accept={handle_accept_save_offer}
              on_back={() => set_cancel_step("reason")}
              on_cancel={() => go_to_confirm(cancel_step)}
            />
          ) : cancel_step === "offer" && has_offer ? (
            <CancelOfferStep
              is_busy={is_action_loading}
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              offer={downgrade_offer}
              on_back={() => set_cancel_step("reason")}
              on_cancel={() => go_to_confirm(cancel_step)}
              on_switch={() => {
                const offer = downgrade_offer;

                if (!offer) return;
                set_show_cancel_dialog(false);
                setTimeout(() => on_switch_plan?.(offer), 200);
              }}
              on_switch_yearly={() => {
                const offer = yearly_offer;

                if (!offer) return;
                set_show_cancel_dialog(false);
                setTimeout(() => on_switch_yearly?.(offer), 200);
              }}
              preferred_currency={preferred_currency}
              yearly_offer={yearly_offer}
            />
          ) : cancel_step === "pause" && can_pause ? (
            <CancelPauseStep
              is_busy={is_action_loading}
              keep_plan_slot={
                <AlertDialogCancel className="mt-0">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
              }
              max_months={pause_status?.max_months ?? 3}
              pause_starts_at={
                pause_status?.pause_starts_at ??
                subscription?.current_period_end ??
                null
              }
              plan_name={
                pause_status?.plan_name ?? subscription?.plan.name ?? ""
              }
              on_back={() => set_cancel_step("reason")}
              on_cancel={() => go_to_confirm(cancel_step)}
              on_pause={handle_pause}
            />
          ) : (
            <>
              <CancelImpactList
                impact={cancel_impact}
                is_loading={is_impact_loading}
              />
              <div className="py-2">
                <label className="block text-sm font-medium text-txt-secondary mb-2">
                  {t("settings.cancel_enter_password")}
                </label>
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    className="w-full pe-10"
                    maxLength={128}
                    name="password"
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
                      htmlFor="cancel-totp-code"
                    >
                      {t("settings.authenticator_code")}
                    </label>
                    <Input
                      autoComplete="one-time-code"
                      className="w-full text-center tracking-[0.5em]"
                      id="cancel-totp-code"
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
              <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
                <AlertDialogCancel className="max-sm:flex-1">
                  {t("settings.keep_plan")}
                </AlertDialogCancel>
                <button
                  className={`${button_variants({ variant: "ghost" })} max-sm:flex-1`}
                  type="button"
                  onClick={() =>
                    set_cancel_step(
                      step_before_confirm(flow_options, confirm_came_from),
                    )
                  }
                >
                  {t("common.back")}
                </button>
                <AlertDialogAction
                  className="aster_btn_destructive max-sm:flex-1"
                  disabled={
                    !cancel_password.trim() ||
                    is_verifying_password ||
                    is_action_loading ||
                    (cancel_totp_required && cancel_totp_code.length !== 6)
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    handle_password_continue();
                  }}
                >
                  <>
                    {(is_verifying_password || is_action_loading) && (
                      <ButtonSpinner size="xs" />
                    )}
                    {t("settings.cancel_final_confirm")}
                  </>
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <PaymentMethodsModal
        auto_add_card={auto_add_card}
        on_close={() => set_show_payment_methods(false)}
        open={show_payment_methods}
      />

      {checkout_addon && (
        <CheckoutModal
          addon_id={checkout_addon.id}
          billing_interval="month"
          currency={preferred_currency}
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
              onClick={(e) => {
                e.preventDefault();
                void handle_switch_billing();
              }}
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
                    show_toast(
                      t("settings.addon_cancel_failed"),
                      "error",
                      TOAST_DURATION_BILLING_MS,
                    );
                  }
                } catch (error) {
                  if (import.meta.env.DEV) console.error(error);
                  show_toast(
                    t("settings.addon_cancel_failed"),
                    "error",
                    TOAST_DURATION_BILLING_MS,
                  );
                } finally {
                  set_is_action_loading(false);
                  set_show_cancel_addon_dialog(false);
                  set_addon_to_cancel(null);
                }
              }}
            >
              {t("settings.confirm_cancel_addon")}
              {is_action_loading && <ButtonSpinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
