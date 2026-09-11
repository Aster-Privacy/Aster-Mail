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

import { describe, it, expect } from "vitest";

import {
  is_promo_code_rejection,
  plan_change_discount_text,
  promo_code_error_text,
  promo_server_code_key,
} from "./plan_change_discount_text";

const t = (key: TranslationKey, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const format_price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const base_preview: PlanChangePreviewResponse = {
  credit_cents: 0,
  amount_due_cents: 300,
  currency: "usd",
};

describe("plan_change_discount_text", () => {
  it("returns nothing when the coupon has no amount", () => {
    expect(
      plan_change_discount_text(t, format_price, base_preview, "month"),
    ).toBe("");
  });

  it("describes a percent discount that repeats for several months", () => {
    const text = plan_change_discount_text(
      t,
      format_price,
      {
        ...base_preview,
        discount_percent_off: 50,
        discount_duration: "repeating",
        discount_duration_in_months: 12,
      },
      "month",
    );

    expect(text).toBe(
      `settings.plan_change_discount_months:${JSON.stringify({
        discount: 'settings.promo_discount_percent:{"value":50}',
        count: 12,
      })}`,
    );
  });

  it("describes a repeating discount as one payment on yearly billing", () => {
    const text = plan_change_discount_text(
      t,
      format_price,
      {
        ...base_preview,
        discount_percent_off: 50,
        discount_duration: "repeating",
        discount_duration_in_months: 12,
      },
      "year",
    );

    expect(text.startsWith("settings.plan_change_discount_once:")).toBe(true);
  });

  it("keeps the month count on yearly billing past one year", () => {
    const text = plan_change_discount_text(
      t,
      format_price,
      {
        ...base_preview,
        discount_percent_off: 20,
        discount_duration: "repeating",
        discount_duration_in_months: 24,
      },
      "year",
    );

    expect(text.startsWith("settings.plan_change_discount_months:")).toBe(true);
  });

  it("describes a fixed amount discount on every payment", () => {
    const text = plan_change_discount_text(
      t,
      format_price,
      {
        ...base_preview,
        discount_amount_off_cents: 500,
        discount_duration: "forever",
      },
      "month",
    );

    expect(text).toBe(
      `settings.plan_change_discount_forever:${JSON.stringify({
        discount: 'settings.plan_change_discount_amount:{"amount":"$5.00"}',
      })}`,
    );
  });

  it("describes a one-time discount", () => {
    const text = plan_change_discount_text(
      t,
      format_price,
      {
        ...base_preview,
        discount_percent_off: 10,
        discount_duration: "once",
      },
      "month",
    );

    expect(text.startsWith("settings.plan_change_discount_once:")).toBe(true);
  });
});

describe("promo code errors", () => {
  it("maps each rejection code to its message", () => {
    expect(promo_code_error_text(t, "PROMO_CODE_INVALID")).toBe(
      "settings.promo_error_invalid",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_EXPIRED")).toBe(
      "settings.promo_error_expired",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_NOT_FOR_PLAN")).toBe(
      "settings.promo_error_not_for_plan",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_NOT_FOR_PLAN_CHANGE")).toBe(
      "settings.promo_error_not_for_plan_change",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_DISCOUNT_ACTIVE")).toBe(
      "settings.promo_error_discount_active",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_SAME_PLAN")).toBe(
      "settings.promo_error_same_plan",
    );
    expect(promo_code_error_text(t, "PROMO_CODE_NOT_UPGRADE")).toBe(
      "settings.promo_error_not_upgrade",
    );
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(promo_code_error_text(t, "STRIPE_ERROR")).toBe(
      "settings.promo_error_generic",
    );
    expect(promo_code_error_text(t, null)).toBe("settings.promo_error_generic");
    expect(promo_server_code_key(undefined)).toBeUndefined();
  });

  it("recognizes promo rejections only", () => {
    expect(is_promo_code_rejection("PROMO_CODE_EXPIRED")).toBe(true);
    expect(is_promo_code_rejection("CARD_DECLINED")).toBe(false);
    expect(is_promo_code_rejection(undefined)).toBe(false);
  });
});
