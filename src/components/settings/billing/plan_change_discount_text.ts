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
import type { TranslationKey } from "@/lib/i18n/types";
import type { PlanChangePreviewResponse } from "@/services/api/billing";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

type FormatPrice = (cents: number, currency: string) => string;

const PROMO_SERVER_CODE_KEYS: Record<string, TranslationKey> = {
  PROMO_CODE_INVALID: "settings.promo_error_invalid",
  PROMO_CODE_EXPIRED: "settings.promo_error_expired",
  PROMO_CODE_NOT_FOR_PLAN: "settings.promo_error_not_for_plan",
  PROMO_CODE_NOT_FOR_PLAN_CHANGE: "settings.promo_error_not_for_plan_change",
  PROMO_CODE_DISCOUNT_ACTIVE: "settings.promo_error_discount_active",
  PROMO_CODE_SAME_PLAN: "settings.promo_error_same_plan",
  PROMO_CODE_NOT_UPGRADE: "settings.promo_error_not_upgrade",
  RATE_LIMIT_EXCEEDED: "settings.checkout_rate_limited",
};

export function promo_server_code_key(
  server_code?: string | null,
): TranslationKey | undefined {
  return server_code ? PROMO_SERVER_CODE_KEYS[server_code] : undefined;
}

export function is_promo_code_rejection(server_code?: string | null): boolean {
  return Boolean(server_code?.startsWith("PROMO_CODE_"));
}

export function promo_code_error_text(
  t: Translate,
  server_code?: string | null,
): string {
  return t(
    promo_server_code_key(server_code) ?? "settings.promo_error_generic",
  );
}

export function plan_change_discount_text(
  t: Translate,
  format_price: FormatPrice,
  preview: PlanChangePreviewResponse,
  billing_interval: string,
): string {
  const discount =
    typeof preview.discount_percent_off === "number"
      ? t("settings.promo_discount_percent", {
          value: Number(preview.discount_percent_off.toFixed(2)),
        })
      : typeof preview.discount_amount_off_cents === "number"
        ? t("settings.plan_change_discount_amount", {
            amount: format_price(
              preview.discount_amount_off_cents,
              preview.currency,
            ),
          })
        : "";

  if (!discount) return "";

  const months = preview.discount_duration_in_months ?? 0;

  switch (preview.discount_duration) {
    case "forever":
      return t("settings.plan_change_discount_forever", { discount });
    case "repeating":
      if (months > 0 && !(billing_interval === "year" && months <= 12)) {
        return t("settings.plan_change_discount_months", {
          discount,
          count: months,
        });
      }

      return t("settings.plan_change_discount_once", { discount });
    default:
      return t("settings.plan_change_discount_once", { discount });
  }
}
