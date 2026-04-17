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

import { TagIcon } from "@heroicons/react/24/outline";

import {
  format_price,
  type PromoValidateResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface pricing_display_props {
  plan_name: string;
  billing_interval: string;
  price_display: string;
  price_cents: number;
  currency: string;
  is_free: boolean;
  discounted_display: string;
  show_strikethrough: boolean;
  interval_label: string;
  promo_result: PromoValidateResponse | null;
  colors: theme_colors;
}

export function PricingDisplay({
  plan_name,
  billing_interval,
  price_display,
  price_cents,
  currency,
  is_free,
  discounted_display,
  show_strikethrough,
  interval_label,
  promo_result,
  colors,
}: pricing_display_props) {
  const { t } = use_i18n();

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: colors.bg_input,
        borderColor: colors.border_rest,
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: colors.text_primary }}
          >
            {plan_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.text_tertiary }}>
            {billing_interval === "year"
              ? t("settings.billing_yearly")
              : t("settings.billing_monthly")}
          </p>
        </div>
        <div className="text-right">
          {show_strikethrough && (
            <p
              className="text-xs line-through"
              style={{ color: colors.text_tertiary }}
            >
              {price_display}
            </p>
          )}
          <p
            className="text-lg font-bold"
            style={{ color: colors.text_primary }}
          >
            {is_free ? t("settings.free") : discounted_display}
            {!is_free && (
              <span
                className="text-xs font-normal ml-0.5"
                style={{ color: colors.text_tertiary }}
              >
                {interval_label}
              </span>
            )}
          </p>
        </div>
      </div>

      {promo_result?.valid && promo_result.description && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: `1px solid ${colors.border_rest}` }}
        >
          <div className="flex items-center gap-2">
            <TagIcon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: colors.success }}
            />
            <p
              className="text-xs font-medium"
              style={{ color: colors.success }}
            >
              {promo_result.description}
            </p>
          </div>
          {promo_result.duration === "repeating" &&
            promo_result.duration_in_months && (
              <p
                className="text-xs mt-1.5 ml-5"
                style={{ color: colors.text_tertiary }}
              >
                {t("settings.promo_then_reverts", {
                  price: format_price(price_cents, currency),
                  interval: interval_label || "",
                  months: promo_result.duration_in_months,
                })}
              </p>
            )}
          {promo_result.duration === "once" && (
            <p
              className="text-xs mt-1.5 ml-5"
              style={{ color: colors.text_tertiary }}
            >
              {t("settings.promo_once_reverts", {
                price: format_price(price_cents, currency),
                interval: interval_label || "",
                period:
                  billing_interval === "year"
                    ? t("settings.discount_first_year")
                    : t("settings.discount_first_month"),
              })}
            </p>
          )}
          {promo_result.duration === "forever" && (
            <p
              className="text-xs mt-1.5 ml-5"
              style={{ color: colors.text_tertiary }}
            >
              {t("settings.promo_forever")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
