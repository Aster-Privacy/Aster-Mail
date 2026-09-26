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
import type { ComponentType, SVGProps } from "react";

import {
  ArrowPathIcon,
  CalendarIcon,
  CreditCardIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandDivider,
  IslandRow,
  PillButton,
} from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import {
  format_date,
  format_price,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import {
  convert_cents,
  is_crypto_provider,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import { BillingMeter } from "@/components/settings/billing/billing_meter";

interface BillingHeroCardProps {
  subscription: SubscriptionResponse | null;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percentage: number;
  is_over_limit: boolean;
  is_action_loading: boolean;
  has_payment_failed: boolean;
  current_billing_interval: "month" | "year" | "biennial";
  preferred_currency: string;
  plans_open: boolean;
  on_toggle_plans: () => void;
  on_manage_payment: () => void;
  on_switch_billing: () => void;
  on_reactivate: () => void;
  on_renew_with_crypto: () => void;
  on_add_storage: () => void;
  on_cancel_plan: () => void;
}

function row_icon(Icon: ComponentType<SVGProps<SVGSVGElement>>) {
  return <Icon className="h-[22px] w-[22px]" />;
}

export function BillingHeroCard({
  subscription,
  storage_used_bytes,
  storage_limit_bytes,
  storage_percentage,
  is_over_limit,
  is_action_loading,
  has_payment_failed,
  current_billing_interval,
  preferred_currency,
  plans_open,
  on_toggle_plans,
  on_manage_payment,
  on_switch_billing,
  on_reactivate,
  on_renew_with_crypto,
  on_add_storage,
  on_cancel_plan,
}: BillingHeroCardProps) {
  const { t } = use_i18n();
  const is_paid_plan = !!subscription && subscription.plan.code !== "free";
  const is_crypto = is_crypto_provider(subscription?.payment_provider);
  const cancels = !!subscription?.cancel_at_period_end;
  const period_end = subscription?.current_period_end ?? null;
  const period_start = subscription?.current_period_start ?? null;
  const paid_until = subscription?.paid_until || period_end;
  const tier = PLAN_TIERS.find((entry) => entry.id === subscription?.plan.code);

  const interval_suffix =
    current_billing_interval === "biennial"
      ? t("settings.per_two_years")
      : current_billing_interval === "year"
        ? t("settings.per_year_short")
        : t("settings.per_month_short");
  const price_label = format_price(
    convert_cents(
      is_paid_plan ? subscription.plan.price_cents : 0,
      preferred_currency,
    ),
    preferred_currency,
  );

  let status_text: string;
  let status_color: string;

  if (!is_paid_plan) {
    status_text = t("settings.free_upgrade_price_note", {
      price: format_price(
        convert_cents(
          Math.min(...PLAN_TIERS.map((entry) => entry.monthly_cents)),
          preferred_currency,
        ),
        preferred_currency,
      ),
    });
    status_color = "var(--text-muted)";
  } else if (has_payment_failed) {
    status_text = t("settings.billing_status_attention");
    status_color = "var(--color-danger)";
  } else if (is_crypto && paid_until) {
    status_text = t("settings.crypto_paid_until", {
      date: format_date(paid_until),
    });
    status_color = "var(--color-success)";
  } else if (cancels && period_end) {
    status_text = t("settings.billing_status_ending", {
      date: format_date(period_end),
    });
    status_color = "var(--color-warning)";
  } else if (period_end) {
    status_text = t("settings.billing_status_renews", {
      date: format_date(period_end),
    });
    status_color = "var(--color-success)";
  } else {
    status_text = t("settings.billing_status_active");
    status_color = "var(--color-success)";
  }

  const yearly_save_label =
    tier && !is_crypto && current_billing_interval === "month"
      ? format_price(
          convert_cents(tier.savings_cents, preferred_currency),
          preferred_currency,
        )
      : null;
  const yearly_monthly_label = tier
    ? format_price(
        convert_cents(Math.round(tier.yearly_cents / 12), preferred_currency),
        preferred_currency,
      )
    : null;
  const yearly_total_label = tier
    ? format_price(
        convert_cents(tier.yearly_cents, preferred_currency),
        preferred_currency,
      )
    : null;

  const trailing_spinner = is_action_loading ? (
    <Spinner size="sm" />
  ) : undefined;

  return (
    <Island padding="none">
      <div className="flex flex-col gap-5 px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.billing_plan_heading")}
            </p>
            <h4 className="mt-1 text-[21px] font-bold leading-7 tracking-tight text-txt-primary">
              {subscription?.plan.name || t("settings.free")}
            </h4>
            <p
              className="mt-0.5 text-[13px] font-medium"
              style={{ color: status_color }}
            >
              {status_text}
            </p>
            {is_paid_plan && period_start && (
              <p className="mt-0.5 text-[12.5px] text-txt-muted">
                {t("settings.billing_member_since", {
                  date: format_date(period_start),
                })}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end">
            <p className="flex items-baseline gap-0.5">
              <span className="text-[22px] font-bold tabular-nums leading-7 text-txt-primary">
                {price_label}
              </span>
              <span className="text-[13px] text-txt-muted">
                {interval_suffix}
              </span>
            </p>
            {is_paid_plan && subscription.active_discount_description && (
              <p
                className="mt-0.5 text-end text-[12.5px] font-medium"
                style={{ color: "var(--accent-color)" }}
              >
                {subscription.active_discount_description}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-[15px] font-semibold text-txt-primary">
            {t(
              is_paid_plan
                ? "settings.billing_thanks_title"
                : "settings.billing_thanks_free_title",
            )}
          </p>
          <p className="mt-1 text-[14px] leading-5 text-txt-secondary">
            {t(
              is_paid_plan
                ? "settings.billing_thanks_body"
                : "settings.billing_thanks_free_body",
            )}
          </p>
        </div>

        <BillingMeter
          label={t("settings.storage")}
          limit_bytes={storage_limit_bytes}
          over_limit={is_over_limit}
          percent={storage_percentage}
          trailing={
            <button
              className="text-[12.5px] font-medium hover:underline"
              style={{ color: "var(--accent-color)" }}
              type="button"
              onClick={on_add_storage}
            >
              {t("settings.add_storage")}
            </button>
          }
          used_bytes={storage_used_bytes}
        />

        {is_paid_plan && !is_crypto && cancels && period_end && (
          <div
            className="flex flex-col gap-3 rounded-[var(--aster-radius-field)] p-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-warning) 10%, transparent)",
            }}
          >
            <div>
              <p className="text-[14px] font-semibold text-txt-primary">
                {t("settings.billing_keep_title")}
              </p>
              <p className="mt-0.5 text-[13px] leading-5 text-txt-secondary">
                {t("settings.billing_cancel_notice_body", {
                  date: format_date(period_end),
                })}
              </p>
            </div>
            <PillButton
              className="self-start"
              disabled={is_action_loading}
              size="sm"
              type="button"
              variant="filled"
              onClick={on_reactivate}
            >
              {t("settings.reactivate")}
            </PillButton>
          </div>
        )}

        <div className="flex flex-col items-center gap-2.5">
          <Button
            aria-expanded={plans_open}
            className="w-full sm:w-auto sm:min-w-[220px]"
            size="lg"
            type="button"
            variant={is_paid_plan ? "secondary" : "depth"}
            onClick={on_toggle_plans}
          >
            {plans_open
              ? t("settings.billing_hide_plans")
              : is_paid_plan
                ? t("settings.change_plan")
                : t("common.upgrade")}
          </Button>
          <p className="text-center text-[12px] text-txt-muted">
            {is_paid_plan
              ? t("settings.cancel_anytime")
              : t("settings.billing_upgrade_note")}
          </p>
        </div>
      </div>

      <IslandDivider />

      <div>
        <IslandRow
          description={
            is_crypto
              ? t("settings.checkout_method_crypto")
              : is_paid_plan
                ? t("settings.checkout_method_card")
                : t("settings.payment_methods_description")
          }
          icon={row_icon(CreditCardIcon)}
          label={t("settings.billing_payment_method")}
          on_press={on_manage_payment}
        />

        {is_paid_plan &&
          !is_crypto &&
          !cancels &&
          yearly_save_label &&
          yearly_monthly_label &&
          yearly_total_label && (
            <IslandRow
              chevron={!is_action_loading}
              description={t("settings.billing_switch_yearly_subtitle", {
                monthly: yearly_monthly_label,
                yearly: yearly_total_label,
              })}
              disabled={is_action_loading}
              icon={row_icon(CalendarIcon)}
              label={t("settings.switch_to_yearly")}
              on_press={on_switch_billing}
              trailing={trailing_spinner}
              value={
                <span
                  className="text-[13px] font-medium"
                  style={{ color: "var(--color-success)" }}
                >
                  {t("settings.billing_save_amount", {
                    amount: yearly_save_label,
                  })}
                </span>
              }
            />
          )}

        {is_paid_plan && is_crypto && (
          <IslandRow
            description={t("settings.crypto_no_renew_notice")}
            disabled={is_action_loading}
            icon={row_icon(ArrowPathIcon)}
            label={t("settings.crypto_renew_link")}
            on_press={on_renew_with_crypto}
            trailing={trailing_spinner}
          />
        )}

        {is_paid_plan && !is_crypto && !cancels && (
          <IslandRow
            destructive
            description={t("settings.cancel_plan_warning")}
            disabled={is_action_loading}
            icon={row_icon(XCircleIcon)}
            label={t("settings.cancel_plan")}
            on_press={on_cancel_plan}
          />
        )}
      </div>
    </Island>
  );
}
