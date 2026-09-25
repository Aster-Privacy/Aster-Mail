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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import text_logo_url from "@/assets/text_logo.webp";
import { BILLING_CARD_CLASS } from "@/components/settings/billing/billing_skeleton";
import {
  convert_cents,
  is_crypto_provider,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import {
  format_date,
  format_price,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface BillingHeroCardProps {
  subscription: SubscriptionResponse;
  preferred_currency: string;
  current_billing_interval: "month" | "year" | "biennial";
  has_payment_failed: boolean;
  grace_days_remaining: number;
  is_over_limit: boolean;
  is_action_loading: boolean;
  on_manage_plan: () => void;
  on_manage_billing: () => void;
  on_reactivate: () => void;
  on_renew_with_crypto: () => void;
  on_scroll_to_plans: () => void;
}

export function BillingHeroCard({
  subscription,
  preferred_currency,
  current_billing_interval,
  has_payment_failed,
  grace_days_remaining,
  is_over_limit,
  is_action_loading,
  on_manage_plan,
  on_manage_billing,
  on_reactivate,
  on_renew_with_crypto,
  on_scroll_to_plans,
}: BillingHeroCardProps) {
  const { t } = use_i18n();
  const is_paid_plan = subscription.plan.code !== "free";
  const is_crypto = is_crypto_provider(subscription.payment_provider);
  const is_canceled =
    subscription.status === "canceled" || subscription.status === "cancelled";
  const ends_on = subscription.cancel_at_period_end
    ? subscription.current_period_end
    : null;
  const starter_price = format_price(
    convert_cents(PLAN_TIERS[0].monthly_cents, preferred_currency),
    preferred_currency,
  );
  const interval_label =
    current_billing_interval === "biennial"
      ? t("settings.per_two_years")
      : current_billing_interval === "year"
        ? t("settings.per_year_short")
        : t("settings.per_month_short");

  let status_label: string | null = null;
  let status_color = "var(--color-success)";

  if (is_paid_plan) {
    if (has_payment_failed) {
      status_label = t("settings.bill_status_payment_needed");
      status_color = "var(--color-danger)";
    } else if (is_canceled) {
      status_label = t("settings.bill_status_canceled");
      status_color = "var(--color-danger)";
    } else if (ends_on) {
      status_label = t("settings.bill_status_ends", {
        date: format_date(ends_on),
      });
      status_color = "var(--color-warning)";
    } else {
      status_label = t("settings.bill_status_active");
    }
  }

  let detail_line: string | null = null;

  if (!is_paid_plan) {
    detail_line = t("settings.free_upgrade_price_note", {
      price: starter_price,
    });
  } else if (is_crypto && subscription.paid_until) {
    detail_line = t("settings.bill_paid_until_crypto", {
      date: format_date(subscription.paid_until),
    });
  } else if (subscription.current_period_end && !ends_on) {
    detail_line = t("settings.bill_renews_on", {
      date: format_date(subscription.current_period_end),
    });
  }

  return (
    <>
      {has_payment_failed && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: "var(--color-danger)" }}
        >
          <ExclamationTriangleIcon
            className="mt-0.5 h-5 w-5 flex-shrink-0"
            style={{ color: "var(--color-danger)" }}
          />
          <div className="flex-1">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--color-danger)" }}
            >
              {t("settings.payment_failed_warning")}
            </p>
            <p className="mt-1 text-xs text-txt-muted">
              {t("settings.grace_period_remaining", {
                days: grace_days_remaining,
              })}
            </p>
            <button
              className="mt-2 text-sm font-semibold hover:underline disabled:opacity-50"
              disabled={is_action_loading}
              style={{ color: "var(--accent-blue)" }}
              type="button"
              onClick={on_manage_billing}
            >
              {t("settings.bill_update_payment")}
            </button>
          </div>
        </div>
      )}

      {is_over_limit && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: "var(--destructive)" }}
        >
          <ExclamationTriangleIcon
            className="mt-0.5 h-5 w-5 flex-shrink-0"
            style={{ color: "var(--destructive)" }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--destructive)" }}
            >
              {t("settings.storage_limit_exceeded")}
            </p>
            <p className="mt-1 text-xs text-txt-muted">
              {t("settings.storage_limit_description")}
            </p>
          </div>
        </div>
      )}

      <div className={`${BILLING_CARD_CLASS} p-5`}>
        <div className="flex items-center gap-2">
          <img alt="Aster" className="h-[18px] w-auto" src={text_logo_url} />
          <span className="text-2xl font-bold leading-none text-txt-primary">
            {is_paid_plan ? subscription.plan.name : t("settings.free")}
          </span>
        </div>

        {status_label && (
          <p
            className="mt-2 text-sm font-semibold"
            style={{ color: status_color }}
          >
            {status_label}
          </p>
        )}

        {is_paid_plan && subscription.active_discount_description && (
          <p
            className="mt-1 text-xs font-semibold"
            style={{ color: "var(--color-success)" }}
          >
            {subscription.active_discount_description}
          </p>
        )}

        <p className="mt-4 text-[22px] font-semibold leading-none text-txt-primary">
          {is_paid_plan
            ? format_price(
                convert_cents(
                  subscription.plan.price_cents,
                  preferred_currency,
                ),
                preferred_currency,
              )
            : t("settings.free")}
          {is_paid_plan && (
            <span className="text-[13px] font-normal text-txt-muted">
              {interval_label}
            </span>
          )}
        </p>

        {detail_line && (
          <p className="mt-2 text-[13px] text-txt-muted">{detail_line}</p>
        )}

        {is_paid_plan && is_crypto && (
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warning)" }}
          >
            {t("settings.crypto_no_renew_notice")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!is_paid_plan && (
            <Button
              className="w-full sm:w-auto sm:min-w-[160px]"
              size="md"
              variant="depth"
              onClick={on_scroll_to_plans}
            >
              {t("settings.bill_upgrade")}
            </Button>
          )}
          {is_paid_plan && subscription.cancel_at_period_end && (
            <Button
              className="w-full sm:w-auto sm:min-w-[160px]"
              disabled={is_action_loading}
              size="md"
              variant="depth"
              onClick={on_reactivate}
            >
              {t("settings.reactivate")}
            </Button>
          )}
          {is_paid_plan && !subscription.cancel_at_period_end && (
            <Button
              className="w-full sm:w-auto sm:min-w-[160px]"
              disabled={is_action_loading}
              size="md"
              variant={is_crypto ? "outline" : "depth"}
              onClick={on_manage_plan}
            >
              {t("settings.bill_manage_plan")}
            </Button>
          )}
          {is_paid_plan && is_crypto && (
            <button
              className="text-sm font-semibold hover:underline disabled:opacity-50"
              disabled={is_action_loading}
              style={{ color: "var(--accent-blue)" }}
              type="button"
              onClick={on_renew_with_crypto}
            >
              {t("settings.bill_renew_with_crypto")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
