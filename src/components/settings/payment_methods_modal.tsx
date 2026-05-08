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
import { useState, useEffect, useCallback, useMemo } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  CreditCardIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  StarIcon,
  BuildingLibraryIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import {
  list_payment_methods,
  create_setup_intent,
  set_default_payment_method,
  detach_payment_method,
  get_stripe_config,
  type PaymentMethodItem,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { connection_store } from "@/services/routing/connection_store";
import { use_i18n } from "@/lib/i18n/context";
import {
  use_stripe_theme_tokens,
  build_stripe_appearance,
  build_stripe_element_style,
} from "@/lib/stripe_appearance";

function get_pm_icon(pm_type: string) {
  switch (pm_type) {
    case "us_bank_account":
      return (
        <BuildingLibraryIcon
          className="w-5 h-5 flex-shrink-0"
          style={{ color: "var(--text-tertiary)" }}
        />
      );
    case "cashapp":
    case "klarna":
      return (
        <BanknotesIcon
          className="w-5 h-5 flex-shrink-0"
          style={{ color: "var(--text-tertiary)" }}
        />
      );
    default:
      return (
        <CreditCardIcon
          className="w-5 h-5 flex-shrink-0"
          style={{ color: "var(--text-tertiary)" }}
        />
      );
  }
}

interface AddPaymentFormProps {
  on_added: () => void;
  on_cancel: () => void;
}

interface AddPaymentFormInnerProps extends AddPaymentFormProps {
  client_secret: string;
}

function AddPaymentForm({
  on_added,
  on_cancel,
  client_secret,
}: AddPaymentFormInnerProps) {
  const { t } = use_i18n();
  const tokens = use_stripe_theme_tokens();
  const stripe = useStripe();
  const elements = useElements();
  const [is_submitting, set_is_submitting] = useState(false);
  const [cardholder_name, set_cardholder_name] = useState("");
  const [billing_postal, set_billing_postal] = useState("");

  const element_style = useMemo(
    () => build_stripe_element_style(tokens),
    [tokens],
  );

  const handle_submit = useCallback(async () => {
    if (!stripe || !elements) return;

    const card_number = elements.getElement(CardNumberElement);

    if (!card_number) return;

    set_is_submitting(true);

    try {
      const { error } = await stripe.confirmCardSetup(client_secret, {
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

      if (error) {
        show_toast(error.message || t("settings.payment_failed"), "error");
        set_is_submitting(false);

        return;
      }

      show_toast(t("settings.card_added"), "success");
      on_added();
    } catch {
      show_toast(t("settings.payment_failed"), "error");
      set_is_submitting(false);
    }
  }, [
    stripe,
    elements,
    client_secret,
    cardholder_name,
    billing_postal,
    on_added,
    t,
  ]);

  const field_wrapper_style = {
    backgroundColor: "var(--bg-tertiary)",
    borderColor: "var(--border-secondary)",
  } as const;

  return (
    <div className="space-y-3">
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("settings.card_number")}
        </label>
        <div
          className="rounded-lg border px-3 py-2.5"
          style={field_wrapper_style}
        >
          <CardNumberElement
            options={{ style: element_style, showIcon: true }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            {t("settings.card_expiry")}
          </label>
          <div
            className="rounded-lg border px-3 py-2.5"
            style={field_wrapper_style}
          >
            <CardExpiryElement options={{ style: element_style }} />
          </div>
        </div>
        <div>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            {t("settings.card_cvc")}
          </label>
          <div
            className="rounded-lg border px-3 py-2.5"
            style={field_wrapper_style}
          >
            <CardCvcElement options={{ style: element_style }} />
          </div>
        </div>
      </div>
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("settings.cardholder_name")}
        </label>
        <input
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
          placeholder={t("settings.cardholder_name_placeholder")}
          style={{
            ...field_wrapper_style,
            color: "var(--text-primary)",
          }}
          type="text"
          value={cardholder_name}
          onChange={(e) => set_cardholder_name(e.target.value)}
        />
      </div>
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("settings.billing_postal")}
        </label>
        <input
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
          placeholder={t("settings.billing_postal_placeholder")}
          style={{
            ...field_wrapper_style,
            color: "var(--text-primary)",
          }}
          type="text"
          value={billing_postal}
          onChange={(e) => set_billing_postal(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button disabled={is_submitting} variant="outline" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!stripe || !elements || is_submitting}
          variant="primary"
          onClick={handle_submit}
        >
          {is_submitting ? (
            <span className="flex items-center gap-2">
              <Spinner size="xs" />
              {t("settings.adding_card")}
            </span>
          ) : (
            t("settings.save_card")
          )}
        </Button>
      </div>
    </div>
  );
}

interface PaymentMethodsModalProps {
  open: boolean;
  on_close: () => void;
}

export function PaymentMethodsModal({
  open,
  on_close,
}: PaymentMethodsModalProps) {
  const { t } = use_i18n();
  const tokens = use_stripe_theme_tokens();
  const [methods, set_methods] = useState<PaymentMethodItem[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [default_loading_id, set_default_loading_id] = useState<string | null>(
    null,
  );
  const [delete_loading_id, set_delete_loading_id] = useState<string | null>(
    null,
  );
  const [show_add_form, set_show_add_form] = useState(false);
  const [stripe_promise, set_stripe_promise] =
    useState<Promise<Stripe | null> | null>(null);
  const [client_secret, set_client_secret] = useState<string | null>(null);

  const stripe_appearance = useMemo(
    () => build_stripe_appearance(tokens),
    [tokens],
  );

  const fetch_methods = useCallback(async () => {
    set_is_loading(true);
    try {
      const response = await list_payment_methods();

      if (response.data?.payment_methods) {
        set_methods(response.data.payment_methods);
      }
    } catch {
      if (import.meta.env.DEV) {
        console.error("Failed to fetch payment methods");
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetch_methods();
      set_show_add_form(false);
      set_client_secret(null);
    }
  }, [open, fetch_methods]);

  const handle_set_default = useCallback(
    async (id: string) => {
      set_default_loading_id(id);
      try {
        await set_default_payment_method(id);
        show_toast(t("settings.default_updated"), "success");
        await fetch_methods();
      } catch {
        show_toast(t("settings.payment_failed"), "error");
      } finally {
        set_default_loading_id(null);
      }
    },
    [fetch_methods, t],
  );

  const handle_delete = useCallback(
    async (id: string) => {
      set_delete_loading_id(id);
      try {
        await detach_payment_method(id);
        show_toast(t("settings.card_removed"), "success");
        await fetch_methods();
      } catch {
        show_toast(t("settings.payment_failed"), "error");
      } finally {
        set_delete_loading_id(null);
      }
    },
    [fetch_methods, t],
  );

  const handle_show_add_form = useCallback(async () => {
    const method = connection_store.get_method();

    if (method === "tor" || method === "tor_snowflake") {
      show_toast(t("settings.connection.tor_blocked"), "error");

      return;
    }

    try {
      const config_response = await get_stripe_config();

      if (
        !config_response.data?.publishable_key ||
        !config_response.data.is_enabled
      ) {
        show_toast(t("settings.stripe_not_configured"), "error");

        return;
      }

      const stripe_loaded = loadStripe(config_response.data.publishable_key);

      set_stripe_promise(stripe_loaded);

      const setup_response = await create_setup_intent();

      if (!setup_response.data?.client_secret) {
        show_toast(t("settings.payment_failed"), "error");

        return;
      }

      set_client_secret(setup_response.data.client_secret);
      set_show_add_form(true);
    } catch {
      show_toast(t("settings.payment_failed"), "error");
    }
  }, [t]);

  const handle_added = useCallback(async () => {
    set_show_add_form(false);
    set_client_secret(null);
    await fetch_methods();

    const response = await list_payment_methods();
    const updated = response.data?.payment_methods || [];
    const has_default = updated.some((m) => m.is_default);

    if (!has_default && updated.length > 0) {
      try {
        await set_default_payment_method(updated[0].id);
        await fetch_methods();
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("failed to set default payment method", err);
      }
    }
  }, [fetch_methods]);

  const handle_cancel_add = useCallback(() => {
    set_show_add_form(false);
    set_client_secret(null);
  }, []);

  const render_method_item = (method: PaymentMethodItem) => {
    const is_setting_default = default_loading_id === method.id;
    const is_deleting = delete_loading_id === method.id;
    const is_any_busy =
      default_loading_id !== null || delete_loading_id !== null;

    return (
      <div
        key={method.id}
        className="flex items-center justify-between rounded-lg border p-3"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <div className="flex items-center gap-3">
          {get_pm_icon(method.pm_type)}
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {method.display_name}
              </span>
              {method.is_default && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: "#16a34a",
                    color: "#fff",
                  }}
                >
                  <CheckIcon className="w-3 h-3" />
                  {t("settings.default_card")}
                </span>
              )}
            </div>
            {method.pm_type === "card" &&
              method.exp_month &&
              method.exp_year && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.card_expires")}{" "}
                  {String(method.exp_month).padStart(2, "0")}/
                  {String(method.exp_year).slice(-2)}
                </span>
              )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!method.is_default && (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              disabled={is_any_busy}
              style={{ color: "var(--text-secondary)" }}
              onClick={() => handle_set_default(method.id)}
            >
              {is_setting_default ? (
                <Spinner size="xs" />
              ) : (
                <>
                  <StarIcon className="w-3.5 h-3.5" />
                  {t("common.set_as_default")}
                </>
              )}
            </button>
          )}
          <button
            className="flex items-center justify-center rounded-md p-1.5 transition-colors hover:opacity-80"
            disabled={is_any_busy}
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => handle_delete(method.id)}
          >
            {is_deleting ? (
              <Spinner size="xs" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  const render_content = () => {
    if (is_loading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div
            className="w-6 h-6 rounded-full animate-spin"
            style={{
              border: "2.5px solid var(--border-secondary)",
              borderTopColor: "var(--text-tertiary)",
            }}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {methods.length === 0 && !show_add_form && (
          <div
            className="rounded-lg border p-6 text-center"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <CreditCardIcon
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: "var(--text-tertiary)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {t("settings.no_payment_methods")}
            </p>
          </div>
        )}

        {methods.length > 0 && (
          <div className="space-y-2">{methods.map(render_method_item)}</div>
        )}

        {show_add_form && stripe_promise && client_secret ? (
          <Elements
            options={{
              clientSecret: client_secret,
              appearance: stripe_appearance,
            }}
            stripe={stripe_promise}
          >
            <AddPaymentForm
              client_secret={client_secret}
              on_added={handle_added}
              on_cancel={handle_cancel_add}
            />
          </Elements>
        ) : (
          <Button
            className="w-full"
            variant="outline"
            onClick={handle_show_add_form}
          >
            <PlusIcon className="w-4 h-4" />
            {t("settings.add_payment_method")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Modal show_close_button is_open={open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.payment_methods_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.payment_methods_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>{render_content()}</ModalBody>
    </Modal>
  );
}
