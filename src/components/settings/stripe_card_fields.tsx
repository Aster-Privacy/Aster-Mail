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
import type { theme_colors } from "./checkout_modal";

import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from "@stripe/react-stripe-js";

import { use_i18n } from "@/lib/i18n/context";

interface stripe_card_fields_props {
  colors: theme_colors;
  element_style: Record<string, unknown>;
  cardholder_name: string;
  set_cardholder_name: (v: string) => void;
  billing_postal: string;
  set_billing_postal: (v: string) => void;
  cardholder_input_ref: React.MutableRefObject<HTMLInputElement | null>;
  set_focused_field: (key: string | null) => void;
  set_hovered_field: (key: string | null) => void;
  set_ready_count: (updater: (c: number) => number) => void;
  handle_field_change: (
    key: "number" | "expiry" | "cvc",
    ev: { complete: boolean; error?: { message: string } },
  ) => void;
  field_wrapper: (
    key: "number" | "expiry" | "cvc",
    element: React.ReactNode,
  ) => React.ReactNode;
  native_input_style: (key: string) => React.CSSProperties;
}

export function StripeCardFields({
  colors,
  element_style,
  cardholder_name,
  set_cardholder_name,
  billing_postal,
  set_billing_postal,
  cardholder_input_ref,
  set_focused_field,
  set_hovered_field,
  set_ready_count,
  handle_field_change,
  field_wrapper,
  native_input_style,
}: stripe_card_fields_props) {
  const { t } = use_i18n();

  return (
    <div>
      <label
        className="block text-xs font-medium mb-2"
        style={{ color: colors.text_secondary }}
      >
        {t("settings.payment_details")}
      </label>
      <div className="space-y-3 relative">
        <div className="space-y-3">
          <div>
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: colors.text_secondary }}
            >
              {t("settings.card_number")}
            </label>
            {field_wrapper(
              "number",
              <CardNumberElement
                options={{
                  placeholder: "1234 1234 1234 1234",
                  showIcon: true,
                  style: element_style,
                }}
                onBlur={() => set_focused_field(null)}
                onChange={(e) => handle_field_change("number", e)}
                onFocus={() => set_focused_field("number")}
                onReady={() => set_ready_count((c) => c + 1)}
              />,
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label
                className="block text-[11px] font-medium mb-1.5"
                style={{ color: colors.text_secondary }}
              >
                {t("settings.card_expiry")}
              </label>
              {field_wrapper(
                "expiry",
                <CardExpiryElement
                  options={{
                    placeholder: "MM / YY",
                    style: element_style,
                  }}
                  onBlur={() => set_focused_field(null)}
                  onChange={(e) => handle_field_change("expiry", e)}
                  onFocus={() => set_focused_field("expiry")}
                  onReady={() => set_ready_count((c) => c + 1)}
                />,
              )}
            </div>
            <div className="flex-1">
              <label
                className="block text-[11px] font-medium mb-1.5"
                style={{ color: colors.text_secondary }}
              >
                {t("settings.card_cvc")}
              </label>
              {field_wrapper(
                "cvc",
                <CardCvcElement
                  options={{
                    placeholder: "CVC",
                    style: element_style,
                  }}
                  onBlur={() => set_focused_field(null)}
                  onChange={(e) => handle_field_change("cvc", e)}
                  onFocus={() => set_focused_field("cvc")}
                  onReady={() => set_ready_count((c) => c + 1)}
                />,
              )}
            </div>
          </div>
          <div>
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: colors.text_secondary }}
            >
              {t("settings.cardholder_name")}
            </label>
            <input
              ref={cardholder_input_ref}
              autoComplete="cc-name"
              placeholder={t("settings.cardholder_name_placeholder")}
              style={native_input_style("name")}
              type="text"
              value={cardholder_name}
              onBlur={() => set_focused_field(null)}
              onChange={(e) => set_cardholder_name(e.target.value)}
              onFocus={() => set_focused_field("name")}
              onMouseEnter={() => set_hovered_field("name")}
              onMouseLeave={() => set_hovered_field(null)}
            />
          </div>
          <div>
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: colors.text_secondary }}
            >
              {t("settings.billing_postal")}
            </label>
            <input
              autoComplete="postal-code"
              placeholder={t("settings.billing_postal_placeholder")}
              style={native_input_style("postal")}
              type="text"
              value={billing_postal}
              onBlur={() => set_focused_field(null)}
              onChange={(e) => set_billing_postal(e.target.value)}
              onFocus={() => set_focused_field("postal")}
              onMouseEnter={() => set_hovered_field("postal")}
              onMouseLeave={() => set_hovered_field(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
