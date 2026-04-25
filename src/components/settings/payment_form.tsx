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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { type PaymentRequest } from "@stripe/stripe-js";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  type theme_colors,
  type checkout_phase,
  compute_discount,
} from "./checkout_modal";
import { PricingDisplay } from "./pricing_display";
import { StripeCardFields } from "./stripe_card_fields";

import { Spinner } from "@/components/ui/spinner";
import {
  create_subscription_intent,
  validate_promo_code,
  activate_subscription,
  format_price,
  type PromoValidateResponse,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  use_stripe_theme_tokens,
  build_stripe_element_style,
} from "@/lib/stripe_appearance";

interface payment_form_props {
  plan_name: string;
  plan_code: string;
  price_cents: number;
  currency: string;
  price_display: string;
  billing_interval: string;
  addon_id?: string;
  addon_client_secret: string | null;
  colors: theme_colors;
  phase: checkout_phase;
  set_phase: (phase: checkout_phase) => void;
  error_message: string;
  set_error_message: (msg: string) => void;
  promo_code: string;
  set_promo_code: (code: string) => void;
  promo_result: PromoValidateResponse | null;
  set_promo_result: (result: PromoValidateResponse | null) => void;
  is_validating_promo: boolean;
  set_is_validating_promo: (v: boolean) => void;
  on_success: () => void;
  on_close: () => void;
}

