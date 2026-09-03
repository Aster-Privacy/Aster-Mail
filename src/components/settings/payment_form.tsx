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
import {
  CheckoutMethodList,
  CheckoutTermSelector,
  type checkout_method,
  type checkout_term_option,
} from "./checkout_options";
import { CheckoutSummary } from "./checkout_summary";
import { StripeCardFields } from "./stripe_card_fields";

import { Spinner } from "@/components/ui/spinner";
import {
  create_subscription_intent,
  validate_promo_code,
  activate_subscription,
  create_crypto_checkout_session,
  format_price,
  type PromoValidateResponse,
} from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import {
  CARD_TERMS,
  CRYPTO_TERMS,
  interval_for_term,
  nearest_card_term,
  term_for_interval,
  term_monthly_cents,
  term_price_cents,
  term_savings_cents,
  term_savings_percent,
  type checkout_term,
} from "@/components/settings/billing/checkout_terms";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  use_stripe_theme_tokens,
  build_stripe_element_style,
} from "@/lib/stripe_appearance";
import { is_composing } from "@/utils/ime";

interface payment_form_props {
  plan_name: string;
  plan_code: string;
  price_cents: number;
  currency: string;
  price_display: string;
  billing_interval: string;
  addon_id?: string;
  addon_client_secret: string | null;
  credit_balance_cents?: number;
  highlights?: string[];
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
  on_choose_crypto?: (term: checkout_term) => void;
}

