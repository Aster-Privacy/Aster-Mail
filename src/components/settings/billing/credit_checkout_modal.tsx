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
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import {
  get_stripe_config,
  create_credit_payment_intent,
  confirm_credit_purchase,
  format_price,
  type CreditPackageItem,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import {
  use_stripe_theme_tokens,
  build_stripe_appearance,
} from "@/lib/stripe_appearance";

interface CreditPayFormProps {
  client_secret: string;
  payment_intent_id: string;
  price_display: string;
  currency: string;
  on_close: () => void;
  on_success: (new_balance_cents: number) => void;
}

function CreditPayForm({
  client_secret,
  payment_intent_id,
  price_display,
  currency,
  on_close,
  on_success,
}: CreditPayFormProps) {
  const { t } = use_i18n();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, set_submitting] = useState(false);
  const [error_msg, set_error_msg] = useState("");

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    set_submitting(true);
    set_error_msg("");

    const { error: submit_err } = await elements.submit();
    if (submit_err) {
      set_error_msg(submit_err.message ?? t("settings.payment_failed"));
      set_submitting(false);
      return;
    }

    const { error: confirm_err } = await stripe.confirmPayment({
      elements,
      clientSecret: client_secret,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}`,
      },
      redirect: "if_required",
    });

    if (confirm_err) {
      set_error_msg(confirm_err.message ?? t("settings.payment_failed"));
      set_submitting(false);
      return;
    }

    const res = await confirm_credit_purchase(payment_intent_id);
    if (res.data?.credited) {
      on_success(res.data.balance_cents);
    } else {
      set_error_msg(t("settings.payment_failed"));
      set_submitting(false);
    }
  };

  return (
    <form onSubmit={handle_submit} className="space-y-4">
      <PaymentElement />
      {error_msg && (
        <p className="text-sm text-red-500">{error_msg}</p>
      )}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={on_close}
          className="flex-1"
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={submitting || !stripe}
          className="flex-1"
        >
          {submitting ? t("settings.buying_credits") : `${t("settings.buy_credits")} - ${price_display}`}
        </Button>
      </div>
    </form>
  );
}

interface CreditCheckoutModalProps {
  open: boolean;
  package_item: CreditPackageItem | null;
  currency: string;
  on_close: () => void;
  on_success: (new_balance_cents: number) => void;
}

export function CreditCheckoutModal({
  open,
  package_item,
  currency,
  on_close,
  on_success,
}: CreditCheckoutModalProps) {
  const { t } = use_i18n();
  const { theme } = useTheme();
  const stripe_tokens = use_stripe_theme_tokens();
  const [stripe_promise, set_stripe_promise] = useState<Promise<Stripe | null> | null>(null);
  const [client_secret, set_client_secret] = useState<string | null>(null);
  const [payment_intent_id, set_payment_intent_id] = useState<string | null>(null);
  const [phase, set_phase] = useState<"loading" | "ready" | "success" | "error">("loading");
  const [error_msg, set_error_msg] = useState("");
  const [price_display, set_price_display] = useState("");
  const initialized = useRef(false);

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
                { family: "Google Sans Flex", src: `url(${font_origin}/fonts/GoogleSansFlex-400.woff2)`, weight: "400", style: "normal" as const, display: "swap" as const },
                { family: "Google Sans Flex", src: `url(${font_origin}/fonts/GoogleSansFlex-500.woff2)`, weight: "500", style: "normal" as const, display: "swap" as const },
                { family: "Google Sans Flex", src: `url(${font_origin}/fonts/GoogleSansFlex-600.woff2)`, weight: "600", style: "normal" as const, display: "swap" as const },
              ];
            })()
          : [],
      loader: "never" as const,
    }),
    [stripe_tokens],
  );

  const initialize = useCallback(async () => {
    if (!package_item) return;
    set_phase("loading");
    set_error_msg("");

    try {
      const config_res = await get_stripe_config();
      if (!config_res.data?.publishable_key || !config_res.data.is_enabled) {
        set_error_msg(t("settings.stripe_not_configured"));
        set_phase("error");
        return;
      }
      set_stripe_promise(loadStripe(config_res.data.publishable_key));

      const pi_res = await create_credit_payment_intent(package_item.id, currency);
      if (!pi_res.data?.client_secret) {
        set_error_msg(t("settings.failed_checkout"));
        set_phase("error");
        return;
      }
      set_client_secret(pi_res.data.client_secret);
      set_payment_intent_id(pi_res.data.payment_intent_id);
      set_price_display(format_price(pi_res.data.amount_cents, pi_res.data.currency));
      set_phase("ready");
    } catch {
      set_error_msg(t("settings.failed_checkout"));
      set_phase("error");
    }
  }, [package_item, currency, t]);

  useEffect(() => {
    if (open && !initialized.current) {
      initialized.current = true;
      initialize();
    } else if (!open) {
      initialized.current = false;
      set_client_secret(null);
      set_payment_intent_id(null);
      set_phase("loading");
    }
  }, [open, initialize]);

  const handle_success = useCallback((new_balance_cents: number) => {
    set_phase("success");
    on_success(new_balance_cents);
  }, [on_success]);

  const handle_close = useCallback(() => {
    if (phase === "loading") return;
    on_close();
  }, [phase, on_close]);

  const render_body = () => {
    if (phase === "success") {
      return (
        <div className="flex flex-col items-center gap-4 py-8">
          <CheckIcon className="w-10 h-10 text-green-500" strokeWidth={2.5} />
          <div className="text-center">
            <p className="text-base font-semibold text-txt-primary">
              {t("settings.payment_success")}
            </p>
            <p className="text-sm text-txt-muted mt-1">
              {t("settings.credits_added_to_account")}
            </p>
          </div>
        </div>
      );
    }

    if (phase === "loading") {
      return (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="w-6 h-6 rounded-full animate-spin border-2 border-edge-secondary border-t-txt-muted" />
          <p className="text-sm text-txt-muted">{t("settings.preparing_checkout")}</p>
        </div>
      );
    }

    if (phase === "error") {
      return (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-red-500 text-center">{error_msg || t("settings.failed_checkout")}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handle_close}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={initialize}>{t("settings.try_again")}</Button>
          </div>
        </div>
      );
    }

    if (!stripe_promise || !client_secret || !payment_intent_id) return null;

    return (
      <Elements
        stripe={stripe_promise}
        options={{ ...elements_options, clientSecret: client_secret }}
      >
        <CreditPayForm
          client_secret={client_secret}
          payment_intent_id={payment_intent_id}
          price_display={price_display}
          currency={currency}
          on_close={handle_close}
          on_success={handle_success}
        />
      </Elements>
    );
  };

  const total_credits = package_item
    ? package_item.amount_cents + package_item.bonus_cents
    : 0;

  return (
    <Modal
      close_on_overlay={false}
      is_open={open}
      on_close={handle_close}
      show_close_button={phase !== "loading"}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>
          {phase === "success"
            ? t("settings.payment_complete")
            : t("settings.top_up_credits")}
        </ModalTitle>
        {phase !== "success" && package_item && (
          <ModalDescription>
            {format_price(total_credits)} {t("settings.in_credits")}
          </ModalDescription>
        )}
      </ModalHeader>
      <ModalBody>{render_body()}</ModalBody>
    </Modal>
  );
}
