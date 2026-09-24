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
import type { PlanFeature } from "@/components/settings/billing/plan_card";

import { Progress } from "@/components/ui/progress";
import {
  format_storage,
  format_price,
  format_date,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import {
  convert_cents,
  is_crypto_provider,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import {
  BillingNotice,
  BillingSectionLabel,
} from "@/components/settings/billing/billing_layout";
import { card_decline_message_key } from "@/components/settings/billing/card_decline_notice";

interface CurrentPlanCardProps {
  subscription: SubscriptionResponse | null;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percentage: number;
  is_over_limit: boolean;
  is_action_loading: boolean;
  has_payment_failed: boolean;
  grace_days_remaining: number;
  current_billing_interval: "month" | "year" | "biennial";
  on_scroll_to_plans: () => void;
  on_manage_billing: () => void;
  on_reactivate: () => void;
  on_manage_plan: () => void;
  on_renew_with_crypto?: () => void;
  on_add_storage?: () => void;
  on_toggle_plans?: () => void;
  plans_open?: boolean;
  preferred_currency: string;
  upgrade_features?: PlanFeature[];
  include_notices?: boolean;
  show_storage?: boolean;
}

type CurrentPlanNoticesProps = Pick<
  CurrentPlanCardProps,
  | "subscription"
  | "is_over_limit"
  | "is_action_loading"
  | "has_payment_failed"
  | "grace_days_remaining"
  | "on_manage_billing"
  | "on_reactivate"
  | "on_renew_with_crypto"
  | "on_add_storage"
>;

export function CurrentPlanNotices({
  subscription,
  is_over_limit,
  is_action_loading,
  has_payment_failed,
  grace_days_remaining,
  on_manage_billing,
  on_reactivate,
  on_renew_with_crypto,
  on_add_storage,
}: CurrentPlanNoticesProps) {
  const { t } = use_i18n();
  const is_paid_plan = !!subscription && subscription.plan.code !== "free";
  const is_crypto = is_crypto_provider(subscription?.payment_provider);
  const decline = subscription?.last_card_decline;
  const paid_until =
    subscription?.paid_until || subscription?.current_period_end || null;

  return (
    <>
      {has_payment_failed && (
        <BillingNotice
          body={
            <>
              <p>
                {decline
                  ? t(card_decline_message_key(decline.reason))
                  : t("settings.payment_failed_warning")}
              </p>
              <p className="mt-1">
                {t("settings.grace_period_remaining", {
                  days: grace_days_remaining,
                })}
              </p>
            </>
          }
          role="alert"
          title={t("settings.card_declined_title")}
          tone="danger"
        >
          <button
            className="aster_btn aster_btn_primary aster_btn_sm"
            disabled={is_action_loading}
            type="button"
            onClick={on_manage_billing}
          >
            {t("settings.update_payment_method")}
          </button>
        </BillingNotice>
      )}

      {is_over_limit && (
        <BillingNotice
          body={t("settings.storage_limit_description")}
          role="alert"
          title={t("settings.storage_limit_exceeded")}
          tone="danger"
        >
          {on_add_storage && (
            <button
              className="aster_btn aster_btn_primary aster_btn_sm"
              type="button"
              onClick={on_add_storage}
            >
              {t("settings.add_storage")}
            </button>
          )}
        </BillingNotice>
      )}

      {is_paid_plan &&
        !is_crypto &&
        subscription.cancel_at_period_end &&
        subscription.current_period_end && (
          <BillingNotice
            body={t("settings.billing_cancel_notice_body", {
              date: format_date(subscription.current_period_end),
            })}
            title={t("settings.billing_cancel_notice_title")}
          >
            <button
              className="aster_btn aster_btn_primary aster_btn_sm"
              disabled={is_action_loading}
              type="button"
              onClick={on_reactivate}
            >
              {t("settings.reactivate")}
            </button>
          </BillingNotice>
        )}

      {is_paid_plan && is_crypto && paid_until && (
        <BillingNotice title={t("settings.crypto_no_renew_notice")}>
          {on_renew_with_crypto && (
            <button
              className="aster_btn aster_btn_primary aster_btn_sm"
              disabled={is_action_loading}
              type="button"
              onClick={on_renew_with_crypto}
            >
              {t("settings.crypto_renew_link")}
            </button>
          )}
        </BillingNotice>
      )}
    </>
  );
}

export function CurrentPlanCard({
  subscription,
  storage_used_bytes,
  storage_limit_bytes,
  storage_percentage,
  is_over_limit,
  is_action_loading,
  has_payment_failed,
  grace_days_remaining,
  current_billing_interval,
  on_scroll_to_plans,
  on_manage_billing,
  on_reactivate,
  on_manage_plan,
  on_renew_with_crypto,
  on_add_storage,
  on_toggle_plans,
  plans_open = false,
  preferred_currency,
  include_notices = true,
  show_storage = true,
}: CurrentPlanCardProps) {
  const { t } = use_i18n();
  const is_paid_plan = !!subscription && subscription.plan.code !== "free";
  const is_crypto = is_crypto_provider(subscription?.payment_provider);
  const interval_suffix =
    current_billing_interval === "biennial"
      ? t("settings.per_two_years")
      : current_billing_interval === "year"
        ? t("settings.per_year_short")
        : t("settings.per_month_short");
  const price_label = is_paid_plan
    ? `${format_price(
        convert_cents(subscription.plan.price_cents, preferred_currency),
        preferred_currency,
      )}${interval_suffix}`
    : `${format_price(0, preferred_currency)}${t("settings.per_month_short")}`;
  const entry_price_label = format_price(
    convert_cents(
      Math.min(...PLAN_TIERS.map((tier) => tier.monthly_cents)),
      preferred_currency,
    ),
    preferred_currency,
  );
  const period_end = subscription?.current_period_end ?? null;
  const paid_until = subscription?.paid_until || period_end;
  let date_label: string | null = null;

  if (is_paid_plan && is_crypto && paid_until) {
    date_label = t("settings.crypto_paid_until", {
      date: format_date(paid_until),
    });
  } else if (is_paid_plan && period_end) {
    date_label = `${
      subscription.cancel_at_period_end
        ? t("settings.cancels")
        : t("settings.renews")
    } ${format_date(period_end)}`;
  }

  return (
    <>
      {include_notices && (
        <CurrentPlanNotices
          grace_days_remaining={grace_days_remaining}
          has_payment_failed={has_payment_failed}
          is_action_loading={is_action_loading}
          is_over_limit={is_over_limit}
          on_add_storage={on_add_storage}
          on_manage_billing={on_manage_billing}
          on_reactivate={on_reactivate}
          on_renew_with_crypto={on_renew_with_crypto}
          subscription={subscription}
        />
      )}

      <section>
        <BillingSectionLabel>
          {t("settings.billing_plan_heading")}
        </BillingSectionLabel>

        <div className="rounded-xl border border-edge-secondary px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4 className="text-xl font-semibold tracking-tight text-txt-primary">
                  {subscription?.plan.name || t("settings.free")}
                </h4>
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-success)" }}
                >
                  {is_paid_plan && subscription.active_discount_description
                    ? subscription.active_discount_description
                    : t("common.active")}
                </span>
              </div>
              <p className="mt-1 text-sm text-txt-secondary">
                {price_label}
                {date_label && (
                  <>
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    {date_label}
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-start gap-1.5 sm:items-end">
              {is_paid_plan ? (
                <button
                  className="aster_btn aster_btn_secondary aster_btn_sm"
                  disabled={is_action_loading}
                  type="button"
                  onClick={on_manage_plan}
                >
                  {t("settings.manage_plan")}
                </button>
              ) : (
                <button
                  className="aster_btn aster_btn_primary aster_btn_sm"
                  type="button"
                  onClick={on_scroll_to_plans}
                >
                  {t("common.upgrade")}
                </button>
              )}
              {is_paid_plan && on_toggle_plans ? (
                <button
                  aria-expanded={plans_open}
                  className="text-xs text-txt-muted transition-colors hover:text-txt-primary"
                  type="button"
                  onClick={on_toggle_plans}
                >
                  {plans_open
                    ? t("settings.billing_hide_plans")
                    : t("settings.compare_plans")}
                </button>
              ) : (
                <p className="text-xs text-txt-muted">
                  {is_paid_plan
                    ? t("settings.manage_plan_description")
                    : t("settings.free_upgrade_price_note", {
                        price: entry_price_label,
                      })}
                </p>
              )}
            </div>
          </div>

          {show_storage && (
            <div className="mt-4 space-y-2 border-t border-edge-secondary pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-txt-muted">
                  {t("settings.storage")}
                </span>
                <span className="text-xs text-txt-secondary">
                  {format_storage(storage_used_bytes)} /{" "}
                  {format_storage(storage_limit_bytes)}
                </span>
              </div>
              <Progress
                className={`h-1.5 ${is_over_limit ? "[&>div]:bg-red-500" : ""}`}
                value={storage_percentage}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
