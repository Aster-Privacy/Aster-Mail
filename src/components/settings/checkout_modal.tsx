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
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { PaymentForm } from "./payment_form";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import {
  get_stripe_config,
  create_addon_subscription,
  type PromoValidateResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import {
  use_stripe_theme_tokens,
  build_stripe_appearance,
} from "@/lib/stripe_appearance";

export type checkout_phase =
  | "loading"
  | "ready"
  | "processing"
  | "success"
  | "error";

export interface theme_colors {
  text_primary: string;
  text_secondary: string;
  text_tertiary: string;
  bg_input: string;
  border_rest: string;
  border_hover: string;
  accent: string;
  danger: string;
  success: string;
}

function get_theme_colors(is_dark: boolean): theme_colors {
  return is_dark
    ? {
        text_primary: "#f5f5f5",
        text_secondary: "#cbd5e1",
        text_tertiary: "#6b7280",
        bg_input: "rgba(255, 255, 255, 0.04)",
        border_rest: "rgba(255, 255, 255, 0.1)",
        border_hover: "rgba(255, 255, 255, 0.18)",
        accent: "#3b82f6",
        danger: "#ef4444",
        success: "#22c55e",
      }
    : {
        text_primary: "#1a1a1a",
        text_secondary: "#334155",
        text_tertiary: "#9ca3af",
        bg_input: "#ffffff",
        border_rest: "rgba(0, 0, 0, 0.1)",
        border_hover: "rgba(0, 0, 0, 0.18)",
        accent: "#3b82f6",
        danger: "#ef4444",
        success: "#22c55e",
      };
}

export function compute_discount(
  price_cents: number,
  promo: PromoValidateResponse | null,
): { discounted_cents: number; is_free: boolean } {
  if (!promo || !promo.valid) {
    return { discounted_cents: price_cents, is_free: price_cents === 0 };
  }
  if (
    (promo.discount_type === "percent_off" ||
      promo.discount_type === "percentage") &&
    promo.discount_value != null
  ) {
    const off = Math.round((price_cents * promo.discount_value) / 100);
    const cents = Math.max(0, price_cents - off);

    return { discounted_cents: cents, is_free: cents === 0 };
  }
  if (
    (promo.discount_type === "amount_off" ||
      promo.discount_type === "amount") &&
    promo.discount_value != null
  ) {
    const cents = Math.max(0, price_cents - promo.discount_value);

    return { discounted_cents: cents, is_free: cents === 0 };
  }

  return { discounted_cents: price_cents, is_free: price_cents === 0 };
}

interface CheckoutModalProps {
  open: boolean;
  plan_code: string;
  plan_name: string;
  billing_interval: string;
  currency: string;
  price_display: string;
  addon_id?: string;
  price_cents?: number;
  current_plan_price_cents?: number;
  on_close: () => void;
  on_success: () => void;
}

export function CheckoutModal({
  open,
  plan_code,
  plan_name,
  billing_interval,
  currency,
  price_display,
  addon_id,
  price_cents,
  current_plan_price_cents,
  on_close,
  on_success,
}: CheckoutModalProps) {
  const { t } = use_i18n();
  const { theme } = useTheme();
  const stripe_tokens = use_stripe_theme_tokens();
  const [phase, set_phase] = useState<checkout_phase>("loading");
  const [stripe_promise, set_stripe_promise] =
    useState<Promise<Stripe | null> | null>(null);
  const [addon_client_secret, set_addon_client_secret] = useState<
    string | null
  >(null);
  const [error_message, set_error_message] = useState("");
  const [promo_code, set_promo_code] = useState("");
  const [promo_result, set_promo_result] =
    useState<PromoValidateResponse | null>(null);
  const [is_validating_promo, set_is_validating_promo] = useState(false);
  const has_initialized = useRef(false);

  const colors = useMemo(() => get_theme_colors(theme === "dark"), [theme]);

  const effective_price_cents =
    (addon_id && price_cents && current_plan_price_cents
      ? price_cents + current_plan_price_cents
      : price_cents) ?? 0;

  const initialize = useCallback(async () => {
    set_phase("loading");
    set_error_message("");

    try {
      const config_response = await get_stripe_config();

      if (
        !config_response.data?.publishable_key ||
        !config_response.data.is_enabled
      ) {
        set_error_message(t("settings.stripe_not_configured"));
        set_phase("error");

        return;
      }

      set_stripe_promise(loadStripe(config_response.data.publishable_key));

      if (addon_id) {
        const addon_response = await create_addon_subscription(addon_id);
        const secret = addon_response.data?.client_secret;

        if (!secret) {
          set_error_message(t("settings.failed_checkout"));
          set_phase("error");

          return;
        }
        set_addon_client_secret(secret);
      }

      set_phase("ready");
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      set_error_message(t("settings.failed_checkout"));
      set_phase("error");
    }
  }, [addon_id, t]);

  useEffect(() => {
    if (open && !has_initialized.current) {
      has_initialized.current = true;
      set_promo_code("");
      set_promo_result(null);
      set_is_validating_promo(false);
      set_addon_client_secret(null);
      initialize();
    } else if (!open) {
      has_initialized.current = false;
    }
  }, [open, initialize]);

  const handle_close = useCallback(() => {
    if (phase === "processing") return;
    on_close();
  }, [phase, on_close]);

  const elements_options = useMemo(
    () => ({
      appearance: build_stripe_appearance(stripe_tokens),
      fonts:
        typeof window !== "undefined"
          ? (() => {
              const font_origin =
                "__TAURI_INTERNALS__" in window
                  ? "https://app.astermail.org"
                  : window.location.origin;

              return [
                {
                  family: "Google Sans Flex",
                  src: `url(${font_origin}/fonts/GoogleSansFlex-400.woff2)`,
                  weight: "400",
                  style: "normal" as const,
                  display: "swap" as const,
                },
                {
                  family: "Google Sans Flex",
                  src: `url(${font_origin}/fonts/GoogleSansFlex-500.woff2)`,
                  weight: "500",
                  style: "normal" as const,
                  display: "swap" as const,
                },
                {
                  family: "Google Sans Flex",
                  src: `url(${font_origin}/fonts/GoogleSansFlex-600.woff2)`,
                  weight: "600",
                  style: "normal" as const,
                  display: "swap" as const,
                },
              ];
            })()
          : [],
      loader: "never" as const,
    }),
    [stripe_tokens],
  );

  const render_content = () => {
    if (phase === "success") {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <CheckIcon
            className="w-10 h-10"
            strokeWidth={2.5}
            style={{ color: colors.success }}
          />
          <div className="text-center">
            <p
              className="text-base font-semibold"
              style={{ color: colors.text_primary }}
            >
              {t("settings.payment_success")}
            </p>
            <p className="text-sm mt-1" style={{ color: colors.text_tertiary }}>
              {t("settings.checkout_welcome")}
            </p>
          </div>
        </div>
      );
    }

    if (phase === "loading") {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div
            className="w-6 h-6 rounded-full animate-spin"
            style={{
              border: `2.5px solid ${colors.border_rest}`,
              borderTopColor: colors.text_tertiary,
            }}
          />
          <p className="text-sm" style={{ color: colors.text_tertiary }}>
            {t("settings.preparing_checkout")}
          </p>
        </div>
      );
    }

    if (phase === "error") {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: colors.danger, color: "#fff" }}
          >
            <p className="text-sm font-medium text-white">
              {error_message || t("settings.failed_checkout")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={initialize}>
              {t("settings.try_again")}
            </Button>
          </div>
        </div>
      );
    }

    if (!stripe_promise) return null;

    return (
      <Elements options={elements_options} stripe={stripe_promise}>
        <PaymentForm
          addon_client_secret={addon_client_secret}
          addon_id={addon_id}
          billing_interval={billing_interval}
          colors={colors}
          currency={currency}
          error_message={error_message}
          is_validating_promo={is_validating_promo}
          on_close={handle_close}
          on_success={on_success}
          phase={phase}
          plan_code={plan_code}
          plan_name={plan_name}
          price_cents={effective_price_cents}
          price_display={price_display}
          promo_code={promo_code}
          promo_result={promo_result}
          set_error_message={set_error_message}
          set_is_validating_promo={set_is_validating_promo}
          set_phase={set_phase}
          set_promo_code={set_promo_code}
          set_promo_result={set_promo_result}
        />
      </Elements>
    );
  };

  return (
    <Modal
      close_on_overlay={phase !== "processing"}
      is_open={open}
      on_close={handle_close}
      show_close_button={phase !== "processing"}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>
          {phase === "success"
            ? t("settings.payment_complete")
            : t("settings.checkout_title")}
        </ModalTitle>
        {phase !== "success" && (
          <ModalDescription>
            {t("settings.checkout_description")}
          </ModalDescription>
        )}
      </ModalHeader>
      <ModalBody>{render_content()}</ModalBody>
    </Modal>
  );
}