export function PaymentForm({
  plan_name,
  plan_code,
  price_cents,
  currency,
  price_display,
  billing_interval,
  addon_id,
  addon_client_secret,
  colors,
  phase,
  set_phase,
  error_message,
  set_error_message,
  promo_code,
  set_promo_code,
  promo_result,
  set_promo_result,
  is_validating_promo,
  set_is_validating_promo,
  on_success,
  on_close,
}: payment_form_props) {
  const { t } = use_i18n();
  const stripe = useStripe();
  const elements = useElements();
  const [cardholder_name, set_cardholder_name] = useState("");
  const [billing_postal, set_billing_postal] = useState("");
  const [selected_method, set_selected_method] = useState<
    "card" | "wallet" | "cashapp"
  >("card");
  const cardholder_input_ref = useRef<HTMLInputElement | null>(null);
  const [focused_field, set_focused_field] = useState<string | null>(null);
  const [hovered_field, set_hovered_field] = useState<string | null>(null);
  const [field_state, set_field_state] = useState<{
    [k: string]: { complete: boolean; error: string | null };
  }>({
    number: { complete: false, error: null },
    expiry: { complete: false, error: null },
    cvc: { complete: false, error: null },
  });
  const [ready_count, set_ready_count] = useState(0);
  const [payment_request, set_payment_request] =
    useState<PaymentRequest | null>(null);
  const [can_make_wallet_payment, set_can_make_wallet_payment] =
    useState(false);
  const payment_request_ref = useRef<PaymentRequest | null>(null);

  const stripe_tokens = use_stripe_theme_tokens();
  const element_style = useMemo(
    () => build_stripe_element_style(stripe_tokens),
    [stripe_tokens],
  );

  const { discounted_cents, is_free } = useMemo(
    () => compute_discount(price_cents, promo_result),
    [price_cents, promo_result],
  );

  const discounted_display = format_price(discounted_cents, currency);
  const show_strikethrough =
    promo_result?.valid && discounted_cents !== price_cents;

  const create_intent_for_plan = useCallback(async (): Promise<{
    secret: string | null;
    error: string | null;
  }> => {
    if (addon_id) return { secret: addon_client_secret, error: null };

    try {
      const sub_response = await create_subscription_intent(
        plan_code,
        billing_interval,
        currency,
        promo_code.trim() || undefined,
      );

      if (sub_response.error) {
        return { secret: null, error: sub_response.error };
      }

      return {
        secret: sub_response.data?.client_secret || null,
        error: sub_response.data?.client_secret
          ? null
          : "empty client_secret from server",
      };
    } catch (err) {
      return {
        secret: null,
        error: err instanceof Error ? err.message : "network error",
      };
    }
  }, [
    addon_id,
    addon_client_secret,
    plan_code,
    billing_interval,
    currency,
    promo_code,
  ]);

  const finish_success = useCallback(() => {
    set_phase("success");
    show_toast(t("settings.checkout_welcome"), "success");
    setTimeout(() => {
      on_success();
      on_close();
    }, 1500);
  }, [set_phase, t, on_success, on_close]);

  useEffect(() => {
    if (!stripe || is_free) {
      set_payment_request(null);
      set_can_make_wallet_payment(false);
      payment_request_ref.current = null;

      return;
    }

    if (payment_request_ref.current) {
      payment_request_ref.current.update({
        total: { label: plan_name, amount: discounted_cents },
      });

      return;
    }

    const pr = stripe.paymentRequest({
      country: "US",
      currency: currency.toLowerCase(),
      total: { label: plan_name, amount: discounted_cents },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        payment_request_ref.current = pr;
        set_payment_request(pr);
        set_can_make_wallet_payment(true);
      }
    });

    pr.on("paymentmethod", async (ev) => {
      set_phase("processing");
      set_error_message("");
      try {
        const { secret, error: intent_error } = await create_intent_for_plan();

        if (!secret) {
          ev.complete("fail");
          set_error_message(intent_error || t("settings.payment_failed"));
          set_phase("ready");

          return;
        }

        if (secret === "free" || secret === "already_active") {
          ev.complete("success");
          const activate = await activate_subscription();

          if (!activate.data?.activated) {
            set_error_message(t("settings.payment_failed"));
            set_phase("ready");

            return;
          }
          finish_success();

          return;
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
          secret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false },
        );

        if (error) {
          ev.complete("fail");
          set_error_message(error.message || t("settings.payment_failed"));
          set_phase("ready");

          return;
        }

        ev.complete("success");

        if (paymentIntent?.status === "requires_action") {
          await stripe.confirmCardPayment(secret);
        }

        const activate = await activate_subscription();

        if (!activate.data?.activated) {
          set_error_message(t("settings.payment_failed"));
          set_phase("ready");

          return;
        }
        finish_success();
      } catch {
        ev.complete("fail");
        set_error_message(t("settings.payment_failed"));
        set_phase("ready");
      }
    });
  }, [
    stripe,
    discounted_cents,
    currency,
    plan_name,
    is_free,
    addon_id,
    create_intent_for_plan,
    set_phase,
    set_error_message,
    t,
    finish_success,
  ]);

  const all_ready = ready_count >= 3;

  const focus_next_field = useCallback(
    (current: "number" | "expiry" | "cvc") => {
      if (current === "number") {
        elements?.getElement(CardExpiryElement)?.focus();
      } else if (current === "expiry") {
        elements?.getElement(CardCvcElement)?.focus();
      } else if (current === "cvc") {
        cardholder_input_ref.current?.focus();
      }
    },
    [elements],
  );

  const handle_validate_promo = useCallback(async () => {
    if (!promo_code.trim()) return;

    set_is_validating_promo(true);
    set_promo_result(null);
    set_error_message("");

    try {
      const response = await validate_promo_code(promo_code.trim());

      if (response.data) {
        set_promo_result(response.data);
        if (!response.data.valid) {
          show_toast(t("settings.promo_invalid"), "error");
        }
      }
    } catch {
      set_promo_result({
        valid: false,
        discount_type: null,
        discount_value: null,
        duration: null,
        duration_in_months: null,
        description: null,
      });
    } finally {
      set_is_validating_promo(false);
    }
  }, [
    promo_code,
    set_is_validating_promo,
    set_promo_result,
    set_error_message,
    t,
  ]);

  const handle_submit = useCallback(async () => {
    if (!stripe) return;

    set_phase("processing");
    set_error_message("");

    try {
      const { secret, error: intent_error } = await create_intent_for_plan();

      if (!secret) {
        set_error_message(intent_error || t("settings.failed_checkout"));
        set_phase("ready");

        return;
      }

      if (secret === "free" || secret === "already_active") {
        const activate = await activate_subscription();

        if (!activate.data?.activated) {
          set_error_message(t("settings.payment_failed"));
          set_phase("ready");

          return;
        }
        finish_success();

        return;
      }

      if (!elements) {
        set_error_message(t("settings.payment_failed"));
        set_phase("ready");

        return;
      }

      let error: { message?: string } | undefined;
      let paymentIntent: { status: string } | undefined;

      if (selected_method === "cashapp") {
        const result = await stripe.confirmCashappPayment(secret, {
          payment_method: {
            billing_details: {
              name: cardholder_name || "Aster User",
            },
          },
          return_url: window.location.href,
        });

        error = result.error;
        paymentIntent = result.paymentIntent;
      } else {
        const card_number = elements.getElement(CardNumberElement);

        if (!card_number) {
          set_error_message(t("settings.payment_failed"));
          set_phase("ready");

          return;
        }

        const result = await stripe.confirmCardPayment(secret, {
          payment_method: {
            card: card_number,
            billing_details: {
              name: cardholder_name || undefined,
              address: billing_postal
                ? { postal_code: billing_postal }
                : undefined,
            },
          },
        });

        error = result.error;
        paymentIntent = result.paymentIntent || undefined;
      }

      if (error) {
        set_error_message(error.message || t("settings.payment_failed"));
        set_phase("ready");

        return;
      }

      if (
        !paymentIntent ||
        (paymentIntent.status !== "succeeded" &&
          paymentIntent.status !== "processing")
      ) {
        set_error_message(t("settings.payment_failed"));
        set_phase("ready");

        return;
      }

      const activate = await activate_subscription();

      if (!activate.data?.activated) {
        set_error_message(t("settings.payment_failed"));
        set_phase("ready");

        return;
      }
      finish_success();
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      set_error_message(t("settings.payment_failed"));
      set_phase("ready");
    }
  }, [
    stripe,
    elements,
    is_free,
    selected_method,
    create_intent_for_plan,
    cardholder_name,
    billing_postal,
    set_phase,
    set_error_message,
    finish_success,
    t,
  ]);

  const interval_label =
    billing_interval === "biennial"
      ? t("settings.per_two_years")
      : billing_interval === "year"
        ? t("settings.per_year_short")
        : t("settings.per_month_short");

  const handle_field_change = (
    key: "number" | "expiry" | "cvc",
    ev: { complete: boolean; error?: { message: string } },
  ) => {
    set_field_state((prev) => ({
      ...prev,
      [key]: {
        complete: ev.complete,
        error: ev.error?.message || null,
      },
    }));
    if (ev.complete) {
      focus_next_field(key);
    }
  };

  const get_field_border = (key: string, has_error: boolean) => {
    if (has_error) return colors.danger;
    if (focused_field === key) return colors.accent;
    if (hovered_field === key) return colors.border_hover;

    return colors.border_rest;
  };

  const field_wrapper = (
    key: "number" | "expiry" | "cvc",
    element: React.ReactNode,
  ) => {
    const has_error = !!field_state[key].error;
    const is_complete = field_state[key].complete;

    const focus_this_field = () => {
      if (!elements) return;
      if (key === "number") elements.getElement(CardNumberElement)?.focus();
      else if (key === "expiry")
        elements.getElement(CardExpiryElement)?.focus();
      else elements.getElement(CardCvcElement)?.focus();
    };

    return (
      <div
        className="flex items-center gap-2"
        style={{
          height: "44px",
          borderRadius: "14px",
          border: `1px solid ${get_field_border(key, has_error)}`,
          background: colors.bg_input,
          padding: "0 16px",
          transition: "border-color 0.15s ease",
          cursor: "text",
        }}
        onClick={focus_this_field}
        onMouseEnter={() => set_hovered_field(key)}
        onMouseLeave={() => set_hovered_field(null)}
      >
        <div
          className="flex-1 min-w-0"
          style={{ visibility: all_ready ? "visible" : "hidden" }}
        >
          {element}
        </div>
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: "16px",
            height: "16px",
            opacity: is_complete ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
        >
          <CheckCircleIcon
            className="w-4 h-4"
            style={{ color: colors.success }}
          />
        </div>
      </div>
    );
  };

  const native_input_style = (key: string) => ({
    height: "44px",
    borderRadius: "14px",
    border: `1px solid ${
      focused_field === key
        ? colors.accent
        : hovered_field === key
          ? colors.border_hover
          : colors.border_rest
    }`,
    background: colors.bg_input,
    color: colors.text_primary,
    fontFamily: "'Google Sans Flex', system-ui, sans-serif",
    fontSize: "16px",
    fontWeight: 400 as const,
    fontSmooth: "antialiased" as const,
    WebkitFontSmoothing: "antialiased" as const,
    padding: "0 16px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s ease",
  });

  return (
    <div className="space-y-5">
      <PricingDisplay
        billing_interval={billing_interval}
        colors={colors}
        currency={currency}
        discounted_display={discounted_display}
        interval_label={interval_label}
        is_free={is_free}
        plan_name={plan_name}
        price_cents={price_cents}
        price_display={price_display}
        promo_result={promo_result}
        show_strikethrough={!!show_strikethrough}
      />

      <div>
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: colors.text_secondary }}
        >
          {t("settings.promo_code")}
        </label>
        <div className="flex gap-2 items-center">
          <input
            className="flex-1"
            disabled={phase === "processing"}
            placeholder={t("settings.promo_code_placeholder")}
            style={native_input_style("promo")}
            type="text"
            value={promo_code}
            onBlur={() => set_focused_field(null)}
            onChange={(e) => {
              set_promo_code(e.target.value);
              set_promo_result(null);
            }}
            onFocus={() => set_focused_field("promo")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handle_validate_promo();
              }
            }}
            onMouseEnter={() => set_hovered_field("promo")}
            onMouseLeave={() => set_hovered_field(null)}
          />
          <Button
            disabled={
              !promo_code.trim() ||
              is_validating_promo ||
              phase === "processing"
            }
            size="lg"
            style={{ height: "44px" }}
            variant="outline"
            onClick={handle_validate_promo}
          >
            {is_validating_promo ? (
              <Spinner size="xs" />
            ) : (
              t("settings.promo_apply")
            )}
          </Button>
        </div>
        {promo_result && !promo_result.valid && (
          <p className="text-xs mt-1.5" style={{ color: colors.danger }}>
            {t("settings.promo_invalid")}
          </p>
        )}
      </div>

      {!is_free && (
        <div className="flex gap-2">
          {(
            [
              "card",
              ...(can_make_wallet_payment ? (["wallet"] as const) : []),
              "cashapp",
            ] as const
          ).map((m) => (
            <button
              key={m}
              className="flex-1 text-xs font-medium rounded-[10px] py-2 transition-colors"
              disabled={phase === "processing"}
              style={{
                border: `1px solid ${
                  selected_method === m ? colors.accent : colors.border_rest
                }`,
                background:
                  selected_method === m ? colors.accent : colors.bg_input,
                color: selected_method === m ? "#ffffff" : colors.text_primary,
              }}
              type="button"
              onClick={() => set_selected_method(m)}
            >
              {m === "card"
                ? t("settings.checkout_method_card")
                : m === "wallet"
                  ? t("settings.checkout_method_wallet")
                  : t("settings.checkout_method_cashapp")}
            </button>
          ))}
        </div>
      )}

      {!is_free &&
        selected_method === "wallet" &&
        can_make_wallet_payment &&
        payment_request && (
          <PaymentRequestButtonElement
            options={{
              paymentRequest: payment_request,
              style: {
                paymentRequestButton: {
                  type: "default",
                  theme: "dark",
                  height: "44px",
                },
              },
            }}
          />
        )}

      {!is_free && selected_method === "cashapp" && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            backgroundColor: colors.bg_input,
            border: `1px solid ${colors.border_rest}`,
            color: colors.text_secondary,
          }}
        >
          {t("settings.cashapp_redirect_notice")}
        </div>
      )}

      {!is_free && selected_method === "card" && (
        <StripeCardFields
          billing_postal={billing_postal}
          cardholder_input_ref={cardholder_input_ref}
          cardholder_name={cardholder_name}
          colors={colors}
          element_style={element_style}
          field_wrapper={field_wrapper}
          handle_field_change={handle_field_change}
          native_input_style={native_input_style}
          set_billing_postal={set_billing_postal}
          set_cardholder_name={set_cardholder_name}
          set_focused_field={set_focused_field}
          set_hovered_field={set_hovered_field}
          set_ready_count={set_ready_count}
        />
      )}

      {error_message && (
        <div
          className="rounded-xl p-3 text-sm"
          style={{
            backgroundColor: colors.danger,
            color: "#fff",
          }}
        >
          {error_message}
        </div>
      )}

      <Button
        className="w-full"
        disabled={
          (!is_free &&
            (!stripe ||
              !elements ||
              (selected_method === "card" && !all_ready))) ||
          phase === "processing"
        }
        size="xl"
        variant="depth"
        onClick={handle_submit}
      >
        {phase === "processing" ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" />
            {t("settings.processing_payment")}
          </span>
        ) : (
          t("settings.subscribe_now")
        )}
      </Button>

      {!is_free && (
        <p
          className="text-center text-[11px]"
          style={{ color: colors.text_tertiary }}
        >
          {t("settings.stripe_secure_notice")}
        </p>
      )}
    </div>
  );
}