export function PaymentForm({
  plan_name,
  plan_code,
  price_cents,
  currency,
  billing_interval,
  addon_id,
  addon_client_secret,
  credit_balance_cents,
  highlights,
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
  on_choose_crypto,
}: payment_form_props) {
  const { t } = use_i18n();
  const stripe = useStripe();
  const elements = useElements();
  const [cardholder_name, set_cardholder_name] = useState("");
  const [billing_postal, set_billing_postal] = useState("");
  const [selected_method, set_selected_method] =
    useState<checkout_method>("card");
  const plan_tier = useMemo(
    () =>
      addon_id ? undefined : PLAN_TIERS.find((tier) => tier.id === plan_code),
    [addon_id, plan_code],
  );
  const [selected_term, set_selected_term] = useState<checkout_term>(() =>
    nearest_card_term(term_for_interval(billing_interval)),
  );
  const active_term = plan_tier
    ? selected_term
    : term_for_interval(billing_interval);
  const active_interval = plan_tier
    ? interval_for_term(nearest_card_term(active_term))
    : billing_interval;
  const active_price_cents = plan_tier
    ? term_price_cents(plan_tier, active_term)
    : price_cents;
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
  const [show_promo_field, set_show_promo_field] = useState(false);
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

  const applied_promo_result = addon_id ? null : promo_result;

  const { discounted_cents, is_free } = useMemo(
    () => compute_discount(active_price_cents, applied_promo_result),
    [active_price_cents, applied_promo_result],
  );

  const [force_payment_fields, set_force_payment_fields] = useState(false);

  const credits_applied_cents = useMemo(() => {
    if (addon_id) return 0;
    const balance = credit_balance_cents ?? 0;

    return Math.max(0, Math.min(balance, discounted_cents));
  }, [addon_id, credit_balance_cents, discounted_cents]);

  const total_after_credits_cents = Math.max(
    0,
    discounted_cents - credits_applied_cents,
  );

  const discounted_display = format_price(
    convert_cents(discounted_cents, currency),
    currency,
  );
  const show_strikethrough =
    applied_promo_result?.valid && discounted_cents !== active_price_cents;

  const requires_payment = !is_free || force_payment_fields;

  const create_intent_for_plan = useCallback(async (): Promise<{
    secret: string | null;
    error: string | null;
  }> => {
    if (addon_id) return { secret: addon_client_secret, error: null };

    try {
      const sub_response = await create_subscription_intent(
        plan_code,
        active_interval,
        currency,
        promo_code.trim() || undefined,
        credits_applied_cents > 0 ? credits_applied_cents : undefined,
      );

      if (sub_response.error) {
        return {
          secret: null,
          error:
            sub_response.server_code === "CREDIT_BALANCE_CHANGED"
              ? t("common.credit_balance_changed")
              : sub_response.error,
        };
      }

      return {
        secret: sub_response.data?.client_secret || null,
        error: sub_response.data?.client_secret
          ? null
          : t("settings.payment_failed"),
      };
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);

      return {
        secret: null,
        error: t("settings.payment_failed"),
      };
    }
  }, [
    addon_id,
    addon_client_secret,
    plan_code,
    active_interval,
    currency,
    promo_code,
    credits_applied_cents,
    t,
  ]);

  const finish_success = useCallback(() => {
    set_phase("success");
    show_toast(t("settings.checkout_welcome"), "success");
    setTimeout(() => {
      on_success();
      on_close();
    }, 1500);
  }, [set_phase, t, on_success, on_close]);

  const finish_pending_activation = useCallback(() => {
    set_phase("success");
    show_toast(t("settings.payment_activation_pending"), "info");
    setTimeout(() => {
      on_success();
      on_close();
    }, 3000);
  }, [set_phase, t, on_success, on_close]);

  const activate_after_charge = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const activate = await activate_subscription();

      if (activate.data?.activated) return true;

      if (attempt < 2) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1500 * (attempt + 1));
        });
      }
    }

    return false;
  }, []);

  const change_payment_method = useCallback(
    (next: checkout_method) => {
      if (next === selected_method) return;

      if (next !== "crypto") {
        set_selected_term((current) => nearest_card_term(current));
      }
      set_error_message("");
      set_field_state({
        number: { complete: false, error: null },
        expiry: { complete: false, error: null },
        cvc: { complete: false, error: null },
      });
      set_ready_count(0);
      set_selected_method(next);
    },
    [selected_method, set_error_message],
  );

  const create_intent_ref = useRef(create_intent_for_plan);

  useEffect(() => {
    create_intent_ref.current = create_intent_for_plan;
  }, [create_intent_for_plan]);

  useEffect(() => {
    if (!stripe || is_free) {
      set_payment_request(null);
      set_can_make_wallet_payment(false);
      payment_request_ref.current = null;

      return;
    }

    if (payment_request_ref.current) {
      payment_request_ref.current.update({
        total: {
          label: plan_name,
          amount: convert_cents(total_after_credits_cents, currency),
        },
      });

      return;
    }

    const pr = stripe.paymentRequest({
      country: "US",
      currency: currency.toLowerCase(),
      total: {
        label: plan_name,
        amount: convert_cents(total_after_credits_cents, currency),
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result && (result.applePay || result.googlePay)) {
        payment_request_ref.current = pr;
        set_payment_request(pr);
        set_can_make_wallet_payment(true);
      }
    });

    pr.on("paymentmethod", async (ev) => {
      set_phase("processing");
      set_error_message("");
      try {
        const { secret, error: intent_error } =
          await create_intent_ref.current();

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

        const is_card_wallet =
          ev.paymentMethod.type !== "link" &&
          ev.paymentMethod.type !== "cashapp";

        let conf_error: { message?: string } | undefined;
        let conf_intent: { status: string } | undefined;

        if (is_card_wallet) {
          const result = await stripe.confirmCardPayment(
            secret,
            { payment_method: ev.paymentMethod.id },
            { handleActions: false },
          );

          conf_error = result.error;
          conf_intent = result.paymentIntent || undefined;
        } else {
          const result = await stripe.confirmPayment({
            clientSecret: secret,
            confirmParams: {
              payment_method: ev.paymentMethod.id,
              return_url: `${window.location.origin}${window.location.pathname}`,
            },
            redirect: "if_required",
          });

          conf_error = result.error;
          conf_intent = result.paymentIntent || undefined;
        }

        if (conf_error) {
          ev.complete("fail");
          set_error_message(conf_error.message || t("settings.payment_failed"));
          set_phase("ready");

          return;
        }

        ev.complete("success");

        if (conf_intent?.status === "requires_action" && is_card_wallet) {
          await stripe.confirmCardPayment(secret);
        }

        if (!(await activate_after_charge())) {
          finish_pending_activation();

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
    finish_pending_activation,
    activate_after_charge,
    stripe,
    discounted_cents,
    total_after_credits_cents,
    currency,
    plan_name,
    is_free,
    addon_id,
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
      } else {
        show_toast(
          response.error || t("common.something_went_wrong_try_again"),
          "error",
        );
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
    if (selected_method === "wallet") return;
    if (selected_method === "crypto") {
      if (on_choose_crypto) {
        on_choose_crypto(active_term);

        return;
      }
      set_phase("processing");
      set_error_message("");
      try {
        const origin = window.location.origin;
        const response = await create_crypto_checkout_session(
          plan_code,
          active_term,
          `${origin}/?crypto=success`,
          `${origin}/?crypto=cancelled`,
        );

        if (response.data?.url) {
          try {
            const parsed = new URL(response.data.url);

            if (parsed.protocol !== "https:")
              throw new Error("invalid_protocol");
            window.location.href = parsed.toString();
          } catch {
            set_error_message(t("settings.failed_checkout"));
            set_phase("ready");
          }

          return;
        }
        set_error_message(
          server_error_text(response.error, t("settings.failed_checkout")),
        );
        set_phase("ready");
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
        set_error_message(t("settings.failed_checkout"));
        set_phase("ready");
      }

      return;
    }

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
        set_force_payment_fields(true);
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
          return_url: `${window.location.origin}${window.location.pathname}?stripe_redirect=1`,
        });

        error = result.error;
        paymentIntent = result.paymentIntent;
      } else {
        const card_number = elements.getElement(CardNumberElement);

        if (!card_number) {
          set_force_payment_fields(true);
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

      if (!(await activate_after_charge())) {
        finish_pending_activation();

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
    active_term,
    plan_code,
    on_choose_crypto,
    set_phase,
    set_error_message,
    finish_success,
    finish_pending_activation,
    activate_after_charge,
    t,
  ]);

  const interval_label =
    active_interval === "biennial"
      ? t("settings.per_two_years")
      : active_interval === "year"
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

  const money = (cents: number) =>
    format_price(convert_cents(cents, currency), currency);

  const term_label = (term: checkout_term) =>
    term === 24
      ? t("settings.crypto_term_24mo")
      : term === 12
        ? t("settings.crypto_term_12mo")
        : term === 6
          ? t("settings.crypto_term_6mo")
          : term === 3
            ? t("settings.crypto_term_3mo")
            : t("settings.crypto_term_1mo");

  const method_options: checkout_method[] = [
    "card",
    ...(can_make_wallet_payment ? (["wallet"] as const) : []),
    "cashapp",
    ...(addon_id ? ([] as const) : (["crypto"] as const)),
  ];

  const term_options: checkout_term_option[] = plan_tier
    ? (selected_method === "crypto" ? CRYPTO_TERMS : CARD_TERMS).map((term) => {
        const savings_cents = term_savings_cents(plan_tier, term);

        return {
          term,
          label: term_label(term),
          monthly_display: t("settings.checkout_term_per_month", {
            amount: money(term_monthly_cents(plan_tier, term)),
          }),
          total_display: money(term_price_cents(plan_tier, term)),
          savings_display:
            savings_cents > 0
              ? t("settings.checkout_term_save", {
                  amount: money(savings_cents),
                })
              : null,
        };
      })
    : [];

  const fallback_term_label =
    billing_interval === "year"
      ? t("settings.billing_yearly")
      : billing_interval === "biennial"
        ? t("settings.biennial")
        : t("settings.billing_monthly");

  const shows_autorenew = !addon_id && selected_method !== "crypto";

  const summary_model = {
    plan_name,
    term: active_term,
    term_label: plan_tier ? term_label(active_term) : fallback_term_label,
    savings_percent: plan_tier
      ? term_savings_percent(plan_tier, active_term)
      : 0,
    monthly_display: plan_tier
      ? t("settings.checkout_term_per_month", {
          amount: money(term_monthly_cents(plan_tier, active_term)),
        })
      : null,
    total_display: discounted_display,
    amount_due_display: money(total_after_credits_cents),
    strikethrough_display: show_strikethrough
      ? money(active_price_cents)
      : null,
    credits_display:
      credits_applied_cents > 0 && selected_method !== "crypto"
        ? `-${format_price(credits_applied_cents, "usd")}`
        : null,
    security_text:
      selected_method === "crypto" ? null : t("settings.stripe_secure_notice"),
    autorenew_text: shows_autorenew
      ? t("settings.autorenew_notice", {
          amount: `${money(active_price_cents)}${interval_label}`,
        })
      : null,
    discount_note:
      applied_promo_result?.valid && applied_promo_result.description
        ? applied_promo_result.description
        : null,
  };

  const promo_visible = show_promo_field || !!promo_code.trim();

  const promo_slot = addon_id ? null : (
    <div>
      {promo_visible ? (
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 min-w-0"
            disabled={phase === "processing"}
            placeholder={t("settings.promo_code_placeholder")}
            style={{ ...native_input_style("promo"), height: "38px" }}
            type="text"
            value={promo_code}
            onBlur={() => set_focused_field(null)}
            onChange={(e) => {
              set_promo_code(e.target.value);
              set_promo_result(null);
            }}
            onFocus={() => set_focused_field("promo")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !is_composing(e)) {
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
            size="sm"
            style={{ height: "38px" }}
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
      ) : (
        <button
          className="text-xs font-medium underline underline-offset-2"
          disabled={phase === "processing"}
          style={{ color: colors.text_secondary }}
          type="button"
          onClick={() => set_show_promo_field(true)}
        >
          {t("settings.checkout_add_promo")}
        </button>
      )}
      {promo_result && !promo_result.valid && (
        <p className="text-xs mt-1.5" style={{ color: colors.danger }}>
          {t("settings.promo_invalid")}
        </p>
      )}
    </div>
  );

  const pay_action =
    requires_payment && selected_method === "wallet" && payment_request ? (
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
    ) : (
      <Button
        className="w-full"
        disabled={
          (requires_payment &&
            selected_method !== "crypto" &&
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
            {t("settings.processing_payment")}
            <Spinner size="sm" />
          </span>
        ) : !requires_payment ? (
          t("settings.subscribe_now")
        ) : (
          t("settings.checkout_pay_amount", {
            amount: money(total_after_credits_cents),
          })
        )}
      </Button>
    );

  return (
    <div className="flex flex-col lg:flex-row items-start gap-5">
      <div className="w-full min-w-0 flex-1 space-y-6">
        {plan_tier && (
          <CheckoutTermSelector
            colors={colors}
            disabled={phase === "processing"}
            on_select={set_selected_term}
            options={term_options}
            selected={active_term}
          />
        )}

        {requires_payment && (
          <CheckoutMethodList
            colors={colors}
            disabled={phase === "processing"}
            methods={method_options}
            on_select={change_payment_method}
            selected={selected_method}
          />
        )}

        {requires_payment && selected_method === "cashapp" && (
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

        {requires_payment && selected_method === "crypto" && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              backgroundColor: colors.bg_input,
              border: `1px solid ${colors.border_rest}`,
              color: colors.text_secondary,
            }}
          >
            {t("settings.checkout_method_crypto_note")}
          </div>
        )}

        {requires_payment && selected_method === "card" && (
          <section>
            <h4
              className="text-sm font-semibold mb-2.5"
              style={{ color: colors.text_primary }}
            >
              {t("settings.checkout_card_details")}
            </h4>
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
          </section>
        )}

        {error_message && (
          <div
            className="rounded-xl p-3 text-sm"
            style={{ backgroundColor: colors.danger, color: "#fff" }}
          >
            {error_message}
          </div>
        )}
      </div>

      <CheckoutSummary
        colors={colors}
        highlights={highlights}
        model={summary_model}
        promo_slot={promo_slot}
      >
        {pay_action}
      </CheckoutSummary>
    </div>
  );
}
